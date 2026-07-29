import * as XLSX from 'xlsx'

export interface BdiComponente {
  label: string
  valor: number   // fração decimal (0.11 = 11%)
}

export interface BdiBloco {
  // Modalidade ativa do bloco — A24/A37 da DASHBOARD. Quando 'empreitada' a
  // célula da margem principal exibe "Lucro"; quando 'administracao' exibe
  // "Taxa de Administração". A fórmula de D35 (ou D48) varia por modalidade.
  modalidade: 'empreitada' | 'administracao' | null
  margemComponentes: BdiComponente[]   // Lucro/Taxa Admin + Overhead + Taxa Neg + Custo Financeiro
  impostosComponentes: BdiComponente[] // PIS + COFINS + ISSQN + CPRB
  bdiCalculado: number                 // fração (0.4631 = 46.31%)
  formula?: string                     // fórmula Excel de referência (sanity-check)
}

export interface SuprimentosBloco {
  custoTotal: number   // soma dos materiais por linha (c28 do bloco agregado)
  vendaTotal: number   // venda total dos materiais (c39)
}

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
  // Estrutura completa do BDI (Empreitada vs Administração + componentes
  // editáveis) extraída do bloco DASHBOARD A24/D24–D35. bdiBlock.bdiCalculado
  // é o mesmo valor de `bdi` acima; mantém-se ambos pelo back-compat (callers
  // antigos só lêem `bdi`).
  bdiBlock: BdiBloco | null
  modalidade: 'empreitada' | 'administracao' | null
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

export interface ProfissionalTarefa {
  funcao: string
  hh: number
  custo: number
}

export interface EquipeTarefa {
  item: number
  nome: string
  sigla: string | null
  disciplina: string | null
  totalHH: number
  custoTotal: number
  custoPorHH: number
  // Per-professional/role breakdown from Tarefas block 2 (not summed into
  // totals — block 1 already holds the authoritative HH/custo).
  profissionais?: ProfissionalTarefa[]
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

// Like findCellValueAfterPartial but skips label occurrences whose first adjacent
// non-empty cell is text (not parseable as a number). This avoids returning column
// headers or sibling labels that share the same row as the real value.
function findNumericValueAfter(rows: Cell[][], ...needles: string[]): Cell {
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const cell = String(row[i] ?? '').toLowerCase().trim()
      if (!needles.some((n) => cell.includes(n.toLowerCase()))) continue
      for (let j = i + 1; j < row.length; j++) {
        const v = row[j]
        if (isEmpty(v)) continue
        if (typeof v === 'number') return v
        const s = normalizeNumberString(String(v))
        if (s !== '' && Number.isFinite(parseFloat(s))) return v
        // First non-empty adjacent cell is non-numeric → this occurrence is a
        // header/label row, not a data row. Skip it and keep scanning.
        break
      }
    }
  }
  return null
}

// Find the "Margem Líquida" row and return both the monetary value and the
// percentage from the same row (they appear as separate adjacent cells).
function findMargemLiquida(rows: Cell[][]): { valor: number | null; perc: number | null } {
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (String(row[i] ?? '').toLowerCase().trim() !== 'margem líquida') continue
      let valor: number | null = null
      let perc: number | null = null
      for (let j = i + 1; j < row.length; j++) {
        const v = parseMoeda(row[j])
        if (v === null) continue
        if (v > 1 && valor === null) valor = v
        if (Math.abs(v) <= 1 && perc === null) perc = v
        if (valor !== null && perc !== null) break
      }
      if (valor !== null || perc !== null) return { valor, perc }
    }
  }
  return { valor: null, perc: null }
}

