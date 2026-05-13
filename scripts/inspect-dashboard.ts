/**
 * Dump all non-empty cells in the Dashboard sheet of a Pricing Excel file.
 * Use this to discover the actual label names used so the extractor can be updated.
 *
 * Usage:
 *   npx tsx scripts/inspect-dashboard.ts <path-to-Pricing.xlsx>
 *   npx tsx scripts/inspect-dashboard.ts <path-to-Pricing.xlsx> Precificação
 */

import * as XLSX from 'xlsx'
import path from 'path'

const filePath = process.argv[2]
const sheetName = process.argv[3] ?? 'Dashboard'

if (!filePath) {
  console.error('Usage: npx tsx scripts/inspect-dashboard.ts <file.xlsx> [SheetName]')
  process.exit(1)
}

const wb = XLSX.readFile(path.resolve(filePath), { cellDates: false, cellNF: false, cellFormula: false })

const sheet = wb.Sheets[sheetName]
if (!sheet) {
  console.error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`)
  process.exit(1)
}

type Row = (string | number | null)[]

// raw: false → formatted text (shows what user sees); raw: true → numbers as numbers
const rowsFormatted = XLSX.utils.sheet_to_json<Row>(sheet, {
  header: 1,
  defval: null,
  blankrows: false,
  raw: false,
}) as Row[]

const rowsRaw = XLSX.utils.sheet_to_json<Row>(sheet, {
  header: 1,
  defval: null,
  blankrows: false,
  raw: true,
}) as Row[]

console.log(`\n=== Aba: "${sheetName}" — ${rowsFormatted.length} linhas não-vazias ===\n`)

// Track all candidate label→value pairs (text cell followed by non-text cell or adjacent value)
const labelValuePairs: Array<{ label: string; value: string | number; row: number; col: number }> = []

for (let r = 0; r < rowsFormatted.length; r++) {
  const rowF = rowsFormatted[r]
  const rowR = rowsRaw[r]
  const nonEmptyIndices = rowF
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c !== null && String(c).trim() !== '')

  if (nonEmptyIndices.length === 0) continue

  // Print the row
  const parts = nonEmptyIndices.map(({ c, i }) => {
    const raw = rowR[i]
    const formatted = String(c).trim()
    // Show both raw and formatted if they differ
    if (raw !== null && String(raw) !== formatted) {
      return `[${i}] "${formatted}" (raw: ${raw})`
    }
    return `[${i}] "${formatted}"`
  })
  console.log(`Row ${String(r + 1).padStart(3)}: ${parts.join('  |  ')}`)

  // Collect label→value pairs: text followed by number in same row
  for (let i = 0; i < rowF.length; i++) {
    const cell = rowF[i]
    if (cell === null || String(cell).trim() === '') continue
    const cellStr = String(cell).trim()
    // If it looks like a label (text, not a pure number)
    if (isNaN(Number(cellStr.replace(/[R$\s%,.]/g, '')))) {
      // Look for a numeric value to the right
      for (let j = i + 1; j < Math.min(i + 6, rowF.length); j++) {
        const candidate = rowR[j]
        if (candidate !== null && typeof candidate === 'number') {
          labelValuePairs.push({ label: cellStr, value: candidate, row: r + 1, col: i })
          break
        }
        const candidateStr = String(rowF[j] ?? '').trim()
        if (candidateStr !== '' && !isNaN(Number(candidateStr.replace(/[R$\s%,.]/g, '')))) {
          labelValuePairs.push({ label: cellStr, value: candidateStr, row: r + 1, col: i })
          break
        }
      }
    }
  }
}

// Summary: show all label→value pairs sorted by row
console.log(`\n${'─'.repeat(80)}`)
console.log('PARES LABEL → VALOR DETECTADOS:')
console.log(`${'─'.repeat(80)}`)
for (const { label, value, row, col } of labelValuePairs) {
  console.log(`  Row ${String(row).padStart(3)} col[${col}]: "${label}" → ${value}`)
}

// Show all unique labels found
const allLabels = new Set(rowsFormatted.flatMap((row) =>
  row
    .filter((c) => c !== null && String(c).trim() !== '')
    .map((c) => String(c).trim())
    .filter((s) => isNaN(Number(s.replace(/[R$\s%,.]/g, ''))) && s.length > 2)
))

console.log(`\n${'─'.repeat(80)}`)
console.log(`TODOS OS LABELS ÚNICOS ENCONTRADOS (${allLabels.size}):`)
console.log(`${'─'.repeat(80)}`)
for (const label of [...allLabels].sort()) {
  console.log(`  "${label}"`)
}
