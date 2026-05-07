import * as XLSX from 'xlsx'

export interface DashboardData {
  cliente: string | null
  projeto: string | null
  unidade: string | null
  municipio: string | null
  uf: string | null
  prazoContrato: number | null
  prazoUnidade: string | null
  precoVenda: number | null
  precoPorMes: number | null
  hhMOD: number | null
  custoMaoDeObraDireta: number | null
}

export interface PPUItem {
  item: number
  descricao: string
  unidade: string
  qtd: number
  precoUnit: number
  precoTotal: number
}

export interface PPUData {
  itens: PPUItem[]
  totalGeral: number | null
}

export interface EquipeTarefa {
  item: number
  nome: string
  sigla: string | null
  disciplina: string | null
  totalHH: number
  custoTotal: number
  custoPorHH: number
}

type Cell = string | number | null | undefined

function sheetToRows(sheet: XLSX.WorkSheet): Cell[][] {
  return XLSX.utils.sheet_to_json<Cell[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true,
  })
}

function isEmpty(v: Cell): boolean {
  if (v === null || v === undefined) return true
  const s = String(v).trim()
  return s === '' || s === '-' || s === 'R$ -'
}

function normalizeNumberString(raw: string): string {
  let s = raw.replace(/[R$\s%"]/g, '')
  if (s === '' || s === '-') return ''
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (lastComma >= 0) {
    const afterComma = s.length - lastComma - 1
    if (afterComma === 3 && !/^[\-+]?[0-9]{1,3},[0-9]{3}$/.test(s)) {
      s = s.replace(',', '.')
    } else {
      s = s.replace(',', '.')
    }
  }
  return s
}

function parseMoeda(v: Cell): number | null {
  if (isEmpty(v)) return null
  if (typeof v === 'number') return v
  const s = normalizeNumberString(String(v))
  if (s === '') return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function parseNumero(v: Cell): number | null {
  if (isEmpty(v)) return null
  if (typeof v === 'number') return v
  const s = normalizeNumberString(String(v))
  if (s === '') return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function findCellValueAfter(rows: Cell[][], label: string): Cell {
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (String(row[i] ?? '').trim() === label) {
        for (let j = i + 1; j < row.length; j++) {
          if (!isEmpty(row[j])) return row[j]
        }
      }
    }
  }
  return null
}

function findRowWithLabel(rows: Cell[][], label: string): { row: Cell[]; col: number } | null {
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (String(row[i] ?? '').trim() === label) {
        return { row, col: i }
      }
    }
  }
  return null
}

export function extractDashboard(workbook: XLSX.WorkBook): DashboardData {
  const sheet = workbook.Sheets['Dashboard']
  if (!sheet) {
    return {
      cliente: null,
      projeto: null,
      unidade: null,
      municipio: null,
      uf: null,
      prazoContrato: null,
      prazoUnidade: null,
      precoVenda: null,
      precoPorMes: null,
      hhMOD: null,
      custoMaoDeObraDireta: null,
    }
  }

  const rows = sheetToRows(sheet)

  const cliente = findCellValueAfter(rows, 'Cliente')
  const projeto = findCellValueAfter(rows, 'Projeto')
  const unidade = findCellValueAfter(rows, 'Unidade')
  const municipio = findCellValueAfter(rows, 'Município')
  const uf = findCellValueAfter(rows, 'UF')

  const prazoLoc = findRowWithLabel(rows, 'Prazo do Contrato')
  let prazoContrato: number | null = null
  let prazoUnidade: string | null = null
  if (prazoLoc) {
    const after: Cell[] = []
    for (let j = prazoLoc.col + 1; j < prazoLoc.row.length; j++) {
      if (!isEmpty(prazoLoc.row[j])) after.push(prazoLoc.row[j])
    }
    if (after.length > 0) prazoContrato = parseNumero(after[0])
    if (after.length > 1) prazoUnidade = String(after[1] ?? '').trim() || null
  }

  return {
    cliente: cliente ? String(cliente).trim() : null,
    projeto: projeto ? String(projeto).trim() : null,
    unidade: unidade ? String(unidade).trim() : null,
    municipio: municipio ? String(municipio).trim() : null,
    uf: uf ? String(uf).trim() : null,
    prazoContrato,
    prazoUnidade,
    precoVenda: parseMoeda(findCellValueAfter(rows, 'Preço de Venda')),
    precoPorMes: parseMoeda(findCellValueAfter(rows, 'Preço por Mês')),
    hhMOD: parseNumero(findCellValueAfter(rows, 'Horas Normais MOD')),
    custoMaoDeObraDireta: parseMoeda(findCellValueAfter(rows, 'Mão de Obra Direta')),
  }
}

