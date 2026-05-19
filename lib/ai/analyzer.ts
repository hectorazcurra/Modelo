import type { OrcamentoDados } from '@/types'

const ORC_UPDATE_REGEX = /```orcamento-update\n([\s\S]*?)```/

export function extractOrcamentoFromText(text: string): OrcamentoDados | null {
  const match = text.match(ORC_UPDATE_REGEX)
  if (!match) return null
  try {
    return JSON.parse(match[1]) as OrcamentoDados
  } catch {
    return null
  }
}

export function stripOrcamentoBlock(text: string): string {
  return text.replace(ORC_UPDATE_REGEX, '').trim()
}

// ─── Envelope clamp ──────────────────────────────────────────────────────────
// The model cannot reliably self-enforce the cost envelope (4x run-to-run
// swings even at low temperature). So we enforce it deterministically:
// the AI emits which historical OS it used (referencias / fonteOs); we look up
// those projects' real preço/mês, compute the expected envelope for the new
// prazo, and if the AI total exceeds it, scale every line proportionally.

export interface HistoricoEnvelope {
  os: string
  produto: string | null      // service type, e.g. "GERENCIAMENTO", "PROJETO"
  precoVenda: number | null
  prazoMeses: number | null
  margemPerc: number | null   // markup over cost as a fraction (0.25 = 25%)
}

/**
 * Median markup (variação custo→preço), as a PERCENT, of same-type history.
 * Used as the default variacaoPerc when the edital states no explicit
 * BDI/margem. Mirrors clampToEnvelope's same-type / prazo≥3 filter so the
 * suggested markup is coherent with the envelope.
 */
export function medianMargem(
  items: HistoricoEnvelope[],
  bucketAlvo: string,
): number | null {
  const ms = items
    .filter((h) => serviceBucket(h.produto) === bucketAlvo && h.prazoMeses && h.prazoMeses >= 3)
    .map((h) => h.margemPerc)
    .filter((m): m is number => Number.isFinite(m) && (m as number) > 0)
  const med = median(ms)
  return med == null ? null : Math.round(med * 1000) / 10 // fraction → percent
}

/**
 * Deterministically derive the cost→price split. Line totals are CUSTO; the
 * client price is custoTotal × (1 + variacaoPerc/100). The model cannot
 * reliably do this arithmetic, so both the chat route and the harness call
 * this as the source of truth before persisting. totalGeral is kept = the
 * client price so the envelope clamp (priced in client terms) keeps working.
 */
export function recomputeTotais(
  orc: OrcamentoDados,
  fallbackVarPerc: number | null,
): OrcamentoDados {
  const totalMateriais = (orc.itens ?? []).reduce((s, i) => s + (i.total || 0), 0)
  const totalMaoDeObra = (orc.maoDeObra ?? []).reduce((s, m) => s + (m.total || 0), 0)
  const custoTotal = totalMateriais + totalMaoDeObra
  const v = orc.variacaoPerc
  const variacaoPerc =
    Number.isFinite(v) && (v as number) > 0 ? (v as number) : fallbackVarPerc ?? 0
  const precoVenda = Math.round(custoTotal * (1 + variacaoPerc / 100))
  return {
    ...orc,
    totalMateriais,
    totalMaoDeObra,
    custoTotal,
    variacaoPerc,
    precoVenda,
    totalGeral: precoVenda,
  }
}

// Classify a free-text objeto/produto into a coarse service bucket so the
// envelope is computed from same-type history, not the AI's cited refs.
// Classify a SHORT string (objeto/produto/título) into a service bucket.
// First-match order with the more specific service first. Feed this a short
// signal (objeto line / produto), NOT a whole multi-page edital — counting
// over long text is noisy ("projeto"/"obra" appear constantly).
export function serviceBucket(s: string | null | undefined): string {
  const t = (s ?? '').toLowerCase()
  if (/fiscaliz/.test(t)) return 'fiscalizacao'
  if (/gerenc/.test(t)) return 'gerenciamento'
  if (/consultor/.test(t)) return 'consultoria'
  if (/levantament|cadastr|laudo|vistoria/.test(t)) return 'levantamento'
  if (/projeto|engenharia|desenvolvimento/.test(t)) return 'projeto'
  return 'outro'
}

function parsePrazoMeses(prazo: string | undefined): number | null {
  if (!prazo) return null
  const m = String(prazo).match(/(\d+[.,]?\d*)\s*(m[eê]s|mes|meses|month)/i)
  if (m) return parseFloat(m[1].replace(',', '.'))
  const n = String(prazo).match(/(\d+[.,]?\d*)/)
  return n ? parseFloat(n[1].replace(',', '.')) : null
}