export function extractDashboard(workbook: XLSX.WorkBook): DashboardData {
  const sheet = workbook.Sheets['Dashboard']
  if (!sheet) {
    return {
      cliente: null, projeto: null, unidade: null, municipio: null, uf: null,
      prazoContrato: null, prazoUnidade: null, precoVenda: null, precoPorMes: null,
      hhMOD: null, custoMaoDeObraDireta: null, custoTotal: null,
      margemValor: null, margemPerc: null, impostos: null, bdi: null,
      bdiBlock: null, modalidade: null, areaM2: null,
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

  // "Margem Líquida" row has both the monetary value and percentage as adjacent cells
  const { valor: margemValor, perc: margemPerc } = findMargemLiquida(rows)

  // Area: look for m² label (not present in supervision/management projects)
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
    // "Preço de Venda" appears twice: once as a column header (Row 1, no numeric adj.)
    // and once as a data label (Row 8, numeric adj.). findNumericValueAfter skips the
    // header occurrence and lands on the data row. "Receita Total" is an equivalent
    // label that also holds the correct value.
    precoVenda: parseMoeda(findNumericValueAfter(rows, 'preço de venda', 'receita total')),
    precoPorMes: parseMoeda(findNumericValueAfter(rows, 'preço por mês')),
    hhMOD: parseNumero(findCellValueAfter(rows, 'Horas Normais MOD')),
    custoMaoDeObraDireta: parseMoeda(findCellValueAfter(rows, 'Mão de Obra Direta')),
    custoTotal: parseMoeda(
      findNumericValueAfter(rows, 'custo total', 'custo direto', 'custo do projeto')
    ),
    margemValor,
    margemPerc,
    // "Impostos\n(serviços)" (Row 20) has "PIS" as first adjacent cell (text) so
    // findNumericValueAfter skips it. "Valor Total - Impostos" (Row 25) has the
    // aggregate directly adjacent.
    impostos: parseMoeda(findNumericValueAfter(rows, 'valor total - impostos', 'impostos')),
    bdi: parseNumero(findCellValueAfterPartial(rows, 'bdi')),
    bdiBlock: extractBdiBlock(sheet),
    modalidade: normModalidade(sheet['A24']?.v),
    areaM2: areaVal && areaVal > 1 && areaVal < 5_000_000 ? areaVal : null,
  }
}

// ─── BDI structured block ────────────────────────────────────────────────────
// The DASHBOARD tab encodes the BDI as: a modalidade toggle in A24, four
// component rows for "Margem" (D25..D28), four for "Impostos" (D30..D33), and
// the computed BDI in D35. The Excel formula in D35 branches on A24's value:
//   Empreitada:    (1 / (1 − Σmargem − Σimpostos)) − 1
//   Administração: (1 + Σmargem) / (1 − Σimpostos) − 1
// We capture the components AND the calculated value so the UI can show a
// "Lucro / Taxa Admin" main editable and an "Avançado" expansible.

function normModalidade(v: unknown): 'empreitada' | 'administracao' | null {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return null
  if (/empreit/.test(s)) return 'empreitada'
  if (/administra/.test(s)) return 'administracao'
  return null
}

function readBdiComponente(sheet: XLSX.WorkSheet, row: number): BdiComponente | null {
  const labelCell = sheet[`C${row}`]
  const valorCell = sheet[`D${row}`]
  const label = String(labelCell?.v ?? '').trim()
  const valor = typeof valorCell?.v === 'number' ? valorCell.v : parseFloat(String(valorCell?.v ?? ''))
  if (!label || !Number.isFinite(valor)) return null
  return { label, valor }
}

export function extractBdiBlock(sheet: XLSX.WorkSheet | undefined): BdiBloco | null {
  if (!sheet) return null
  const modalidade = normModalidade(sheet['A24']?.v)
  const margem = [25, 26, 27, 28]
    .map((r) => readBdiComponente(sheet, r))
    .filter((x): x is BdiComponente => x !== null)
  const impostos = [30, 31, 32, 33]
    .map((r) => readBdiComponente(sheet, r))
    .filter((x): x is BdiComponente => x !== null)
  const bdiCell = sheet['D35']
  const bdiCalculado = typeof bdiCell?.v === 'number' ? bdiCell.v : parseFloat(String(bdiCell?.v ?? ''))
  if (margem.length === 0 || impostos.length === 0 || !Number.isFinite(bdiCalculado)) return null
  return {
    modalidade,
    margemComponentes: margem,
    impostosComponentes: impostos,
    bdiCalculado,
    formula: bdiCell?.f ? String(bdiCell.f) : undefined,
  }
}

// ─── Suprimentos / Materiais (Tarefas aggregate row) ─────────────────────────
// Tarefas has a "Suprimentos" group header alongside "Valor de Serviços". The
// per-item totals (custo & venda) for materials live in the same aggregate row
// that holds the labor HH total — distinguishable because col 28 ("Custo Total"
// of materials) and col 39 ("Venda Total" of materials) are pre-summed there.
// Positions are fixed by the Metodo Pricing template; we still scan to find
// the row in case of minor offsets.
export function extractSuprimentos(workbook: XLSX.WorkBook): SuprimentosBloco | null {
  const sheet = workbook.Sheets['Tarefas']
  if (!sheet) return null
  const rows = sheetToRows(sheet)
  let headerRow = -1
  for (let r = 0; r < rows.length; r++) {
    if ((rows[r] ?? []).some((c) => String(c ?? '').trim() === 'Suprimentos')) {
      headerRow = r
      break
    }
  }
  if (headerRow < 0) return null
  for (let r = headerRow + 1; r < Math.min(headerRow + 15, rows.length); r++) {
    const row = rows[r] ?? []
    const hh = typeof row[14] === 'number' ? (row[14] as number) : NaN
    const custoMat = typeof row[28] === 'number' ? (row[28] as number) : NaN
    const vendaMat = typeof row[39] === 'number' ? (row[39] as number) : NaN
    if (Number.isFinite(hh) && hh > 0 && Number.isFinite(custoMat)) {
      return {
        custoTotal: custoMat,
        vendaTotal: Number.isFinite(vendaMat) ? vendaMat : 0,
      }
    }
  }
  return null
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

  let block2Start = rows.length
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    // Second header row: belt-and-suspenders stop (some files have a new header)
    if (row.some((c) => String(c ?? '').trim() === 'Descrição da Equipe')) { block2Start = r; break }
    const itemRaw = cols.item >= 0 ? row[cols.item] : null
    const item = typeof itemRaw === 'number' ? itemRaw : parseNumero(itemRaw)
    const descricao = row[cols.descricao]
    if (item === null || isEmpty(descricao)) {
      // A row with no description but a positive HH value is the block-1 grand-total row.
      // It marks the boundary between team-aggregate block 1 and the individual-function
      // breakdown block 2 (which duplicates the same hours). Stop here.
      const hhRaw = cols.hhTotal >= 0 ? row[cols.hhTotal] : null
      const hhNum = typeof hhRaw === 'number' ? hhRaw : parseFloat(String(hhRaw ?? '').replace(',', '.'))
      if (Number.isFinite(hhNum) && hhNum > 0) { block2Start = r; break }
      continue
    }
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

  // ── Block 2: per-equipe breakdown (roles/activities) ──────────────────────
  // Block 2 consistently has columns "Equipe", "Descrição", "HH Total" and
  // "Custo Total" (col positions vary, so locate by label). We group its data
  // rows by the equipe sigla and attach the breakdown WITHOUT touching block-1
  // totals. Where block 2 is absent/empty, profissionais stays undefined.
  attachProfissionais(rows, block2Start, equipes)

  return equipes
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function attachProfissionais(rows: Cell[][], start: number, equipes: EquipeTarefa[]): void {
  if (start >= rows.length || equipes.length === 0) return

  // Find block-2 header: a row that has both an "Equipe" cell and an "HH Total" cell.
  let h = -1
  let cEq = -1, cDesc = -1, cHH = -1, cCusto = -1
  for (let r = start; r < Math.min(start + 25, rows.length); r++) {
    const row = rows[r]
    let eq = -1, desc = -1, hh = -1, cu = -1
    for (let c = 0; c < row.length; c++) {
      const v = norm(String(row[c] ?? ''))
      if (eq < 0 && v === 'equipe') eq = c
      else if (desc < 0 && v === 'descricao') desc = c
      else if (hh < 0 && (v === 'hh total' || v === 'hh total por equipe')) hh = c
      else if (cu < 0 && (v === 'custo total' || v === 'custo total por equipe')) cu = c
    }
    if (eq >= 0 && hh >= 0) { h = r; cEq = eq; cDesc = desc; cHH = hh; cCusto = cu; break }
  }
  if (h < 0) return

  // sigla → (funcao → {hh,custo})
  const bySigla = new Map<string, Map<string, { hh: number; custo: number }>>()
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r]
    const sigla = cEq >= 0 ? String(row[cEq] ?? '').trim() : ''
    if (!sigla) continue
    if (String(row[cEq]).trim() === 'Descrição da Equipe') break // another block
    const hh = parseNumero(cHH >= 0 ? row[cHH] : null) ?? 0
    if (hh <= 0) continue
    const funcao = cDesc >= 0 ? String(row[cDesc] ?? '').trim() : ''
    if (!funcao) continue
    const custo = parseMoeda(cCusto >= 0 ? row[cCusto] : null) ?? 0
    if (!bySigla.has(sigla)) bySigla.set(sigla, new Map())
    const m = bySigla.get(sigla)!
    const prev = m.get(funcao) ?? { hh: 0, custo: 0 }
    m.set(funcao, { hh: prev.hh + hh, custo: prev.custo + custo })
  }
  if (bySigla.size === 0) return

  for (const e of equipes) {
    const key = e.sigla ?? ''
    const m = bySigla.get(key) ?? bySigla.get(norm(key)) ?? null
    if (!m) continue
    const profs = [...m.entries()]
      .map(([funcao, v]) => ({ funcao, hh: Math.round(v.hh * 100) / 100, custo: Math.round(v.custo * 100) / 100 }))
      .sort((a, b) => b.hh - a.hh)
      .slice(0, 30)
    if (profs.length) e.profissionais = profs
  }
}

export function readPricingWorkbook(filePath: string): XLSX.WorkBook {
  return XLSX.readFile(filePath, { cellDates: false, cellNF: false, cellFormula: false })
}

/** Same options as readPricingWorkbook, but for buffers held in memory
 * (avoids the disk round-trip when we download from Graph). */
export function readPricingWorkbookFromBuffer(buf: Buffer): XLSX.WorkBook {
  return XLSX.read(buf, { type: 'buffer', cellDates: false, cellNF: false, cellFormula: false })
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
