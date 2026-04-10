'use client'

import { FileText, CheckCircle2, TrendingUp, Users, Calendar, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import type { OrcamentoDados, OrcamentoItem, MaoDeObra, FaseCronograma } from '@/types'

interface OrcamentoPanelProps {
  dados: OrcamentoDados | null
  versao: number
  aprovado: boolean
  onAprovar: () => void
}

export function OrcamentoPanel({ dados, versao, aprovado, onAprovar }: OrcamentoPanelProps) {
  if (!dados || !dados.resumo?.objeto) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8 py-12">
        <div className="w-12 h-12 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center mb-4">
          <FileText className="w-6 h-6 text-[#A3A3A3]" />
        </div>
        <h3 className="font-medium text-[#FAFAFA] mb-2">Orçamento não gerado</h3>
        <p className="text-sm text-[#A3A3A3] max-w-xs">
          Inicie o chat com a IA para analisar o edital e gerar o orçamento automaticamente
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 space-y-4">
        {/* Header do orçamento */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-[#FAFAFA]">Orçamento</h2>
            <p className="text-xs text-[#A3A3A3]">Versão {versao}</p>
          </div>
          <div className="flex items-center gap-2">
            {aprovado ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-400">
                <CheckCircle2 className="w-3 h-3" />
                Aprovado
              </span>
            ) : (
              <button
                onClick={onAprovar}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-400 hover:bg-amber-500/15 transition-colors"
              >
                <CheckCircle2 className="w-3 h-3" />
                Aprovar
              </button>
            )}
          </div>
        </div>

        {/* Total destaque */}
        {dados.totalGeral > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-[#A3A3A3] mb-0.5">Total Geral</div>
                <div className="text-2xl font-bold text-amber-400">
                  {formatCurrency(dados.totalGeral)}
                </div>
              </div>
              {dados.custoM2 > 0 && dados.areaTotal > 0 && (
                <div className="text-right">
                  <div className="text-xs text-[#A3A3A3] mb-0.5">{dados.areaTotal} m²</div>
                  <div className="text-sm font-semibold text-[#FAFAFA]">
                    {formatCurrency(dados.custoM2)}/m²
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Resumo */}
        <Section title="Resumo Executivo" icon={<FileText className="w-4 h-4" />} defaultOpen>
          <dl className="space-y-2 text-sm">
            {dados.resumo.numeroEdital && (
              <InfoRow label="Edital" value={dados.resumo.numeroEdital} />
            )}
            <InfoRow label="Objeto" value={dados.resumo.objeto} />
            {dados.resumo.local && <InfoRow label="Local" value={dados.resumo.local} />}
            {dados.resumo.prazo && <InfoRow label="Prazo" value={dados.resumo.prazo} />}
            {dados.resumo.responsavel && (
              <InfoRow label="Responsável" value={dados.resumo.responsavel} />
            )}
          </dl>
        </Section>

        {/* Escopo */}
        {dados.escopo.length > 0 && (
          <Section title="Escopo dos Serviços" icon={<TrendingUp className="w-4 h-4" />}>
            <ul className="space-y-1">
              {dados.escopo.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#A3A3A3]">
                  <span className="text-amber-400 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Itens de custo */}
        {dados.itens.length > 0 && (
          <Section title="Itens de Custo" icon={<TrendingUp className="w-4 h-4" />}>
            <div className="space-y-3">
              {/* Group by category */}
              {groupByCategory(dados.itens).map(([cat, items]) => (
                <div key={cat}>
                  <div className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-1.5">
                    {cat}
                  </div>
                  <div className="space-y-1">
                    {items.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs py-1.5 border-b border-[#1A1A1A] last:border-0"
                      >
                        <span className="text-[#A3A3A3] flex-1 pr-2">{item.descricao}</span>
                        <span className="text-[#666666] w-14 text-center">
                          {item.qtd} {item.unidade}
                        </span>
                        <span className="text-[#FAFAFA] w-24 text-right font-medium">
                          {formatCurrency(item.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex justify-between pt-2 border-t border-[#2A2A2A]">
                <span className="text-sm font-semibold text-[#FAFAFA]">Total Materiais</span>
                <span className="text-sm font-bold text-amber-400">
                  {formatCurrency(dados.totalMateriais || dados.itens.reduce((a, i) => a + i.total, 0))}
                </span>
              </div>
            </div>
          </Section>
        )}

        {/* Mão de obra */}
        {dados.maoDeObra.length > 0 && (
          <Section title="Mão de Obra" icon={<Users className="w-4 h-4" />}>
            <div className="space-y-1">
              {dados.maoDeObra.map((item, i) => (
                <MaoDeObraRow key={i} item={item} />
              ))}
              <div className="flex justify-between pt-2 border-t border-[#2A2A2A]">
                <span className="text-sm font-semibold text-[#FAFAFA]">Total Mão de Obra</span>
                <span className="text-sm font-bold text-amber-400">
                  {formatCurrency(dados.totalMaoDeObra || dados.maoDeObra.reduce((a, i) => a + i.total, 0))}
                </span>
              </div>
            </div>
          </Section>
        )}

        {/* Cronograma */}
        {dados.cronograma.length > 0 && (
          <Section title="Cronograma" icon={<Calendar className="w-4 h-4" />}>
            <div className="space-y-2">
              {dados.cronograma.map((fase, i) => (
                <CronogramaRow key={i} fase={fase} />
              ))}
            </div>
          </Section>
        )}

        {/* Observações */}
        {dados.observacoes && (
          <Section title="Observações">
            <p className="text-sm text-[#A3A3A3] leading-relaxed">{dados.observacoes}</p>
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border border-[#2A2A2A] bg-[#111111] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#FAFAFA] hover:bg-[#1A1A1A] transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-amber-400">{icon}</span>}
          {title}
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-[#A3A3A3]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#A3A3A3]" />
        )}
      </button>
      {open && <div className="px-4 pb-4 border-t border-[#2A2A2A] pt-3">{children}</div>}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-[#666666] w-24 flex-shrink-0">{label}:</dt>
      <dd className="text-[#FAFAFA] flex-1">{value}</dd>
    </div>
  )
}

function MaoDeObraRow({ item }: { item: MaoDeObra }) {
  return (
    <div className="flex items-center justify-between text-xs py-1.5 border-b border-[#1A1A1A] last:border-0">
      <span className="text-[#A3A3A3] flex-1 pr-2">{item.funcao}</span>
      <span className="text-[#666666] w-24 text-center">
        {item.qtd}x · {item.dias}d
      </span>
      <span className="text-[#FAFAFA] w-24 text-right font-medium">
        {formatCurrency(item.total)}
      </span>
    </div>
  )
}

function CronogramaRow({ fase }: { fase: FaseCronograma }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#FAFAFA]">{fase.fase}</span>
        <span className="text-amber-400 font-medium">{fase.percentual}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#1A1A1A] overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-500/60"
          style={{ width: `${fase.percentual}%` }}
        />
      </div>
      {(fase.inicio || fase.fim) && (
        <div className="flex justify-between text-xs text-[#666666]">
          <span>{fase.inicio}</span>
          <span>{fase.fim}</span>
        </div>
      )}
    </div>
  )
}

function groupByCategory(itens: OrcamentoItem[]): [string, OrcamentoItem[]][] {
  const map = new Map<string, OrcamentoItem[]>()
  for (const item of itens) {
    if (!map.has(item.categoria)) map.set(item.categoria, [])
    map.get(item.categoria)!.push(item)
  }
  return Array.from(map.entries())
}
