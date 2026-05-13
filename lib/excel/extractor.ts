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
  custoTotal: number | null
  margemValor: number | null
  margemPerc: number | null
  impostos: number | null
  bdi: number | null
  areaM2: number | null
}

export interface PPUItem {
  item: number
  descricao: string
  unidade: string
  qtd: number
  precoUnit: number
  precoTotal: number
}

export interface PPUCategoria {
  item: number
  nome: string
  total: number
  itens: PPUItem[]
}

export interface PPUData {
  itens: PPUItem[]
  categorias: PPUCategoria[]
  totalGeral: number | null
  mobilizacao: number | null
  despesasOperacionais: number | null
  maoDeObra: number | null
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
    s = s.replace(',', '.')
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

function findCellValueAfter(rows: Cell[][], label: string, headerSiblings: string[] = []): Cell {
  const labelNorm = label.toLowerCase().trim()
  const siblingsNorm = headerSiblings.map((s) => s.toLowerCase().trim())

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    for (let i = 0; i < row.length; i++) {
      if (String(row[i] ?? '').toLowerCase().trim() !== labelNorm) continue

      // Try the immediately adjacent cell to the right
      const right = row[i + 1]
      const rightStr = String(right ?? '').toLowerCase().trim()
      const rightIsSibling = rightStr !== '' && siblingsNorm.includes(rightStr)

      if (!isEmpty(right) && !rightIsSibling) {
        return right
      }

      // Otherwise look directly below (column-header layout)
      if (r + 1 < rows.length) {
        const below = rows[r + 1]
        if (i < below.length && !isEmpty(below[i])) return below[i]
      }

      // Last resort: scan a couple of cells further right, skipping siblings
      for (let j = i + 2; j < Math.min(i + 5, row.length); j++) {
        if (isEmpty(row[j])) continue
        const next = String(row[j]).toLowerCase().trim()
        if (siblingsNorm.includes(next)) continue
        return row[j]
      }
    }
  }
  return null
}

function findRowWithLabel(rows: Cell[][], label: string): { row: Cell[]; col: number } | null {
  const labelNorm = label.toLowerCase().trim()
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (String(row[i] ?? '').toLowerCase().trim() === labelNorm) {
        return { row, col: i }
      }
    }
  }
  return null
}

// Search for a label with partial/flexible matching
function findCellValueAfterPartial(rows: Cell[][], ...needles: string[]): Cell {
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const cell = String(row[i] ?? '').toLowerCase().trim()
      if (needles.some((n) => cell.includes(n.toLowerCase()))) {
        for (let j = i + 1; j < row.length; j++) {
          if (!isEmpty(row[j])) return row[j]
        }
      }
    }
  }
  return null
}

export function extractDashboard(workbook: XLSX.WorkBook): DashboardData {
  const sheet = workbook.Sheets['Dashboard']
  if (!sheet) {
    return {
      cliente: null, projeto: null, unidade: null, municipio: null, uf: null,
      prazoContrato: null, prazoUnidade: null, precoVenda: null, precoPorMes: null,
      hhMOD: null, custoMaoDeObraDireta: null, custoTotal: null,
      margemValor: null, margemPerc: null, impostos: null, bdi: null, areaM2: null,
    }
  }

  const rows = sheetToRows(sheet)

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

  // Margin: try both percentage and value forms
  const margemRaw = findCellValueAfterPartial(rows, 'margem líquida', 'margem')
  const margemVal = parseMoeda(margemRaw)
  const margemPerc = margemVal !== null && Math.abs(margemVal) <= 1 ? margemVal : null
  const margemValor = margemVal !== null && Math.abs(margemVal) > 1 ? margemVal : null

  // Area: look for m² label
  const areaRaw = findCellValueAfterPartial(rows, 'área', 'area total', 'm²', 'metragem')
  const areaVal = parseNumero(areaRaw)

  return {
    cliente: String(findCellValueAfter(rows, 'Cliente') ?? '').trim() || null,
    projeto: String(findCellValueAfter(rows, 'Projeto') ?? '').trim() || null,
    unidade: String(findCellValueAfter(rows, 'Unidade') ?? '').trim() || null,
    municipio: String(findCellValueAfter(rows, 'Município', ['uf', 'estado', 'cidade']) ?? '').trim() || null,
    uf: String(findCellValueAfter(rows, 'UF', ['município', 'cidade', 'estado']) ?? '').trim() || null,
    prazoContrato,
    prazoUnidade,
    precoVenda: parseMoeda(findCellValueAfter(rows, 'Preço de Venda')),
    precoPorMes: parseMoeda(findCellValueAfter(rows, 'Preço por Mês')),
    hhMOD: parseNumero(findCellValueAfter(rows, 'Horas Normais MOD')),
    custoMaoDeObraDireta: parseMoeda(findCellValueAfter(rows, 'Mão de Obra Direta')),
    custoTotal: parseMoeda(
      findCellValueAfterPartial(rows, 'custo total', 'custo direto', 'custo do projeto')
    ),
    margemValor,
    margemPerc,
    impostos: parseMoeda(findCellValueAfterPartial(rows, 'impostos', 'imposto', 'iss', 'pis/cofins')),
    bdi: parseNumero(findCellValueAfterPartial(rows, 'bdi')),
    areaM2: areaVal && areaVal > 1 && areaVal < 5_000_000 ? areaVal : null,
  }
}

