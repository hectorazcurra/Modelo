/**
 * Diagnostic script — runs all extractors against a single Pricing XLSX and
 * prints a detailed report so you can validate every field against the actual
 * spreadsheet.
 *
 * Usage:
 *   npx tsx scripts/diagnose-extrator.ts <path-to-Pricing.xlsx>
 *
 * Example:
 *   npx tsx scripts/diagnose-extrator.ts \
 *     "/var/lib/metodo/arquivos/2026-037 SCALA DATA CENTERS/02. Orçamento/Rev.2/Pricing_2026-037.xlsx"
 */

import * as fs from 'node:fs'
import * as XLSX from 'xlsx'
import {
  readPricingWorkbook,
  extractDashboard,
  extractPPU,
  extractTarefas,
} from '../lib/excel/extractor'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function hr(char = '─', n = 80) { return char.repeat(n) }

function getHiddenRows(sheet: XLSX.WorkSheet): Set<number> {
  const hidden = new Set<number>()
  const rowMeta = (sheet['!rows'] ?? []) as Array<{ hidden?: boolean; outlineLevel?: number } | undefined>
  for (let i = 0; i < rowMeta.length; i++) {
    if (rowMeta[i]?.hidden) hidden.add(i) // 0-based row index
  }
  return hidden
}

function getColWidths(sheet: XLSX.WorkSheet): Map<number, { hidden?: boolean }> {
  const m = new Map<number, { hidden?: boolean }>()
  const colMeta = (sheet['!cols'] ?? []) as Array<{ hidden?: boolean } | undefined>
  for (let i = 0; i < colMeta.length; i++) {
    if (colMeta[i]) m.set(i, colMeta[i] as { hidden?: boolean })
  }
  return m
}

function sheetAllRows(sheet: XLSX.WorkSheet): Array<{ rowIdx: number; hidden: boolean; cells: unknown[] }> {
  // Use raw sheet_to_json but keep track of actual row numbers
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
  const hiddenRows = getHiddenRows(sheet)
  const result: Array<{ rowIdx: number; hidden: boolean; cells: unknown[] }> = []

  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells: unknown[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = sheet[addr]
      cells.push(cell ? cell.v ?? null : null)
    }
    result.push({ rowIdx: r, hidden: hiddenRows.has(r), cells })
  }
  return result
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const filePath = process.argv[2]
if (!filePath) {
  console.error('Uso: npx tsx scripts/diagnose-extrator.ts <caminho-para-Pricing.xlsx>')
  process.exit(1)
}
if (!fs.existsSync(filePath)) {
  console.error(`Arquivo não encontrado: ${filePath}`)
  process.exit(1)
}

console.log(hr('═'))
console.log(`DIAGNÓSTICO DE EXTRATOR`)
console.log(`Arquivo: ${filePath}`)
console.log(hr('═'))

const wb = readPricingWorkbook(filePath)

// ── 1. Sheet inventory ────────────────────────────────────────────────────────
console.log('\n📋 SHEETS NO ARQUIVO:')
for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name]
  const range = sheet['!ref'] ?? 'vazio'
  const hiddenRows = getHiddenRows(sheet)
  const cols = getColWidths(sheet)
  const hiddenCols = [...cols.entries()].filter(([, v]) => v.hidden).length
  console.log(
    `  • "${name}"  range=${range}` +
    (hiddenRows.size ? `  ⚠ LINHAS OCULTAS: ${hiddenRows.size} (rows ${[...hiddenRows].slice(0, 10).map(r => r+1).join(',')})` : '') +
    (hiddenCols ? `  ⚠ COLS OCULTAS: ${hiddenCols}` : '')
  )
}

