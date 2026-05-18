/**
 * Test harness: run the AI orçamento pipeline from the CLI and compare the
 * result against the real Pricing Excel — no UI needed.
 *
 * Usage:
 *   ./node_modules/.bin/tsx scripts/test-orcamento.ts \
 *     --docs   "/var/www/lab/comparativo/edital"          (folder with PDF/MSG/etc)
 *     --pricing "/var/www/lab/comparativo/Pricing Frigelar.xlsx"
 *     [--provider claude]   (claude | openai, default claude)
 *     [--out /tmp/orc.json] (also dump the parsed orçamento JSON)
 *
 * --docs may also be a single file instead of a folder.
 */

import 'dotenv/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { generateText } from 'ai'
import { extractTextFromFile } from '../lib/extractors/docs'
import { buildSystemPrompt } from '../lib/ai/prompts'
import { extractOrcamentoFromText, clampToEnvelope, serviceBucket, pickMolde, type HistoricoEnvelope } from '../lib/ai/analyzer'
import { getModel } from '../lib/ai/providers'
import { readPricingWorkbook, extractDashboard, extractTarefas } from '../lib/excel/extractor'
import { brl, excerpt } from '../lib/utils'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import type { AIProvider, OrcamentoDados, HistoricoDados } from '../types'

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
function arg(name: string): string | null {
  const i = argv.indexOf(name)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null
}
const docsPath = arg('--docs')
const projetoId = arg('--projeto')   // alternative: pull edital text from an existing Projeto
const pricingPath = arg('--pricing')
const provider = (arg('--provider') ?? 'claude') as AIProvider
const outPath = arg('--out')

if ((!docsPath && !projetoId) || !pricingPath) {
  console.error('Uso: tsx scripts/test-orcamento.ts (--docs <pasta|arquivo> | --projeto <id>) --pricing <xlsx> [--provider claude] [--out file.json]')
  process.exit(1)
}
const PRICING: string = pricingPath

function safeParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}