// Parse item code from cell: handles both numeric (1, 1.1) and string ("1", "1.1", "1.1.2")
function parseItemNumber(v: Cell): { value: number; isTop: boolean } | null {
  if (typeof v === 'number') {
    if (v <= 0) return null
    return { value: v, isTop: Number.isInteger(v) }
  }
  if (typeof v === 'string') {
    const s = v.trim()
    if (!/^\d+(\.\d+)*\.?$/.test(s)) return null
    const parts = s.replace(/\.$/, '').split('.')
    const top = parseInt(parts[0], 10)
    if (!Number.isFinite(top) || top <= 0) return null
    if (parts.length === 1) return { value: top, isTop: true }
    const sub = parseInt(parts[1], 10)
    return { value: top + sub / 100, isTop: false }
  }
  return null
}

export function extractPPU(workbook: XLSX.WorkBook): PPUData {
  const sheet = workbook.Sheets['PPU']
  if (!sheet) {
    return { itens: [], categorias: [], totalGeral: null, mobilizacao: null, despesasOperacionais: null, maoDeObra: null }
  }

  const rows = sheetToRows(sheet)
  const itens: PPUItem[] = []
  const categorias: PPUCategoria[] = []
  let currentCategoria: PPUCategoria | null = null
  let totalGeral: number | null = null

  for (const row of rows) {
    const descricao = row[1]
    const info = parseItemNumber(row[0])

    // Total row: e.g. [null, null, null, null, "Total", 1753418.55, ...]
    if (isEmpty(descricao)) {
      for (let i = 0; i < row.length; i++) {
        if (String(row[i] ?? '').trim().toLowerCase() === 'total') {
          for (let j = i + 1; j < row.length; j++) {
            const val = parseMoeda(row[j])
            if (val !== null && val > 0) { totalGeral = val; break }
          }
          break
        }
      }
      continue
    }

    const qtd = parseNumero(row[3]) ?? 0
    const precoUnit = parseMoeda(row[4]) ?? 0
    const precoTotal = parseMoeda(row[5]) ?? 0

    // Category header: item col has a top-level integer, no qty, no unit price
    // (precoTotal may contain a subtotal shown on the category row itself)
    if (info && info.isTop && qtd === 0 && precoUnit === 0) {
      currentCategoria = {
        item: info.value,
        nome: String(descricao).trim(),
        total: precoTotal,
        itens: [],
      }
      categorias.push(currentCategoria)
      continue
    }

    // Line item: any row with a description AND a price.
    // In Brazilian budgets, sub-items often have an empty Item column and
    // belong to the most recently seen category.
    if (precoTotal === 0 && precoUnit === 0) continue
    // Skip stray "Total" rows that happen to also have a description
    if (String(descricao).trim().toLowerCase() === 'total') continue

    const ppu: PPUItem = {
      item: info?.value ?? (currentCategoria ? currentCategoria.itens.length + 1 : 0),
      descricao: String(descricao).trim(),
      unidade: String(row[2] ?? '').trim(),
      qtd,
      precoUnit,
      precoTotal,
    }
    itens.push(ppu)
    if (currentCategoria) currentCategoria.itens.push(ppu)
  }

  // Fill missing category totals from line items
  for (const cat of categorias) {
    if (cat.total === 0 && cat.itens.length > 0) {
      cat.total = cat.itens.reduce((s, it) => s + it.precoTotal, 0)
    }
  }

  // Aggregate well-known category buckets
  function catSum(...keywords: string[]): number | null {
    const total = categorias
      .filter((c) => keywords.some((k) => c.nome.toLowerCase().includes(k.toLowerCase())))
      .reduce((s, c) => s + c.total, 0)
    return total > 0 ? total : null
  }

  return {
    itens,
    categorias,
    totalGeral,
    mobilizacao: catSum('mobiliz', 'desmobiliz'),
    despesasOperacionais: catSum('despesa', 'operacional', 'overhead'),
    maoDeObra: catSum('mão de obra', 'mao de obra', 'equipe', 'pessoal'),
  }
}

