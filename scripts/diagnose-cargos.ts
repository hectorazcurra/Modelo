/**
 * Diagnostic — map the per-role ("cargo") matrix in BLOCK 2 of the Tarefas
 * sheet across all historical Pricing files. extractTarefas() stops at the
 * block-1 grand-total row (extractor.ts:~436) and never reads block 2, which
 * holds the professionals composing each equipe. Before extending the
 * extractor we need to know which role-label columns exist and how stable
 * they are across projects.
 *
 * Usage: ./node_modules/.bin/tsx scripts/diagnose-cargos.ts [--dir <base>]
 * Default dir: /var/lib/metodo/arquivos/
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as XLSX from 'xlsx'

const argv = process.argv.slice(2)
let baseDir = '/var/lib/metodo/arquivos/'
for (let i = 0; i < argv.length; i++) if (argv[i] === '--dir') baseDir = argv[++i]

function findSubfolder(base: string, candidates: string[]): string | null {
  for (const c of candidates) {
    const p = path.join(base, c)
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p
  }
  return null
}

function findLatestPricing(projectFolder: string): string | null {
  const orcPath = findSubfolder(projectFolder, ['02. Orçamento', '02. Orcamento', '02 Orçamento'])
  if (!orcPath) return null
  const revs = fs.readdirSync(orcPath, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^Rev\.?\s*\d+/i.test(e.name) && !/obsoleto/i.test(e.name))
    .map((e) => ({ name: e.name, num: parseInt(e.name.match(/Rev\.?\s*(\d+)/i)?.[1] ?? '0') }))
    .sort((a, b) => b.num - a.num)
  for (const rev of revs) {
    const revPath = path.join(orcPath, rev.name)
    const files = fs.readdirSync(revPath)
      .filter((f) => /^Pricing.*\.xlsx?$/i.test(f) && !f.startsWith('~$'))
      .sort()
    if (files.length) return path.join(revPath, files[files.length - 1])
  }
  return null
}

function allRows(sheet: XLSX.WorkSheet): Array<Array<unknown>> {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, blankrows: false, raw: true })
}

const S = (v: unknown) => String(v ?? '').trim()

// Looks like a role/cargo label (engineering staffing vocabulary).
function isCargoLabel(s: string): boolean {
  const t = s.toLowerCase()
  if (t.length < 2 || t.length > 60) return false
  return /\b(ger\.|gerente|coord|sup\.|super|eng\b|eng\.|arq\b|arq\.|engenheir|arquitet|analista|an\.|t[eé]cnic|l[ií]der|estagi|assistente|aux\b|auxiliar|fiscal|projetista|or[çc]amentista|planejad|administrat)\b/.test(t)
}

function main() {
  const projectDirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(baseDir, e.name))

  console.log(`Varrendo ${projectDirs.length} pastas em ${baseDir}\n`)

  const cargoFreq = new Map<string, number>()      // label → nº de projetos
  const perProject: Array<{ os: string; block1Rows: number; cargoCols: string[]; sample: string }> = []
  let analisados = 0

  for (const dir of projectDirs) {
    const xlsx = findLatestPricing(dir)
    if (!xlsx) continue
    const os = path.basename(dir).match(/^(\d{4}-\d{3})/)?.[1] ?? path.basename(dir).slice(0, 12)
    try {
      const wb = XLSX.readFile(xlsx, { cellDates: false, cellNF: false, cellFormula: false })
      const sheet = wb.Sheets['Tarefas']
      if (!sheet) continue
      const rows = allRows(sheet)

      // Find block-1 header ("Descrição da Equipe")
      let hdr = -1, colDesc = -1, colHH = -1
      for (let r = 0; r < rows.length && hdr < 0; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          if (S(rows[r][c]) === 'Descrição da Equipe') {
            hdr = r; colDesc = c
            for (let j = 0; j < rows[r].length; j++) {
              if (S(rows[r][j]) === 'HH Total por equipe') colHH = j
            }
            break
          }
        }
      }
      if (hdr < 0) continue

      // Walk to the block-1 grand-total break row (same logic as extractTarefas)
      let breakRow = rows.length
      let block1Rows = 0
      for (let r = hdr + 1; r < rows.length; r++) {
        const row = rows[r]
        if (row.some((c) => S(c) === 'Descrição da Equipe')) { breakRow = r; break }
        const desc = colDesc >= 0 ? row[colDesc] : null
        if (desc == null || S(desc) === '') {
          const hhRaw = colHH >= 0 ? row[colHH] : null
          const hhNum = typeof hhRaw === 'number' ? hhRaw : parseFloat(S(hhRaw).replace(',', '.'))
          if (Number.isFinite(hhNum) && hhNum > 0) { breakRow = r; break }
          continue
        }
        block1Rows++
      }

      // BLOCK 2: scan rows after the break for role-label header cells
      const cargoColsHere = new Set<string>()
      let sampleRow = ''
      for (let r = breakRow; r < Math.min(breakRow + 40, rows.length); r++) {
        const row = rows[r]
        for (let c = 0; c < row.length; c++) {
          const v = S(row[c])
          if (v && isCargoLabel(v)) {
            cargoColsHere.add(v)
            if (!sampleRow) sampleRow = `r${r + 1}c${c}="${v}"`
          }
        }
      }
      for (const lbl of cargoColsHere) cargoFreq.set(lbl, (cargoFreq.get(lbl) ?? 0) + 1)
      perProject.push({ os, block1Rows, cargoCols: [...cargoColsHere], sample: sampleRow })
      analisados++
    } catch (e) {
      console.error(`  ! ${os}: ${e instanceof Error ? e.message : e}`)
    }
  }

  console.log('═'.repeat(90))
  console.log('LABELS DE CARGO NO BLOCO 2 (frequência entre projetos)')
  console.log('═'.repeat(90))
  const sorted = [...cargoFreq.entries()].sort((a, b) => b[1] - a[1])
  for (const [label, n] of sorted) {
    const bar = '█'.repeat(Math.round((n / analisados) * 30))
    console.log(`  ${String(n).padStart(3)}/${analisados}  ${label.slice(0, 50).padEnd(52)} ${bar}`)
  }

  console.log('\n' + '═'.repeat(90))
  console.log('POR PROJETO (block1 = nº equipes agregadas; cargos = labels distintos no bloco 2)')
  console.log('═'.repeat(90))
  for (const p of perProject.sort((a, b) => a.os.localeCompare(b.os))) {
    console.log(`  ${p.os.padEnd(10)} eq=${String(p.block1Rows).padStart(3)} cargos=${String(p.cargoCols.length).padStart(3)}  ${p.sample}`)
  }

  console.log('\n' + '═'.repeat(90))
  console.log(`Total projetos com aba Tarefas analisados: ${analisados}`)
  console.log(`Labels de cargo distintos no bloco 2: ${cargoFreq.size}`)
}

main()