// ── formatHistorico — copied verbatim from app/api/chat/route.ts ─────────────
function formatHistorico(b: { titulo: string; dados: unknown }): string {
  const d = (b.dados ?? {}) as HistoricoDados
  const lines: string[] = [`### ${b.titulo}`]
  const meta: string[] = []
  if (d.produto) meta.push(`Produto: ${d.produto}`)
  if (d.tipologia) meta.push(`Tipologia: ${d.tipologia}`)
  if (d.statusComercial) meta.push(`Status: ${d.statusComercial}`)
  if (d.dashboard?.municipio) meta.push(`Local: ${d.dashboard.municipio}${d.dashboard.uf ? '/' + d.dashboard.uf : ''}`)
  if (d.dashboard?.prazoContrato) meta.push(`Prazo: ${d.dashboard.prazoContrato} ${d.dashboard.prazoUnidade ?? ''}`)
  if (d.areaM2) meta.push(`Área: ${d.areaM2} m²`)
  if (meta.length) lines.push(meta.join(' | '))

  const fin: string[] = []
  const precoCliente = d.dashboard?.precoVenda ?? d.valorOrcado
  if (precoCliente)                      fin.push(`Preço cliente: ${brl(precoCliente)}`)
  if (d.dashboard?.custoMaoDeObraDireta) fin.push(`Custo MOD empresa: ${brl(d.dashboard.custoMaoDeObraDireta)}`)
  if (d.dashboard?.custoTotal)           fin.push(`Custo total: ${brl(d.dashboard.custoTotal)}`)
  if (d.dashboard?.impostos)             fin.push(`Impostos: ${brl(d.dashboard.impostos)}`)
  if (d.dashboard?.margemPerc != null)   fin.push(`Margem: ${(d.dashboard.margemPerc * 100).toFixed(1)}%`)
  else if (d.margem != null)             fin.push(`Margem: ${(d.margem * 100).toFixed(1)}%`)
  if (d.dashboard?.bdi)                  fin.push(`BDI: ${(d.dashboard.bdi * 100).toFixed(1)}%`)
  if (d.dashboard?.hhMOD)                fin.push(`HH MOD: ${d.dashboard.hhMOD}h`)
  if (typeof d.totalGeralPPU === 'number') fin.push(`Total PPU: ${brl(d.totalGeralPPU)}`)
  if (fin.length) lines.push(fin.join(' | '))

  if (d.categorias?.length) {
    lines.push('PPU por categoria:')
    for (const cat of d.categorias.slice(0, 8)) {
      if (cat.nome && (cat.total ?? 0) > 0) lines.push(`  - ${cat.nome}: ${brl(cat.total ?? 0)} (${cat.itens?.length ?? 0} itens)`)
    }
  } else if (d.mobilizacao || d.despesasOperacionais || d.maoDeObraCategoria) {
    if (d.mobilizacao)          lines.push(`  Mobilização/Desmobilização: ${brl(d.mobilizacao)}`)
    if (d.despesasOperacionais) lines.push(`  Despesas Operacionais: ${brl(d.despesasOperacionais)}`)
    if (d.maoDeObraCategoria)   lines.push(`  Mão de Obra: ${brl(d.maoDeObraCategoria)}`)
  }

  if (d.equipes?.length) {
    lines.push('Equipes (horas e custo interno):')
    for (const e of d.equipes.slice(0, 8)) {
      const hh = e.totalHH ?? 0
      const custo = e.custoTotal ?? 0
      const rateHH = hh > 0 ? custo / hh : 0
      lines.push(`  - ${e.nome ?? ''}: ${Math.round(hh * 100) / 100}h | ${brl(custo)} | ${brl(rateHH)}/h`)
    }
  }
  const outrosExc = excerpt(d.outrosOrcamento?.textoExtraido, 800)
  if (outrosExc) lines.push(`Composição equipe / outros:\n${outrosExc}`)
  const ccExc = excerpt(d.cartaConvite?.textoExtraido, 1200)
  if (ccExc) lines.push(`Escopo (carta convite):\n${ccExc}`)
  const suprExc = excerpt(d.suprimentos?.textoExtraido, 600)
  if (suprExc) lines.push(`Suprimentos/materiais:\n${suprExc}`)
  const propExc = excerpt(d.propostas?.textoExtraido, 600)
  if (propExc) lines.push(`Proposta ao cliente:\n${propExc}`)
  return lines.join('\n')
}

// Mirrors formatMolde in app/api/chat/route.ts — keep in sync.
function formatMolde(b: { titulo: string; dados: unknown }, bucketAlvo: string): string {
  const d = (b.dados ?? {}) as HistoricoDados
  const preco = d.dashboard?.precoVenda ?? d.valorOrcado ?? 0
  const prazo = d.dashboard?.prazoContrato ?? null
  const out: string[] = [
    `## MOLDE DE COMPOSIÇÃO (referência determinística — replique a ESTRUTURA, escale pelo prazo)`,
    `${b.titulo} — tipo "${bucketAlvo}"${prazo ? ` | prazo ${prazo} meses` : ''}${preco ? ` | preço ${brl(preco)}` : ''}`,
    `Este é o projeto histórico do MESMO TIPO mais representativo (preço mediano do bucket). Use a composição abaixo como TEMPLATE: replique as MESMAS funções/cargos e a MESMA proporção de horas entre eles, ajustando só a escala pelo prazo do projeto novo e por evidência explícita de porte no edital.`,
  ]
  const totCusto = (d.equipes ?? []).reduce((s, e) => s + (e.custoTotal ?? 0), 0)
  for (const e of d.equipes ?? []) {
    const hh = e.totalHH ?? 0
    const custo = e.custoTotal ?? 0
    const pctCusto = totCusto > 0 ? ((custo / totCusto) * 100).toFixed(1) : '0'
    out.push(`- Equipe ${e.nome ?? ''}: ${Math.round(hh)}h | ${brl(custo)} | ${pctCusto}% do custo`)
    const profs = (e as { profissionais?: Array<{ funcao?: string; hh?: number; custo?: number }> }).profissionais
    for (const p of profs ?? []) {
      out.push(`    · ${p.funcao ?? ''}: ${Math.round(p.hh ?? 0)}h${p.custo ? ` | ${brl(p.custo)}` : ''}`)
    }
  }
  return out.join('\n')
}

