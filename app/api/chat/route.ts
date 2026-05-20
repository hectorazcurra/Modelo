import { NextRequest } from 'next/server'
import { streamText, convertToModelMessages } from 'ai'
import { prisma } from '@/lib/db/client'
import { getModel } from '@/lib/ai/providers'
import { buildSystemPrompt } from '@/lib/ai/prompts'
import { extractOrcamentoFromText, stripOrcamentoBlock, clampToEnvelope, serviceBucket, pickMolde, medianMargem, recomputeTotais, tipologiaBucket, normTipologia, modalidadeBucket, medianBdiByModalidade, type HistoricoEnvelope } from '@/lib/ai/analyzer'
import { brl, excerpt } from '@/lib/utils'
import type { AIProvider, OrcamentoDados, HistoricoDados } from '@/types'

function safeParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projetoId, messages } = body

    const projeto = await prisma.projeto.findUnique({
      where: { id: projetoId },
      include: { orcamento: true },
    })

    if (!projeto) {
      return Response.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    // Load historicos. Two passes to avoid MySQL sort_buffer overflow
    // (each `dados` row is ~35KB of JSON):
    //   1. SELECT id ORDER BY criadoEm — sort buffer only holds (id, criadoEm)
    //   2. findMany WHERE id IN (...) — no sort, just fetch
    // The JSON pastaResolvida filter is done in JS to keep step 1's WHERE
    // simple (no JSON_EXTRACT, which can also tip MySQL into the buffer).
    type HistoricoRaw = { titulo: string; dados: unknown }
    let historicos: HistoricoRaw[] = []
    let totalRows = 0
    try {
      const ids = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM BaseConhecimento
        WHERE tipo = 'projeto_historico'
        ORDER BY criadoEm DESC
        LIMIT 500
      `
      totalRows = ids.length
      if (ids.length) {
        const rows = await prisma.baseConhecimento.findMany({
          where: { id: { in: ids.map((r) => r.id) } },
          select: { id: true, titulo: true, dados: true },
        })
        const order = new Map(ids.map((r, i) => [r.id, i]))
        rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
        historicos = rows
          .filter((r) => {
            const d = (typeof r.dados === 'string' ? safeParse(r.dados) : r.dados) as
              | { pastaResolvida?: string | null }
              | null
            return !!d?.pastaResolvida
          })
          .slice(0, 30)
          .map((r) => ({ titulo: r.titulo, dados: r.dados }))
      }
    } catch (err) {
      console.error('[chat] failed to load historicos:', err)
    }

    const historicosFormatted = historicos.map((h) => {
      let dados: unknown = h.dados
      if (typeof dados === 'string') {
        try { dados = JSON.parse(dados) } catch { dados = {} }
      }
      return { titulo: h.titulo, dados }
    })


    function formatHistorico(b: { titulo: string; dados: unknown }): string {
      const d = (b.dados ?? {}) as HistoricoDados
      const lines: string[] = [`### ${b.titulo}`]

      // Meta
      const meta: string[] = []
      if (d.produto) meta.push(`Produto: ${d.produto}`)
      if (d.tipologia) meta.push(`Tipologia: ${d.tipologia}`)
      if (d.statusComercial) meta.push(`Status: ${d.statusComercial}`)
      if (d.dashboard?.municipio) meta.push(`Local: ${d.dashboard.municipio}${d.dashboard.uf ? '/' + d.dashboard.uf : ''}`)
      if (d.dashboard?.prazoContrato) meta.push(`Prazo: ${d.dashboard.prazoContrato} ${d.dashboard.prazoUnidade ?? ''}`)
      if (d.areaM2) meta.push(`Área: ${d.areaM2} m²`)
      if (meta.length) lines.push(meta.join(' | '))

      // Financial summary — cost for company vs price for client
      const fin: string[] = []
      const precoCliente = d.dashboard?.precoVenda ?? d.valorOrcado
      if (precoCliente)                     fin.push(`Preço cliente: ${brl(precoCliente)}`)
      if (d.dashboard?.custoMaoDeObraDireta) fin.push(`Custo MOD empresa: ${brl(d.dashboard.custoMaoDeObraDireta)}`)
      if (d.dashboard?.custoTotal)          fin.push(`Custo total: ${brl(d.dashboard.custoTotal)}`)
      if (d.dashboard?.impostos)            fin.push(`Impostos: ${brl(d.dashboard.impostos)}`)
      if (d.dashboard?.margemPerc != null)  fin.push(`Margem: ${(d.dashboard.margemPerc * 100).toFixed(1)}%`)
      else if (d.margem != null)            fin.push(`Margem: ${(d.margem * 100).toFixed(1)}%`)
      if (d.dashboard?.bdi)                fin.push(`BDI: ${(d.dashboard.bdi * 100).toFixed(1)}%`)
      if (d.dashboard?.hhMOD)              fin.push(`HH MOD: ${d.dashboard.hhMOD}h`)
      if (typeof d.totalGeralPPU === 'number') fin.push(`Total PPU: ${brl(d.totalGeralPPU)}`)
      if (fin.length) lines.push(fin.join(' | '))

      // PPU categories (Mobilização, Despesas Operacionais, Mão de Obra, etc.)
      if (d.categorias?.length) {
        lines.push('PPU por categoria:')
        for (const cat of d.categorias.slice(0, 8)) {
          if (cat.nome && (cat.total ?? 0) > 0) {
            lines.push(`  - ${cat.nome}: ${brl(cat.total ?? 0)} (${cat.itens?.length ?? 0} itens)`)
          }
        }
      } else if (d.mobilizacao || d.despesasOperacionais || d.maoDeObraCategoria) {
        // Fallback to aggregated values
        if (d.mobilizacao)            lines.push(`  Mobilização/Desmobilização: ${brl(d.mobilizacao)}`)
        if (d.despesasOperacionais)   lines.push(`  Despesas Operacionais: ${brl(d.despesasOperacionais)}`)
        if (d.maoDeObraCategoria)     lines.push(`  Mão de Obra: ${brl(d.maoDeObraCategoria)}`)
      }

      // Team hours (Tarefas sheet)
      if (d.equipes?.length) {
        lines.push('Equipes (horas e custo interno):')
        for (const e of d.equipes.slice(0, 8)) {
          const hh = e.totalHH ?? 0
          const custo = e.custoTotal ?? 0
          const rateHH = hh > 0 ? custo / hh : 0
          lines.push(`  - ${e.nome ?? ''}: ${Math.round(hh * 100) / 100}h | ${brl(custo)} | ${brl(rateHH)}/h`)
        }
      }

      // Other Orçamento files (Composição Equipe, etc.)
      const outrosExc = excerpt(d.outrosOrcamento?.textoExtraido, 800)
      if (outrosExc) lines.push(`Composição equipe / outros:\n${outrosExc}`)

      // Carta convite / scope
      const ccExc = excerpt(d.cartaConvite?.textoExtraido, 1200)
      if (ccExc) lines.push(`Escopo (carta convite):\n${ccExc}`)

      // Suprimentos
      const suprExc = excerpt(d.suprimentos?.textoExtraido, 600)
      if (suprExc) lines.push(`Suprimentos/materiais:\n${suprExc}`)

      // Proposta ao cliente
      const propExc = excerpt(d.propostas?.textoExtraido, 600)
      if (propExc) lines.push(`Proposta ao cliente:\n${propExc}`)

      return lines.join('\n')
    }

    // ── Deterministic composition mold ────────────────────────────────────
    // Pick the most representative same-type historical project (median
    // precoVenda of its service bucket) and present its real team/role
    // composition as an explicit template. This stops the AI from inferring
    // staffing from the edital text (which over/under-staffs by 3-4x).
    const envelopeData: HistoricoEnvelope[] = historicosFormatted.map((h) => {
      const d = (h.dados ?? {}) as HistoricoDados & { produto?: string | null; tipologia?: string | null }
      return {
        os: d.os ?? '',
        produto: d.produto ?? d.tipologia ?? null,
        precoVenda: d.dashboard?.precoVenda ?? d.valorOrcado ?? null,
        prazoMeses: d.dashboard?.prazoContrato ?? null,
        margemPerc: d.dashboard?.margemPerc ?? d.margem ?? null,
        tipologia: d.tipologia ?? null,
        riqueza: (d.equipes ?? []).reduce(
          (s: number, e: { profissionais?: unknown[] }) => s + (e.profissionais?.length ?? 0),
          0,
        ),
        modalidade: (d.dashboard as { modalidade?: 'empreitada' | 'administracao' | null })?.modalidade ?? null,
        margemComponentes:
          (d.dashboard as { bdiBlock?: { margemComponentes?: Array<{ label: string; valor: number }> } })?.bdiBlock?.margemComponentes ?? null,
        impostosComponentes:
          (d.dashboard as { bdiBlock?: { impostosComponentes?: Array<{ label: string; valor: number }> } })?.bdiBlock?.impostosComponentes ?? null,
      }
    })
    // Classify from a SHORT signal (project name + edital head, where the
    // object/title lives) — not the whole multi-page text, which is noisy.
    const sinalCurto = `${projeto.nome ?? ''} ${(projeto.pdfTexto ?? '').slice(0, 600)}`
    const bucketAlvo = serviceBucket(sinalCurto)
    // Tipologia is a RIGID filter for mold/envelope: same PRODUTO but
    // different tipologia (VAREJO × EDIFICAÇÕES) have very different
    // economics. Honor the user override stored on the current orçamento;
    // otherwise auto-classify. The effective value is echoed back into
    // resumo.tipologia so the UI can show/edit it.
    const tipologiaOverride = normTipologia(
      (projeto.orcamento?.dados as OrcamentoDados | null)?.resumo?.tipologia,
    )
    const tipologiaAlvo =
      tipologiaOverride !== 'outro' ? tipologiaOverride : tipologiaBucket(sinalCurto)
    const moldeOs = pickMolde(envelopeData, bucketAlvo, tipologiaAlvo)
    // Modalidade contratual: Execução de Obra → Administração; demais → Empreitada.
    // Override do usuário (resumo.modalidade gravado na UI) tem prioridade.
    const orcResumo = (projeto.orcamento?.dados as unknown as OrcamentoDados | null)?.resumo as
      | { modalidade?: string }
      | undefined
    const modalidadeOverrideRaw = String(orcResumo?.modalidade ?? '').toLowerCase()
    const modalidadeAlvo: 'empreitada' | 'administracao' =
      modalidadeOverrideRaw === 'empreitada' || modalidadeOverrideRaw === 'administracao'
        ? modalidadeOverrideRaw
        : modalidadeBucket(sinalCurto)
    // BDI sugerido: mediana de componentes do mesmo bucket+tipologia+modalidade.
    // Quando raso (<2 comparáveis com bdiBlock), cai para medianMargem (single %)
    // como fallback seguro — orçamento ainda fecha custo→preço, só sem o detalhe
    // por componente.
    const bdiSugerido = medianBdiByModalidade(envelopeData, bucketAlvo, tipologiaAlvo, modalidadeAlvo)
    const variacaoSugerida = medianMargem(envelopeData, bucketAlvo, tipologiaAlvo)

    function formatMolde(b: { titulo: string; dados: unknown }): string {
      const d = (b.dados ?? {}) as HistoricoDados
      const preco = d.dashboard?.precoVenda ?? d.valorOrcado ?? 0
      const prazo = d.dashboard?.prazoContrato ?? null
      const out: string[] = [
        `## MOLDE DE COMPOSIÇÃO (referência determinística — replique a ESTRUTURA, escale pelo prazo)`,
        `${b.titulo} — tipo "${bucketAlvo}" | tipologia "${tipologiaAlvo}"${prazo ? ` | prazo ${prazo} meses` : ''}${preco ? ` | preço ${brl(preco)}` : ''}`,
        `Este é o projeto histórico do MESMO TIPO mais representativo (preço mediano do bucket). Use a composição abaixo como TEMPLATE: replique as MESMAS funções/cargos e a MESMA proporção de horas entre eles, ajustando só a escala pelo prazo do projeto novo e por evidência explícita de porte no edital.`,
      ]
      // Materiais (Suprimentos) do MOLDE — sinaliza a proporção realística de
      // material vs mão-de-obra histórica, para a IA replicar quando aplicável.
      const sup = (d as { suprimentosTotais?: { custoTotal?: number; vendaTotal?: number } }).suprimentosTotais
      if (sup?.custoTotal && sup.custoTotal > 0) {
        const totLab = (d.equipes ?? []).reduce((s, e) => s + (e.custoTotal ?? 0), 0)
        const pct = totLab > 0 ? (sup.custoTotal / (totLab + sup.custoTotal)) * 100 : 0
        out.push(
          `Suprimentos (materiais) do MOLDE: ${brl(sup.custoTotal)} de custo${sup.vendaTotal ? ` (venda ${brl(sup.vendaTotal)})` : ''} — ${pct.toFixed(1)}% do custo total. Se o escopo do novo projeto envolver materiais, emita itens correspondentes nessa proporção.`,
        )
      }

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

    const moldeEntry = moldeOs
      ? historicosFormatted.find((h) => (h.dados as HistoricoDados)?.os === moldeOs)
      : undefined

    const variacaoTexto =
      variacaoSugerida != null
        ? `## VARIAÇÃO PADRÃO (markup custo→preço)\n` +
          `As linhas do orçamento são CUSTO puro. O preço cobrado do cliente é custoTotal × (1 + variacaoPerc/100).\n` +
          `Se o edital declarar BDI/margem explícito, use-o em "variacaoPerc". Caso contrário, use a VARIAÇÃO PADRÃO = ` +
          `${variacaoSugerida.toFixed(1)}% (mediana de margem dos projetos "${bucketAlvo}" do histórico).`
        : ''

    // BDI estruturado: modalidade + componentes (Lucro/Taxa Admin + Overhead + …;
    // PIS + COFINS + ISSQN + …). A IA preenche `bdi` no JSON; o servidor recalcula
    // bdiCalculado pela fórmula Excel da modalidade (recomputeTotais).
    const bdiTexto = bdiSugerido
      ? `## BDI PADRÃO (estruturado, modalidade: ${modalidadeAlvo})\n` +
        `Para esta combinação produto/tipologia/modalidade ("${bucketAlvo}" × "${tipologiaAlvo}" × ${modalidadeAlvo}), os componentes medianos do histórico são:\n` +
        `Margem: ${bdiSugerido.margemComponentes.map((c) => `${c.label}=${c.valor.toFixed(2)}%`).join(', ')}\n` +
        `Impostos: ${bdiSugerido.impostosComponentes.map((c) => `${c.label}=${c.valor.toFixed(2)}%`).join(', ')}\n` +
        `BDI calculado mediano = ${bdiSugerido.bdiCalculado.toFixed(2)}% (fórmula ${modalidadeAlvo === 'empreitada' ? '1/(1−M−I)−1' : '(1+M)/(1−I)−1'}).\n` +
        `Preencha o campo "bdi" do JSON com modalidade="${modalidadeAlvo}" + componentes (use estes valores se o edital não disser outra coisa). O sistema RECALCULA "bdiCalculado" e o "precoVenda" via fórmula determinista — não precisa multiplicar.`
      : `## BDI PADRÃO (modo simples — sem comparáveis suficientes para decompor)\n` +
        `Modalidade detectada: ${modalidadeAlvo}. Como o histórico tem menos de 2 projetos com BDI decomposto para esta combinação, use o campo legacy "variacaoPerc" (mediana de margem = ${variacaoSugerida?.toFixed(1) ?? '?'}%) e deixe "bdi" ausente.`

    const tipologiaTexto =
      `## TIPOLOGIA DA DEMANDA (filtro rígido)\n` +
      `Este projeto foi classificado como tipologia "${tipologiaAlvo}" (produto "${bucketAlvo}"). ` +
      `O MOLDE e os comparáveis abaixo já foram filtrados SOMENTE para projetos do mesmo PRODUTO E mesma TIPOLOGIA — ` +
      `pois a mesma categoria de serviço tem economia muito diferente entre VAREJO, EDIFICAÇÕES e INFRAESTRUTURA. ` +
      `Não use projetos de outra tipologia como referência. Ecoe a tipologia detectada em "resumo.tipologia" (use exatamente: varejo | edificacoes | infraestrutura).`

    const baseTexto = [
      tipologiaTexto,
      bdiTexto,
      ...(variacaoTexto ? [variacaoTexto] : []),
      ...(moldeEntry ? [formatMolde(moldeEntry)] : []),
      ...(historicosFormatted.length > 0
        ? [
            `### Projetos históricos da empresa (${historicosFormatted.length} projetos com dados)`,
            ...historicosFormatted.map(formatHistorico),
          ]
        : []),
    ].join('\n\n')

    const systemPrompt = buildSystemPrompt({
      pdfTexto: projeto.pdfTexto,
      orcamentoAtual: projeto.orcamento?.dados as OrcamentoDados | null,
      baseConhecimento: baseTexto,
    })

    const model = getModel(projeto.aiProvider as AIProvider)

    // Convert UI messages to model messages
    const modelMessages = await convertToModelMessages(messages)

    console.log(
      `[chat] projeto=${projetoId} provider=${projeto.aiProvider} ` +
      `pdfTexto=${projeto.pdfTexto?.length ?? 0}ch base=${baseTexto.length}ch ` +
      `historicos=${historicosFormatted.length}/${totalRows} msgs=${modelMessages.length}`,
    )

    const result = streamText({
      model,
      // Low temperature: the orçamento math must be consistent run-to-run.
      // High temperature was producing 4x swings on the same input.
      temperature: 0.2,
      system: systemPrompt,
      messages: modelMessages,
      onError: (e: unknown) => {
        console.error('[chat] streamText error:', e)
      },
      onFinish: async ({ text }: { text: string }) => {
        const cleanText = stripOrcamentoBlock(text)

        await prisma.mensagem.create({
          data: {
            projetoId,
            role: 'assistant',
            conteudo: cleanText,
          },
        })

        const orcamentoRaw = extractOrcamentoFromText(text)
        if (orcamentoRaw) {
          // Pin the effective tipologia (override or auto) onto the orçamento
          // so the clamp filters by the same rigid tipologia used for the
          // mold, and the UI can show/edit it. Don't trust the model's echo.
          if (orcamentoRaw.resumo) {
            orcamentoRaw.resumo.tipologia = tipologiaAlvo
            ;(orcamentoRaw.resumo as { modalidade?: string }).modalidade = modalidadeAlvo
          }
          // Deterministic envelope enforcement — the model cannot self-enforce
          // the cost cap reliably, so clamp against the real economics of the
          // historical projects (envelopeData built above, reused here).
          const { orc: orcClamped, applied } = clampToEnvelope(orcamentoRaw, envelopeData)
          if (applied) console.log(`[chat] envelope clamp applied to projeto=${projetoId}`)
          // Source of truth for the cost→price split: re-derive custoTotal /
          // precoVenda / totalGeral. When the AI emitted `bdi`, recomputeTotais
          // recalcs bdiCalculado from its components via computeBdi. Otherwise
          // falls back to bdiSugerido (structured median) or variacaoSugerida
          // (single number), in that order.
          const orcamentoData = recomputeTotais(orcClamped, bdiSugerido ?? variacaoSugerida)

          const existingOrc = await prisma.orcamento.findUnique({ where: { projetoId } })
          const dados = orcamentoData as unknown as Parameters<typeof prisma.orcamento.create>[0]['data']['dados']
          if (existingOrc) {
            await prisma.orcamento.update({
              where: { projetoId },
              data: { dados, versao: { increment: 1 } },
            })
          } else {
            await prisma.orcamento.create({
              data: { projetoId, dados },
            })
          }

          await prisma.projeto.update({
            where: { id: projetoId },
            data: { status: 'ORCAMENTO' },
          })
        }
      },
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error('[chat] route error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return new Response(`Erro no chat: ${message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}