// ── 2. Dashboard ──────────────────────────────────────────────────────────────
console.log('\n' + hr())
console.log('📊 DASHBOARD — dados extraídos:')
const dash = extractDashboard(wb)
const dashFields: [string, unknown][] = [
  ['Cliente',          dash.cliente],
  ['Projeto',          dash.projeto],
  ['Unidade',          dash.unidade],
  ['Município',        dash.municipio],
  ['UF',               dash.uf],
  ['Prazo (contrato)', dash.prazoContrato],
  ['Prazo (unidade)',  dash.prazoUnidade],
  ['Preço de Venda',   dash.precoVenda != null ? brl(dash.precoVenda) : null],
  ['Preço por Mês',    dash.precoPorMes != null ? brl(dash.precoPorMes) : null],
  ['HH MOD',           dash.hhMOD],
  ['Custo MO Direta',  dash.custoMaoDeObraDireta != null ? brl(dash.custoMaoDeObraDireta) : null],
  ['Custo Total',      dash.custoTotal != null ? brl(dash.custoTotal) : null],
  ['Margem Valor',     dash.margemValor != null ? brl(dash.margemValor) : null],
  ['Margem %',         dash.margemPerc != null ? `${(dash.margemPerc * 100).toFixed(2)}%` : null],
  ['Impostos',         dash.impostos != null ? brl(dash.impostos) : null],
  ['BDI',              dash.bdi != null ? `${(dash.bdi * 100).toFixed(2)}%` : null],
  ['Área m²',          dash.areaM2],
]
for (const [label, val] of dashFields) {
  const status = val == null ? '❌ NÃO ENCONTRADO' : `✅ ${val}`
  console.log(`  ${label.padEnd(20)} ${status}`)
}

// ── 3. Dashboard raw rows (first 60) ─────────────────────────────────────────
if (wb.Sheets['Dashboard']) {
  const sheet = wb.Sheets['Dashboard']
  const allRows = sheetAllRows(sheet)
  const hiddenRows = getHiddenRows(sheet)
  if (hiddenRows.size > 0) {
    console.log(`\n  ⚠ Dashboard tem ${hiddenRows.size} linhas ocultas:`)
    for (const r of [...hiddenRows].slice(0, 20)) {
      const row = allRows.find(x => x.rowIdx === r)
      if (row) {
        const nonNull = row.cells.filter(c => c != null && String(c).trim() !== '')
        console.log(`    Linha ${r+1}: ${nonNull.slice(0, 6).map(v => JSON.stringify(v)).join(' | ')}`)
      }
    }
  }
}

// ── 4. PPU ────────────────────────────────────────────────────────────────────
console.log('\n' + hr())
const ppu = extractPPU(wb)
console.log(`📦 PPU — ${ppu.categorias.length} categorias, ${ppu.itens.length} itens`)
console.log(`   Total geral extraído: ${ppu.totalGeral != null ? brl(ppu.totalGeral) : '❌ não encontrado'}`)
console.log(`   Mobilização:          ${ppu.mobilizacao != null ? brl(ppu.mobilizacao) : '-'}`)
console.log(`   Despesas Operac.:     ${ppu.despesasOperacionais != null ? brl(ppu.despesasOperacionais) : '-'}`)
console.log(`   Mão de Obra:          ${ppu.maoDeObra != null ? brl(ppu.maoDeObra) : '-'}`)
console.log()
for (const cat of ppu.categorias) {
  const recalc = cat.itens.reduce((s, i) => s + i.precoTotal, 0)
  const match = Math.abs(recalc - cat.total) < 1 ? '✅' : `⚠ soma_itens=${brl(recalc)}`
  console.log(`  [${cat.item}] ${cat.nome.slice(0, 45).padEnd(45)} ${brl(cat.total).padStart(18)}  ${match}`)
  for (const item of cat.itens.slice(0, 5)) {
    console.log(`        ${item.descricao.slice(0, 50)} | ${item.qtd} ${item.unidade} × ${brl(item.precoUnit)} = ${brl(item.precoTotal)}`)
  }
  if (cat.itens.length > 5) console.log(`        ... +${cat.itens.length - 5} itens`)
}

// Show hidden rows in PPU sheet
if (wb.Sheets['PPU']) {
  const sheet = wb.Sheets['PPU']
  const allRows = sheetAllRows(sheet)
  const hiddenRows = getHiddenRows(sheet)
  if (hiddenRows.size > 0) {
    console.log(`\n  ⚠ PPU tem ${hiddenRows.size} linhas ocultas:`)
    for (const r of [...hiddenRows].slice(0, 20)) {
      const row = allRows.find(x => x.rowIdx === r)
      if (row) {
        const nonNull = row.cells.filter(c => c != null && String(c).trim() !== '')
        if (nonNull.length) {
          console.log(`    Linha ${r+1}: ${nonNull.slice(0, 6).map(v => JSON.stringify(v)).join(' | ')}`)
        }
      }
    }
  }
}

