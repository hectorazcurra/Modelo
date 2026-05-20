'use client'

import { useState, Fragment } from 'react'
import Link from 'next/link'
import { ExternalLink, ChevronRight, ChevronDown } from 'lucide-react'
import { brl, excerpt } from '@/lib/utils'
import type { HistoricoDados } from '@/types'

interface HistoricoDetalheViewProps {
  os: string
  dados: HistoricoDados
  mode: 'modal' | 'full'
}

export function HistoricoDetalheView({ os, dados: d, mode }: HistoricoDetalheViewProps) {
  const maxExcerpt = mode === 'full' ? 999999 : 800
  const [expanded, setExpanded] = useState<number | null>(null)

  return (
    <div className="space-y-4 px-6 py-4 text-sm">
      {/* Meta */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {d.produto && <MetaRow label="Produto" value={d.produto} />}
        {d.tipologia && <MetaRow label="Tipologia" value={d.tipologia} />}
        {d.dashboard?.municipio && (
          <MetaRow
            label="Local"
            value={`${d.dashboard.municipio}${d.dashboard.uf ? '/' + d.dashboard.uf : ''}`}
          />
        )}
        {d.dashboard?.prazoContrato && (
          <MetaRow
            label="Prazo"
            value={`${d.dashboard.prazoContrato} ${d.dashboard.prazoUnidade ?? ''}`}
          />
        )}
        {(d.areaM2 ?? d.dashboard?.areaM2) && (
          <MetaRow label="Área" value={`${d.areaM2 ?? d.dashboard?.areaM2} m²`} />
        )}
        {d.statusComercial && <MetaRow label="Status" value={d.statusComercial} />}
      </div>

      {/* Financial */}
      {hasFinancial(d) && (
        <Section title="Financeiro">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {(d.dashboard?.precoVenda ?? d.valorOrcado) != null && (
              <MetaRow label="Preço cliente" value={brl(d.dashboard?.precoVenda ?? d.valorOrcado ?? 0)} />
            )}
            {d.dashboard?.custoMaoDeObraDireta != null && (
              <MetaRow label="Custo MOD empresa" value={brl(d.dashboard.custoMaoDeObraDireta)} />
            )}
            {d.dashboard?.custoTotal != null && (
              <MetaRow label="Custo total" value={brl(d.dashboard.custoTotal)} />
            )}
            {d.dashboard?.impostos != null && (
              <MetaRow label="Impostos" value={brl(d.dashboard.impostos)} />
            )}
            {(d.dashboard?.margemPerc ?? d.margem) != null && (
              <MetaRow
                label="Margem"
                value={`${((d.dashboard?.margemPerc ?? d.margem ?? 0) * 100).toFixed(1)}%`}
              />
            )}
            {d.dashboard?.bdi != null && (
              <MetaRow label="BDI" value={`${(d.dashboard.bdi * 100).toFixed(1)}%`} />
            )}
            {d.dashboard?.hhMOD != null && (
              <MetaRow label="HH MOD" value={`${d.dashboard.hhMOD}h`} />
            )}
            {d.totalGeralPPU != null && (
              <MetaRow label="Total PPU" value={brl(d.totalGeralPPU)} />
            )}
          </div>
        </Section>
      )}

      {/* PPU categories */}
      {d.categorias?.length ? (
        <Section title="PPU por categoria">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#666666] border-b border-[#2A2A2A]">
                <th className="text-left py-1 pr-3 font-normal">Categoria</th>
                <th className="text-right py-1 pr-3 font-normal">Total</th>
                <th className="text-right py-1 font-normal">Itens</th>
              </tr>
            </thead>
            <tbody>
              {(mode === 'full' ? d.categorias : d.categorias.slice(0, 8)).map((cat, i) =>
                cat.nome && (cat.total ?? 0) > 0 ? (
                  <tr key={i} className="border-b border-[#1A1A1A] last:border-0">
                    <td className="py-1 pr-3 text-[#A3A3A3]">{cat.nome}</td>
                    <td className="py-1 pr-3 text-right text-[#FAFAFA]">{brl(cat.total ?? 0)}</td>
                    <td className="py-1 text-right text-[#666666]">{cat.itens?.length ?? 0}</td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </Section>
      ) : (d.mobilizacao || d.despesasOperacionais || d.maoDeObraCategoria) ? (
        <Section title="PPU (agregado)">
          <div className="space-y-1 text-xs">
            {d.mobilizacao != null && <MetaRow label="Mobilização/Desmob." value={brl(d.mobilizacao)} />}
            {d.despesasOperacionais != null && <MetaRow label="Despesas Operacionais" value={brl(d.despesasOperacionais)} />}
            {d.maoDeObraCategoria != null && <MetaRow label="Mão de Obra" value={brl(d.maoDeObraCategoria)} />}
          </div>
        </Section>
      ) : null}

      {/* Equipes */}
      {d.equipes?.length ? (
        <Section title="Equipes">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#666666] border-b border-[#2A2A2A]">
                <th className="text-left py-1 pr-3 font-normal">Função</th>
                <th className="text-right py-1 pr-3 font-normal">HH</th>
                <th className="text-right py-1 pr-3 font-normal">Custo total</th>
                <th className="text-right py-1 font-normal">Custo/h</th>
              </tr>
            </thead>
            <tbody>
              {(mode === 'full' ? d.equipes : d.equipes.slice(0, 8)).map((e, i) => {
                const hh = e.totalHH ?? 0
                const custo = e.custoTotal ?? 0
                const custoPorH = hh > 0 ? custo / hh : 0
                const profs = e.profissionais ?? []
                const isOpen = expanded === i
                return (
                <Fragment key={i}>
                  <tr
                    className={`border-b border-[#1A1A1A] last:border-0 ${profs.length ? 'cursor-pointer hover:bg-[#1A1A1A]' : ''}`}
                    onClick={() => profs.length && setExpanded(isOpen ? null : i)}
                  >
                    <td className="py-1 pr-3 text-[#A3A3A3]">
                      <span className="inline-flex items-center gap-1">
                        {profs.length ? (
                          isOpen ? <ChevronDown className="w-3 h-3 text-[#666666]" /> : <ChevronRight className="w-3 h-3 text-[#666666]" />
                        ) : <span className="w-3 h-3 inline-block" />}
                        {e.nome ?? '—'}
                        {profs.length ? <span className="text-[#555555] text-[10px]">({profs.length})</span> : null}
                      </span>
                    </td>
                    <td className="py-1 pr-3 text-right text-[#FAFAFA]">{Math.round(hh * 100) / 100}h</td>
                    <td className="py-1 pr-3 text-right text-[#FAFAFA]">{brl(custo)}</td>
                    <td className="py-1 text-right text-[#666666]">{brl(custoPorH)}/h</td>
                  </tr>
                  {isOpen && profs.length ? (
                    <tr className="bg-[#121212]">
                      <td colSpan={4} className="px-3 py-2">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-[#555555]">
                              <th className="text-left font-normal pb-1">Profissional / item</th>
                              <th className="text-right font-normal pb-1 pr-3">HH</th>
                              <th className="text-right font-normal pb-1">Custo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {profs.map((p, j) => (
                              <tr key={j}>
                                <td className="py-0.5 pr-3 text-[#8A8A8A]">{p.funcao ?? '—'}</td>
                                <td className="py-0.5 pr-3 text-right text-[#A3A3A3]">{Math.round((p.hh ?? 0) * 100) / 100}h</td>
                                <td className="py-0.5 text-right text-[#A3A3A3]">{brl(p.custo ?? 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </Section>
      ) : null}

      {/* Text excerpts */}
      <TextExcerpt
        title="Composição equipe / outros"
        text={d.outrosOrcamento?.textoExtraido}
        max={maxExcerpt}
        collapsed={mode === 'modal'}
      />
      <TextExcerpt
        title="Escopo (carta convite)"
        text={d.cartaConvite?.textoExtraido}
        max={maxExcerpt}
        collapsed={mode === 'modal'}
      />
      <TextExcerpt
        title="Suprimentos / materiais"
        text={d.suprimentos?.textoExtraido}
        max={mode === 'full' ? 999999 : 600}
        collapsed={mode === 'modal'}
      />
      <TextExcerpt
        title="Proposta ao cliente"
        text={d.propostas?.textoExtraido}
        max={mode === 'full' ? 999999 : 600}
        collapsed={mode === 'modal'}
      />
      {mode === 'full' && (
        <TextExcerpt
          title="Engenharia"
          text={d.engenharia?.textoExtraido}
          max={999999}
          collapsed={false}
        />
      )}

      {mode === 'modal' && (
        <div className="pt-2">
          <Link
            href={`/projetos-historicos/${encodeURIComponent(os)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            Ver projeto completo
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  )
}

function hasFinancial(d: HistoricoDados): boolean {
  return !!(
    d.dashboard?.precoVenda ??
    d.valorOrcado ??
    d.dashboard?.custoTotal ??
    d.dashboard?.margemPerc ??
    d.margem ??
    d.totalGeralPPU
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-amber-400/80 uppercase tracking-wider mb-2">
        {title}
      </div>
      {children}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-[#666666] flex-shrink-0">{label}:</span>
      <span className="text-[#FAFAFA]">{value}</span>
    </div>
  )
}

function TextExcerpt({
  title,
  text,
  max,
  collapsed,
}: {
  title: string
  text: string | undefined
  max: number
  collapsed: boolean
}) {
  const trimmed = excerpt(text, max)
  if (!trimmed) return null

  if (!collapsed) {
    return (
      <Section title={title}>
        <p className="text-xs text-[#A3A3A3] whitespace-pre-wrap leading-relaxed">{trimmed}</p>
      </Section>
    )
  }

  return (
    <details className="group">
      <summary className="cursor-pointer text-[10px] font-semibold text-amber-400/80 uppercase tracking-wider mb-1 list-none flex items-center gap-1 hover:text-amber-400 transition-colors">
        <span className="group-open:hidden">▶</span>
        <span className="hidden group-open:inline">▼</span>
        {title}
      </summary>
      <p className="text-xs text-[#A3A3A3] whitespace-pre-wrap leading-relaxed mt-2">{trimmed}</p>
    </details>
  )
}