function median(xs: number[]): number | null {
  const a = xs.filter((x) => Number.isFinite(x) && x > 0).sort((p, q) => p - q)
  if (!a.length) return null
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

/**
 * Pick the single most REPRESENTATIVE historical project of the same service
 * type to use as a deterministic composition mold. "Representative" = the
 * same-bucket project whose precoVenda is the median of that bucket — this
 * avoids anchoring the AI on the biggest project (which inflates staffing).
 * Returns the OS code; the caller maps it back to the full dados.
 */
export function pickMolde(
  items: HistoricoEnvelope[],
  bucketAlvo: string,
): string | null {
  const mesmoTipo = items.filter(
    (h) =>
      serviceBucket(h.produto) === bucketAlvo &&
      h.precoVenda &&
      h.prazoMeses &&
      h.prazoMeses >= 3,
  )
  if (mesmoTipo.length === 0) return null
  const sorted = [...mesmoTipo].sort(
    (a, b) => (a.precoVenda as number) - (b.precoVenda as number),
  )
  // Lower-median index: representative, never the largest.
  const idx = Math.floor((sorted.length - 1) / 2)
  return sorted[idx].os || null
}

/**
 * Scale the whole budget down if it exceeds the envelope derived from the
 * real economics of SAME-TYPE historical projects (median price/month). This
 * is computed in code, independent of which references the AI cited — the AI
 * tends to cite the biggest projects, which would inflate the envelope.
 */
export function clampToEnvelope(
  orc: OrcamentoDados,
  historicos: HistoricoEnvelope[],
  tolerancePct = 0.15,
): { orc: OrcamentoDados; applied: boolean; note: string } {
  const prazoNovo = parsePrazoMeses(orc.resumo?.prazo)
  if (!prazoNovo || !orc.totalGeral || orc.totalGeral <= 0) {
    return { orc, applied: false, note: '' }
  }

  // Bucket of the new project (from its objeto), then the same bucket in history.
  // Require prazo ≥ 3 months: shorter projects carry mobilization-heavy economics
  // that inflate price/month and are not representative of a sustained rate.
  const alvo = serviceBucket(orc.resumo?.objeto)
  const mesmoTipo = historicos.filter(
    (h) => serviceBucket(h.produto) === alvo && h.precoVenda && h.prazoMeses && h.prazoMeses >= 3,
  )
  // Need a few comparables for a trustworthy median; otherwise don't clamp.
  if (mesmoTipo.length < 3) return { orc, applied: false, note: '' }

  const precosMes = mesmoTipo.map((h) => (h.precoVenda as number) / (h.prazoMeses as number))
  const medMes = median(precosMes)
  if (medMes == null) return { orc, applied: false, note: '' }

  const envelopePreco = medMes * prazoNovo
  // DOWN-ONLY clamp. It caps runaway over-pricing (the original failure mode:
  // 3-4× explosions) but must NOT scale UP: "below the type median" is
  // ambiguous — it can mean the AI missed scope (VIVO) OR the project is
  // genuinely small (C&A: a 1-store job is 4× below the gerenciamento median
  // because the base is biased to large multi-front projects). Scaling such
  // a correct small estimate up to the median produced +323% over-quotes.
  // Under-estimates are left as-is for human review (commercially safer than
  // a blown-up over-quote, and the AI often reads explicit edital cost
  // signals correctly on its own).
  const limite = envelopePreco * (1 + tolerancePct)
  if (orc.totalGeral <= limite) {
    return { orc, applied: false, note: '' }
  }

  const factor = envelopePreco / orc.totalGeral
  const scale = (n: number | undefined) => Math.round((n ?? 0) * factor)

  // Scale the CUSTO lines down by the factor, then re-derive custoTotal /
  // precoVenda / totalGeral from them so the cost→price nexus stays exact
  // (variacaoPerc is preserved; the envelope is priced in client terms, so
  // scaling cost by factor lands precoVenda on envelopePreco).
  const adjusted: OrcamentoDados = recomputeTotais(
    {
      ...orc,
      itens: (orc.itens ?? []).map((i) => ({
        ...i,
        custoUnit: i.qtd ? scale(i.total) / i.qtd : scale(i.custoUnit),
        total: scale(i.total),
      })),
      maoDeObra: (orc.maoDeObra ?? []).map((m) => {
        const novoTotal = scale(m.total)
        const dias = m.qtd && m.valorDia ? Math.round(novoTotal / (m.qtd * m.valorDia)) : m.dias
        return { ...m, total: novoTotal, dias }
      }),
    },
    orc.variacaoPerc,
  )

  const dir = factor < 1 ? 'excedia' : 'estava abaixo d'
  const note =
    `\n\n[AJUSTE AUTOMÁTICO DE ENVELOPE] O total proposto (R$ ${Math.round(orc.totalGeral).toLocaleString('pt-BR')}) ` +
    `${dir}o envelope histórico (R$ ${Math.round(envelopePreco).toLocaleString('pt-BR')} = ` +
    `mediana R$ ${Math.round(medMes).toLocaleString('pt-BR')}/mês de ${mesmoTipo.length} projetos "${alvo}" × ${prazoNovo} meses). ` +
    `Todas as linhas foram escaladas por ${(factor * 100).toFixed(0)}% para respeitar a economia real de projetos do mesmo tipo.`

  return {
    orc: { ...adjusted, observacoes: (orc.observacoes ?? '') + note },
    applied: true,
    note,
  }
}

export const orcamentoVazio: OrcamentoDados = {
  resumo: {
    objeto: '',
    local: '',
    prazo: '',
    responsavel: '',
    numeroEdital: '',
  },
  escopo: [],
  itens: [],
  custoM2: 0,
  areaTotal: 0,
  maoDeObra: [],
  cronograma: [],
  totalMateriais: 0,
  totalMaoDeObra: 0,
  custoTotal: 0,
  variacaoPerc: 0,
  precoVenda: 0,
  totalGeral: 0,
  observacoes: '',
}