// ── 5. Tarefas ────────────────────────────────────────────────────────────────
console.log('\n' + hr())
const equipes = extractTarefas(wb)
console.log(`👥 TAREFAS — ${equipes.length} equipes extraídas`)
const totalHH    = equipes.reduce((s, e) => s + e.totalHH, 0)
const totalCusto = equipes.reduce((s, e) => s + e.custoTotal, 0)
console.log(`   Total HH:    ${Math.round(totalHH * 100) / 100}h`)
console.log(`   Total Custo: ${brl(totalCusto)}`)
console.log()
console.log(`  ${'Equipe'.padEnd(35)} ${'HH'.padStart(10)} ${'Custo'.padStart(15)} ${'R$/h'.padStart(10)}`)
console.log(`  ${hr('-', 75)}`)
for (const e of equipes) {
  const ratePh = e.totalHH > 0 ? e.custoTotal / e.totalHH : 0
  const hhRounded = Math.round(e.totalHH * 100) / 100
  console.log(
    `  ${e.nome.slice(0, 34).padEnd(35)}` +
    ` ${String(hhRounded).padStart(10)}h` +
    ` ${brl(e.custoTotal).padStart(15)}` +
    ` ${brl(ratePh).padStart(10)}/h`
  )
}

// Show ALL rows from Tarefas sheet including hidden ones
if (wb.Sheets['Tarefas']) {
  const sheet = wb.Sheets['Tarefas']
  const allRows = sheetAllRows(sheet)
  const hiddenRows = getHiddenRows(sheet)

  console.log(`\n  Total linhas na aba Tarefas (raw): ${allRows.length}`)
  console.log(`  Linhas ocultas: ${hiddenRows.size}`)

  if (hiddenRows.size > 0) {
    console.log('\n  ⚠ LINHAS OCULTAS NA ABA TAREFAS:')
    for (const r of [...hiddenRows].slice(0, 30)) {
      const row = allRows.find(x => x.rowIdx === r)
      if (row) {
        const nonNull = row.cells.filter(c => c != null && String(c).trim() !== '')
        if (nonNull.length) {
          console.log(`    Linha ${String(r+1).padStart(4)}: ${nonNull.slice(0, 7).map(v => JSON.stringify(v)).join(' | ')}`)
        }
      }
    }
    if (hiddenRows.size > 30) {
      console.log(`    ... e mais ${hiddenRows.size - 30} linhas ocultas`)
    }
  }

  // Show all rows around the header for context
  console.log('\n  PRIMEIRAS 5 LINHAS (raw) para localizar header:')
  for (const row of allRows.slice(0, 5)) {
    const nonNull = row.cells.filter(c => c != null && String(c).trim() !== '')
    const flag = row.hidden ? ' [OCULTA]' : ''
    console.log(`    Linha ${String(row.rowIdx+1).padStart(4)}${flag}: ${nonNull.slice(0, 6).map(v => JSON.stringify(v)).join(' | ')}`)
  }
}

// ── 6. Cross-check PPU vs Tarefas ────────────────────────────────────────────
console.log('\n' + hr())
console.log('🔍 VERIFICAÇÃO CRUZADA:')
if (ppu.totalGeral && totalCusto > 0) {
  const diff = Math.abs(ppu.totalGeral - totalCusto) / ppu.totalGeral * 100
  console.log(`  PPU total geral:   ${brl(ppu.totalGeral)}`)
  console.log(`  Tarefas total MO:  ${brl(totalCusto)}`)
  if (diff > 5) {
    console.log(`  ⚠ Diferença: ${diff.toFixed(1)}% — provavelmente são categorias diferentes (PPU=tudo, Tarefas=só MO)`)
  } else {
    console.log(`  ✅ Diferença de ${diff.toFixed(1)}%`)
  }
}
if (dash.precoVenda) {
  console.log(`  Dashboard preço venda: ${brl(dash.precoVenda)}`)
}
if (dash.custoTotal) {
  console.log(`  Dashboard custo total: ${brl(dash.custoTotal)}`)
}

console.log('\n' + hr('═'))
console.log('Diagnóstico concluído.')