export function extractPPU(workbook: XLSX.WorkBook): PPUData {
  const sheet = workbook.Sheets['PPU']
  if (!sheet) return { itens: [], totalGeral: null }

  const rows = sheetToRows(sheet)
  const itens: PPUItem[] = []
  let totalGeral: number | null = null

  for (const row of rows) {
    const first = row[0]
    if (typeof first === 'number' && first > 0) {
      const descricao = row[1]
      if (isEmpty(descricao)) continue
      const qtd = parseNumero(row[3]) ?? 0
      const precoUnit = parseMoeda(row[4]) ?? 0
      const precoTotal = parseMoeda(row[5]) ?? 0
      if (precoUnit === 0 && precoTotal === 0) continue
      itens.push({
        item: first,
        descricao: String(descricao).trim(),
        unidade: String(row[2] ?? '').trim(),
        qtd,
        precoUnit,
        precoTotal,
      })
    } else {
      for (let i = 0; i < row.length; i++) {
        if (String(row[i] ?? '').trim() === 'Total') {
          for (let j = i + 1; j < row.length; j++) {
            const val = parseMoeda(row[j])
            if (val !== null && val > 0) {
              totalGeral = val
              break
            }
          }
        }
      }
    }
  }

  return { itens, totalGeral }
}

export function extractTarefas(workbook: XLSX.WorkBook): EquipeTarefa[] {
  const sheet = workbook.Sheets['Tarefas']
  if (!sheet) return []

  const rows = sheetToRows(sheet)
  const equipes: EquipeTarefa[] = []

  let headerRowIdx = -1
  let cols = {
    item: -1,
    descricao: -1,
    sigla: -1,
    disciplina: -1,
    hhTotal: -1,
    custoTotal: -1,
    custoHora: -1,
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] ?? '').trim()
      if (v === 'Descrição da Equipe') {
        headerRowIdx = r
        cols.descricao = c
        for (let j = 0; j < row.length; j++) {
          const lbl = String(row[j] ?? '').trim()
          if (lbl === 'Item') cols.item = j
          else if (lbl === 'Sigla') cols.sigla = j
          else if (lbl === 'Disciplina') cols.disciplina = j
          else if (lbl === 'HH Total por equipe') cols.hhTotal = j
          else if (lbl === 'Custo Total por Equipe') cols.custoTotal = j
          else if (lbl === 'Custo da Hora por Disciplina') cols.custoHora = j
        }
        break
      }
    }
    if (headerRowIdx >= 0) break
  }

  if (headerRowIdx < 0 || cols.descricao < 0) return []

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const itemRaw = cols.item >= 0 ? row[cols.item] : null
    const item = typeof itemRaw === 'number' ? itemRaw : parseNumero(itemRaw)
    const descricao = row[cols.descricao]
    if (item === null || isEmpty(descricao)) continue

    const totalHH = parseNumero(cols.hhTotal >= 0 ? row[cols.hhTotal] : null) ?? 0
    if (totalHH <= 0) continue

    equipes.push({
      item,
      nome: String(descricao).trim(),
      sigla: cols.sigla >= 0 && !isEmpty(row[cols.sigla]) ? String(row[cols.sigla]).trim() : null,
      disciplina:
        cols.disciplina >= 0 && !isEmpty(row[cols.disciplina])
          ? String(row[cols.disciplina]).trim()
          : null,
      totalHH,
      custoTotal: parseMoeda(cols.custoTotal >= 0 ? row[cols.custoTotal] : null) ?? 0,
      custoPorHH: parseMoeda(cols.custoHora >= 0 ? row[cols.custoHora] : null) ?? 0,
    })
  }

  return equipes
}

export function readPricingWorkbook(filePath: string): XLSX.WorkBook {
  return XLSX.readFile(filePath, { cellDates: false, cellNF: false, cellFormula: false })
}