async function main() {
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string)
  const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

  // ── 1. Get edital text — from DB project OR from files ────────────────────
  let pdfTexto = ''
  if (projetoId) {
    const proj = await prisma.projeto.findUnique({
      where: { id: projetoId },
      select: { nome: true, pdfNome: true, pdfTexto: true },
    })
    if (!proj) { console.error(`Projeto ${projetoId} não encontrado`); process.exit(1) }
    pdfTexto = proj.pdfTexto ?? ''
    console.log(`Edital: projeto "${proj.nome}" (${proj.pdfNome ?? '?'}), ${pdfTexto.length} chars do DB`)
  } else {
    const DOCS = docsPath as string
    const files: string[] = fs.statSync(DOCS).isDirectory()
      ? fs.readdirSync(DOCS).map((f) => path.join(DOCS, f))
      : [DOCS]
    // Scope-defining docs first so they survive the prompt's char budget.
    // Quantitative annexes (DPF/PPU/BMS/planilha) are critical for umbrella/LPU
    // contracts — they carry the post/quantity counts — so they rank high.
    const rank = (name: string): number => {
      const n = name.toLowerCase()
      if (/rfq|rfp|edital|carta.?convite|termo.?de.?refer|memorial|escopo/.test(n)) return 0
      if (/dpf|ppu|bms|planilha|quantitativ|or[çc]ament|lpu|pre[çc]o/.test(n)) return 1
      if (/anexo\s*i\b|especifica|t[eé]cnic|fisc|einfra/.test(n)) return 2
      if (/minuta|contrat|faq/.test(n)) return 3
      return 4 // SMS, tributária, boilerplate
    }
    files.sort((a, b) => rank(path.basename(a)) - rank(path.basename(b)) || a.localeCompare(b))
    for (const f of files) {
      // Skip Office temp lock files only. .xlsx/.xls annexes ARE extracted
      // (sheet_to_csv) — they hold quantities/posts that define contract scale.
      if (path.basename(f).startsWith('~$')) continue
      try {
        const txt = await extractTextFromFile(path.basename(f), fs.readFileSync(f))
        if (txt) pdfTexto += `\n\n=== ${path.basename(f)} ===\n${txt}`
      } catch (e) {
        console.error(`  ! falha lendo ${path.basename(f)}: ${e instanceof Error ? e.message : e}`)
      }
    }
    console.log(`Edital: ${files.length} arquivo(s), ${pdfTexto.length} chars extraídos`)
  }

  // ── 2. Load knowledge base (same logic as chat route) ─────────────────────
  let baseTexto = ''
  let envelopeData: HistoricoEnvelope[] = []
  try {
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM BaseConhecimento
      WHERE tipo = 'projeto_historico'
      ORDER BY criadoEm DESC LIMIT 500`
    const rows = await prisma.baseConhecimento.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      select: { id: true, titulo: true, dados: true },
    })
    const order = new Map(ids.map((r, i) => [r.id, i]))
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    const historicos = rows
      .filter((r) => {
        const d = (typeof r.dados === 'string' ? safeParse(r.dados) : r.dados) as { pastaResolvida?: string | null } | null
        return !!d?.pastaResolvida
      })
      .slice(0, 30)
      .map((r) => ({ titulo: r.titulo, dados: typeof r.dados === 'string' ? safeParse(r.dados) : r.dados }))
    envelopeData = historicos.map((h) => {
      const d = (h.dados ?? {}) as { os?: string; produto?: string | null; tipologia?: string | null; valorOrcado?: number | null; dashboard?: { precoVenda?: number | null; prazoContrato?: number | null } }
      return { os: d.os ?? '', produto: d.produto ?? d.tipologia ?? null, precoVenda: d.dashboard?.precoVenda ?? d.valorOrcado ?? null, prazoMeses: d.dashboard?.prazoContrato ?? null }
    })
    const bucketAlvo = serviceBucket(pdfTexto.slice(0, 600))
    const moldeOs = pickMolde(envelopeData, bucketAlvo)
    const moldeEntry = moldeOs
      ? historicos.find((h) => (h.dados as HistoricoDados)?.os === moldeOs)
      : undefined
    baseTexto = [
      ...(moldeEntry ? [formatMolde(moldeEntry, bucketAlvo)] : []),
      `### Projetos históricos da empresa (${historicos.length} projetos com dados)`,
      ...historicos.map(formatHistorico),
    ].join('\n\n')
    console.log(`Base: ${historicos.length} projetos | molde=${moldeOs ?? 'nenhum'} (bucket=${bucketAlvo}) | ${baseTexto.length} chars`)
  } finally {
    await prisma.$disconnect()
  }

  // ── 3. Call the AI ────────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt({ pdfTexto, orcamentoAtual: null, baseConhecimento: baseTexto })
  console.log(`\nChamando ${provider}... (system prompt ${systemPrompt.length} chars)\n`)
  const t0 = Date.now()
  const { text } = await generateText({
    model: getModel(provider),
    temperature: 0.2,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Analise o edital e gere o orçamento completo seguindo o fluxo de 4 passos.' }],
  })
  console.log(`IA respondeu em ${((Date.now() - t0) / 1000).toFixed(0)}s\n`)

  const orcRaw = extractOrcamentoFromText(text) as OrcamentoDados | null
  if (!orcRaw) {
    console.error('❌ Não foi possível extrair o bloco orcamento-update da resposta. Resposta completa:\n')
    console.log(text)
    process.exit(1)
  }
  const { orc, applied: clampApplied } = clampToEnvelope(orcRaw, envelopeData)
  if (clampApplied) console.log('⚙️  Envelope clamp APLICADO (total da IA excedia a economia histórica)\n')
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(orc, null, 2))

  // ── 4. Extract real Pricing ───────────────────────────────────────────────
  const wb = readPricingWorkbook(PRICING)
  const dash = extractDashboard(wb)
  const equipes = extractTarefas(wb)
  const realHH = equipes.reduce((s, e) => s + e.totalHH, 0)
  const realCusto = equipes.reduce((s, e) => s + e.custoTotal, 0)

  // ── 5. Comparison report ──────────────────────────────────────────────────
  const aiHH = orc.maoDeObra.reduce((s, m) => s + m.qtd * m.dias * 8, 0)
  const fmt = (n: number | null | undefined) => (n == null ? 'n/d' : brl(n))
  const pct = (a: number, b: number) => (b ? `${((a / b - 1) * 100).toFixed(0)}%` : '—')

  console.log('═'.repeat(78))
  console.log('COMPARATIVO: Pricing real  vs  IA')
  console.log('═'.repeat(78))
  console.log(`${'Métrica'.padEnd(22)}${'Pricing real'.padStart(18)}${'IA'.padStart(18)}${'Δ'.padStart(12)}`)
  console.log('─'.repeat(78))
  const rows: [string, string, string, string][] = [
    ['Prazo', `${dash.prazoContrato ?? '?'} ${dash.prazoUnidade ?? 'm'}`, orc.resumo.prazo, ''],
    ['Preço Venda', fmt(dash.precoVenda), fmt(orc.totalGeral), pct(orc.totalGeral, dash.precoVenda ?? 0)],
    ['Custo MOD', fmt(dash.custoMaoDeObraDireta), fmt(orc.totalMaoDeObra), pct(orc.totalMaoDeObra, dash.custoMaoDeObraDireta ?? 0)],
    ['Custo Total', fmt(dash.custoTotal), fmt(orc.totalGeral), pct(orc.totalGeral, dash.custoTotal ?? 0)],
    ['HH total', `${Math.round(realHH)}h`, `${Math.round(aiHH)}h`, pct(aiHH, realHH)],
    ['Custo equipes (raw)', fmt(realCusto), '—', ''],
    ['Margem %', dash.margemPerc != null ? `${(dash.margemPerc * 100).toFixed(1)}%` : 'n/d', '—', ''],
    ['Nº funções/equipes', String(equipes.length), String(orc.maoDeObra.length), ''],
  ]
  for (const [m, r, a, d] of rows) {
    console.log(`${m.padEnd(22)}${r.padStart(18)}${a.padStart(18)}${d.padStart(12)}`)
  }

  console.log('\n' + '─'.repeat(78))
  console.log('MÃO DE OBRA — linhas geradas pela IA:')
  console.log('─'.repeat(78))
  for (const m of orc.maoDeObra) {
    const refs = m.referencias?.length ? ` [${m.referencias.length} refs: ${m.referencias.map((r) => r.os).join(',')}]` : ''
    const flag = m.dias > (dash.prazoContrato ?? 12) * 22 ? ' ⚠DIAS>PRAZO' : ''
    console.log(`  ${m.funcao.slice(0, 32).padEnd(33)} qtd=${String(m.qtd).padStart(2)} dias=${String(Math.round(m.dias)).padStart(4)} R$/dia=${String(Math.round(m.valorDia)).padStart(5)} = ${brl(m.total)}${flag}${refs}`)
  }

  console.log('\n' + '─'.repeat(78))
  console.log('EQUIPES — Pricing real:')
  console.log('─'.repeat(78))
  for (const e of equipes) {
    console.log(`  ${e.nome.slice(0, 32).padEnd(33)} HH=${String(Math.round(e.totalHH)).padStart(5)} R$/h=${e.custoPorHH.toFixed(0).padStart(5)} = ${brl(e.custoTotal)}`)
  }

  // Prazo-normalized comparison — fair across fixed-scope vs unit/monthly
  // priced contracts (LPU, per-month) where total-vs-total is apples-to-oranges.
  const realPrazo = dash.prazoContrato ?? 0
  const aiPrazoM = (() => {
    const m = String(orc.resumo.prazo ?? '').match(/(\d+[.,]?\d*)/)
    return m ? parseFloat(m[1].replace(',', '.')) : 0
  })()
  console.log('\n' + '─'.repeat(78))
  console.log('NORMALIZADO POR MÊS (comparação justa p/ contratos unitários/mensais):')
  console.log('─'.repeat(78))
  if (realPrazo > 0 && aiPrazoM > 0 && dash.precoVenda) {
    const realMes = dash.precoVenda / realPrazo
    const aiMes = orc.totalGeral / aiPrazoM
    console.log(`  Preço/mês real: ${fmt(realMes)}  |  IA: ${fmt(aiMes)}  |  Δ ${pct(aiMes, realMes)}`)
    console.log(`  (real ${realPrazo}m × ${fmt(realMes)} ; IA ${aiPrazoM}m × ${fmt(aiMes)})`)
  } else {
    console.log('  (prazo indisponível para normalizar)')
  }

  console.log('\n' + '═'.repeat(78))
  const ratio = dash.precoVenda ? orc.totalGeral / dash.precoVenda : 0
  console.log(`VEREDITO (total): IA ${ratio > 1 ? `${((ratio - 1) * 100).toFixed(0)}% ACIMA` : `${((1 - ratio) * 100).toFixed(0)}% ABAIXO`} do preço real (${fmt(orc.totalGeral)} vs ${fmt(dash.precoVenda)})`)
  console.log('═'.repeat(78))
}

main().catch((e) => { console.error('Erro fatal:', e); process.exit(1) })