export function extractTarefas(workbook: XLSX.WorkBook): EquipeTarefa[] {
  const sheet = workbook.Sheets['Tarefas']
  if (!sheet) return []

  const rows = sheetToRows(sheet)
  const equipes: EquipeTarefa[] = []

  let headerRowIdx = -1
  let cols = { item: -1, descricao: -1, sigla: -1, disciplina: -1, hhTotal: -1, custoTotal: -1, custoHora: -1 }

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
    // A second "Descrição da Equipe" row marks the individual-function breakdown block —
    // which duplicates the team-aggregate totals already in block 1. Stop here.
    if (row.some((c) => String(c ?? '').trim() === 'Descrição da Equipe')) break
    const itemRaw = cols.item >= 0 ? row[cols.item] : null
    const item = typeof itemRaw === 'number' ? itemRaw : parseNumero(itemRaw)
    const descricao = row[cols.descricao]
    if (item === null || isEmpty(descricao)) continue
    const totalHH = parseNumero(cols.hhTotal >= 0 ? row[cols.hhTotal] : null) ?? 0
    if (totalHH <= 0) continue
    const custoTotal = parseMoeda(cols.custoTotal >= 0 ? row[cols.custoTotal] : null) ?? 0
    // Derive custoPorHH from custoTotal/totalHH — the Excel column "Custo da Hora por Disciplina"
    // can hold a discipline rate (tarifa) that doesn't match the actual cost breakdown, leading
    // to inconsistent data. Computing it ensures totalHH × custoPorHH === custoTotal.
    const custoPorHH = totalHH > 0 ? custoTotal / totalHH : 0
    equipes.push({
      item,
      nome: String(descricao).trim(),
      sigla: cols.sigla >= 0 && !isEmpty(row[cols.sigla]) ? String(row[cols.sigla]).trim() : null,
      disciplina: cols.disciplina >= 0 && !isEmpty(row[cols.disciplina]) ? String(row[cols.disciplina]).trim() : null,
      totalHH,
      custoTotal,
      custoPorHH,
    })
  }

  return equipes
}

export function readPricingWorkbook(filePath: string): XLSX.WorkBook {
  return XLSX.readFile(filePath, { cellDates: false, cellNF: false, cellFormula: false })
}

// Extract all text from a workbook as CSV per sheet (for non-Pricing files)
export function extractWorkbookText(wb: XLSX.WorkBook): string {
  const parts: string[] = []
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    if (csv.trim()) parts.push(`--- Aba: ${name} ---\n${csv}`)
  }
  return parts.join('\n\n')
}

// m² extraction from free text
export function extractAreaM2(text: string): number | null {
  if (!text) return null
  const patterns = [
    /área\s+(?:total\s+)?(?:construída\s+)?(?:de\s+)?([\d.,]+)\s*m[²2]/gi,
    /([\d.,]+)\s*m[²2]\s*(?:de\s+)?(?:área|construção|construída|construida|terreno)/gi,
    /metragem\s+(?:total\s+)?(?:de\s+)?([\d.,]+)/gi,
  ]
  for (const pattern of patterns) {
    const m = pattern.exec(text)
    if (m) {
      const raw = m[1].replace(/\./g, '').replace(',', '.')
      const n = parseFloat(raw)
      if (Number.isFinite(n) && n > 5 && n < 2_000_000) return n
    }
  }
  return null
}
