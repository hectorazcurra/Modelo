'use client'

import {
  FileText,
  CheckCircle2,
  TrendingUp,
  Users,
  Calendar,
  ChevronDown,
  ChevronUp,
  Check,
  Pencil,
  X,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'
import type { OrcamentoDados, OrcamentoItem, MaoDeObra, FaseCronograma, LinhaBaseInfo } from '@/types'

interface OrcamentoPanelProps {
  dados: OrcamentoDados | null
  versao: number
  aprovado: boolean
  onAprovar: () => void
  onSalvarEdicao?: (dados: OrcamentoDados) => Promise<void>
  onConfirmarLinha?: (linha: LinhaBaseInfo) => Promise<void>
}

type EditingLine = { type: 'item'; idx: number } | { type: 'mdo'; idx: number }

export function OrcamentoPanel({
  dados,
  versao,
  aprovado,
  onAprovar,
  onSalvarEdicao,
  onConfirmarLinha,
}: OrcamentoPanelProps) {
  const [localDados, setLocalDados] = useState<OrcamentoDados | null>(dados)
  const [editingLine, setEditingLine] = useState<EditingLine | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editingLine) setLocalDados(dados)
  }, [dados]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!localDados || !localDados.resumo?.objeto) {
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

  async function persistLine(newDados: OrcamentoDados, linha?: LinhaBaseInfo) {
    if (!onSalvarEdicao) return
    setSaving(true)
    try {
      setLocalDados(newDados)
      setEditingLine(null)
      await onSalvarEdicao(newDados)
      if (linha && onConfirmarLinha) {
        await onConfirmarLinha(linha).catch(() => {})
      }
    } finally {
      setSaving(false)
    }
  }

  function acceptItem(idx: number) {
    const item = localDados.itens[idx]
    const newDados = {
      ...localDados,
      itens: localDados.itens.map((it, i) =>
        i === idx ? { ...it, status: 'accepted' as const } : it
      ),
    }
    const linhaKb: LinhaBaseInfo | undefined = item.semHistorico
      ? { descricao: item.descricao, unidade: item.unidade, custoUnit: item.custoUnit, total: item.total, tipo: 'item' }
      : undefined
    persistLine(newDados, linhaKb)
  }

  function acceptMdo(idx: number) {
    const mdo = localDados.maoDeObra[idx]
    const newDados = {
      ...localDados,
      maoDeObra: localDados.maoDeObra.map((m, i) =>
        i === idx ? { ...m, status: 'accepted' as const } : m
      ),
    }
    const linhaKb: LinhaBaseInfo | undefined = mdo.semHistorico
      ? { descricao: mdo.funcao, valorDia: mdo.valorDia, total: mdo.total, tipo: 'mdo' }
      : undefined
    persistLine(newDados, linhaKb)
  }

  function editItem(idx: number, updated: Pick<OrcamentoItem, 'qtd' | 'custoUnit'>) {
    const item = localDados.itens[idx]
    const newTotal = updated.qtd * updated.custoUnit
    const newItens = localDados.itens.map((it, i) =>
      i === idx ? { ...it, ...updated, total: newTotal, status: 'edited' as const } : it
    )
    const totalMateriais = newItens.reduce((s, it) => s + it.total, 0)
    const newDados = {
      ...localDados,
      itens: newItens,
      totalMateriais,
      totalGeral: totalMateriais + (localDados.totalMaoDeObra ?? 0),
    }
    persistLine(newDados, {
      descricao: item.descricao,
      unidade: item.unidade,
      custoUnit: updated.custoUnit,
      total: newTotal,
      tipo: 'item',
    })
  }

  function editMdo(idx: number, updated: Pick<MaoDeObra, 'qtd' | 'dias' | 'valorDia'>) {
    const mdo = localDados.maoDeObra[idx]
    const newTotal = updated.qtd * updated.dias * updated.valorDia
    const newMdo = localDados.maoDeObra.map((m, i) =>
      i === idx ? { ...m, ...updated, total: newTotal, status: 'edited' as const } : m
    )
    const totalMaoDeObra = newMdo.reduce((s, m) => s + m.total, 0)
    const newDados = {
      ...localDados,
      maoDeObra: newMdo,
      totalMaoDeObra,
      totalGeral: (localDados.totalMateriais ?? 0) + totalMaoDeObra,
    }
    persistLine(newDados, {
      descricao: mdo.funcao,
      valorDia: updated.valorDia,
      total: newTotal,
      tipo: 'mdo',
    })
  }

  const pendingCount =
    localDados.itens.filter((i) => !i.status || i.status === 'pending').length +
    localDados.maoDeObra.filter((m) => !m.status || m.status === 'pending').length

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-[#FAFAFA]">Orçamento</h2>
            <p className="text-xs text-[#A3A3A3]">Versão {versao}</p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-[#666666]">Salvando…</span>}
            {aprovado ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-400">
                <CheckCircle2 className="w-3 h-3" />
                Aprovado
              </span>
            ) : (
              <>
                {pendingCount > 0 && (
                  <span className="text-xs text-amber-400/70">
                    {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
                  </span>
                )}
                <button
                  onClick={onAprovar}
                  disabled={pendingCount > 0 || saving}
                  title={pendingCount > 0 ? `${pendingCount} linha(s) ainda não revisada(s)` : undefined}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-400 hover:bg-amber-500/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Aprovar
                </button>
              </>
            )}
          </div>
        </div>

        {/* Total destaque */}
        {localDados.totalGeral > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-[#A3A3A3] mb-0.5">Total Geral</div>
                <div className="text-2xl font-bold text-amber-400">
                  {formatCurrency(localDados.totalGeral)}
                </div>
              </div>
              <div className="text-right space-y-1">
                {localDados.areaTotal > 0 && (
                  <div className="text-xs text-[#A3A3A3]">{localDados.areaTotal} m²</div>
                )}
                {localDados.custoM2 > 0 && (
                  <div className="text-sm font-semibold text-[#FAFAFA]">
                    {formatCurrency(localDados.custoM2)}/m²
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Resumo */}
        <Section title="Resumo Executivo" icon={<FileText className="w-4 h-4" />} defaultOpen>
          <dl className="space-y-2 text-sm">
            {localDados.resumo.numeroEdital && (
              <InfoRow label="Edital" value={localDados.resumo.numeroEdital} />
            )}
            <InfoRow label="Objeto" value={localDados.resumo.objeto} />
            {localDados.resumo.local && <InfoRow label="Local" value={localDados.resumo.local} />}
            {localDados.resumo.prazo && <InfoRow label="Prazo" value={localDados.resumo.prazo} />}
            {localDados.resumo.responsavel && (
              <InfoRow label="Responsável" value={localDados.resumo.responsavel} />
            )}
          </dl>
        </Section>

        {/* Escopo */}
        {localDados.escopo.length > 0 && (
          <Section title="Escopo dos Serviços" icon={<TrendingUp className="w-4 h-4" />}>
            <ul className="space-y-1">
              {localDados.escopo.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#A3A3A3]">
                  <span className="text-amber-400 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Itens de custo */}
        {localDados.itens.length > 0 && (
          <Section title="Itens de Custo" icon={<TrendingUp className="w-4 h-4" />}>
            <div className="space-y-3">
              {groupByCategory(localDados.itens).map(([cat, items]) => {
                const catIdxs = localDados.itens
                  .map((it, i) => (it.categoria === cat ? i : -1))
                  .filter((i) => i >= 0)
                return (
                  <div key={cat}>
                    <div className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-1.5">
                      {cat}
                    </div>
                    <div className="space-y-0.5">
                      {items.map((item, localIdx) => {
                        const globalIdx = catIdxs[localIdx]
                        const isEditing =
                          editingLine?.type === 'item' && editingLine.idx === globalIdx
                        return (
                          <ItemLine
                            key={localIdx}
                            item={item}
                            isEditing={isEditing}
                            disabled={saving}
                            onAccept={() => acceptItem(globalIdx)}
                            onStartEdit={() => setEditingLine({ type: 'item', idx: globalIdx })}
                            onCancelEdit={() => setEditingLine(null)}
                            onConfirmEdit={(upd) => editItem(globalIdx, upd)}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              <div className="flex justify-between pt-2 border-t border-[#2A2A2A]">
                <span className="text-sm font-semibold text-[#FAFAFA]">Total Materiais</span>
                <span className="text-sm font-bold text-amber-400">
                  {formatCurrency(
                    localDados.totalMateriais || localDados.itens.reduce((a, i) => a + i.total, 0)
                  )}
                </span>
              </div>
            </div>
          </Section>
        )}

        {/* Mão de obra */}
        {localDados.maoDeObra.length > 0 && (
          <Section title="Mão de Obra" icon={<Users className="w-4 h-4" />}>
            <div className="space-y-0.5">
              {localDados.maoDeObra.map((item, i) => {
                const isEditing = editingLine?.type === 'mdo' && editingLine.idx === i
                return (
                  <MdoLine
                    key={i}
                    item={item}
                    isEditing={isEditing}
                    disabled={saving}
                    onAccept={() => acceptMdo(i)}
                    onStartEdit={() => setEditingLine({ type: 'mdo', idx: i })}
                    onCancelEdit={() => setEditingLine(null)}
                    onConfirmEdit={(upd) => editMdo(i, upd)}
                  />
                )
              })}
              <div className="flex justify-between pt-2 border-t border-[#2A2A2A]">
                <span className="text-sm font-semibold text-[#FAFAFA]">Total Mão de Obra</span>
                <span className="text-sm font-bold text-amber-400">
                  {formatCurrency(
                    localDados.totalMaoDeObra ||
                      localDados.maoDeObra.reduce((a, i) => a + i.total, 0)
                  )}
                </span>
              </div>
            </div>
          </Section>
        )}

        {/* Cronograma */}
        {localDados.cronograma.length > 0 && (
          <Section title="Cronograma" icon={<Calendar className="w-4 h-4" />}>
            <div className="space-y-2">
              {localDados.cronograma.map((fase, i) => (
                <CronogramaRow key={i} fase={fase} />
              ))}
            </div>
          </Section>
        )}

        {/* Observações */}
        {localDados.observacoes && (
          <Section title="Observações">
            <p className="text-sm text-[#A3A3A3] leading-relaxed">{localDados.observacoes}</p>
          </Section>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ItemLineProps {
  item: OrcamentoItem
  isEditing: boolean
  disabled: boolean
  onAccept: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onConfirmEdit: (upd: Pick<OrcamentoItem, 'qtd' | 'custoUnit'>) => void
}

function ItemLine({
  item,
  isEditing,
  disabled,
  onAccept,
  onStartEdit,
  onCancelEdit,
  onConfirmEdit,
}: ItemLineProps) {
  const [qtd, setQtd] = useState(item.qtd)
  const [custoUnit, setCustoUnit] = useState(item.custoUnit)

  useEffect(() => {
    setQtd(item.qtd)
    setCustoUnit(item.custoUnit)
  }, [item.qtd, item.custoUnit])

  const status = item.status ?? 'pending'
  const isConfirmed = status === 'accepted' || status === 'edited'

  return (
    <div className="py-1.5 border-b border-[#1A1A1A] last:border-0">
      <div className="flex items-center gap-1 text-xs min-h-[20px]">
        {status === 'accepted' && <Check className="w-3 h-3 text-green-400 flex-shrink-0" />}
        {status === 'edited' && <Pencil className="w-3 h-3 text-blue-400 flex-shrink-0" />}
        {status === 'pending' && <span className="w-3 flex-shrink-0" />}

        <span
          className={`flex-1 pr-1 leading-tight ${
            item.semHistorico ? 'text-amber-400/80' : 'text-[#A3A3A3]'
          }`}
        >
          {item.semHistorico && '⚠️ '}
          {item.descricao}
        </span>

        {isEditing ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <input
              type="number"
              value={qtd}
              onChange={(e) => setQtd(parseFloat(e.target.value) || 0)}
              className="w-10 text-center bg-[#0A0A0A] border border-[#333] rounded px-1 py-0.5 focus:outline-none focus:border-amber-500/50 text-[#FAFAFA]"
            />
            <span className="text-[#666666]">{item.unidade} ×</span>
            <input
              type="number"
              value={custoUnit}
              onChange={(e) => setCustoUnit(parseFloat(e.target.value) || 0)}
              className="w-20 text-right bg-[#0A0A0A] border border-[#333] rounded px-1 py-0.5 focus:outline-none focus:border-amber-500/50 text-[#FAFAFA]"
            />
            <button
              onClick={() => onConfirmEdit({ qtd, custoUnit })}
              disabled={disabled}
              className="p-0.5 rounded text-green-400 hover:bg-green-400/10 transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onCancelEdit}
              className="p-0.5 rounded text-[#666666] hover:text-[#A3A3A3] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[#666666] w-14 text-center">
              {item.qtd} {item.unidade}
            </span>
            <span className="text-[#FAFAFA] w-22 text-right font-medium">
              {formatCurrency(item.total)}
            </span>
            {!isConfirmed && (
              <>
                <button
                  onClick={onAccept}
                  disabled={disabled}
                  title="Aceitar valor"
                  className="p-0.5 rounded text-green-400/60 hover:text-green-400 hover:bg-green-400/10 transition-colors disabled:opacity-40"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={onStartEdit}
                  title="Editar valor"
                  className="p-0.5 rounded text-amber-400/60 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {item.fonte && !isEditing && (
        <div className="text-[10px] text-[#555555] mt-0.5 pl-4">Ref: {item.fonte}</div>
      )}
    </div>
  )
}

interface MdoLineProps {
  item: MaoDeObra
  isEditing: boolean
  disabled: boolean
  onAccept: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onConfirmEdit: (upd: Pick<MaoDeObra, 'qtd' | 'dias' | 'valorDia'>) => void
}

function MdoLine({
  item,
  isEditing,
  disabled,
  onAccept,
  onStartEdit,
  onCancelEdit,
  onConfirmEdit,
}: MdoLineProps) {
  const [qtd, setQtd] = useState(item.qtd)
  const [dias, setDias] = useState(item.dias)
  const [valorDia, setValorDia] = useState(item.valorDia)

  useEffect(() => {
    setQtd(item.qtd)
    setDias(item.dias)
    setValorDia(item.valorDia)
  }, [item.qtd, item.dias, item.valorDia])

  const status = item.status ?? 'pending'
  const isConfirmed = status === 'accepted' || status === 'edited'

  return (
    <div className="py-1.5 border-b border-[#1A1A1A] last:border-0">
      <div className="flex items-center gap-1 text-xs min-h-[20px]">
        {status === 'accepted' && <Check className="w-3 h-3 text-green-400 flex-shrink-0" />}
        {status === 'edited' && <Pencil className="w-3 h-3 text-blue-400 flex-shrink-0" />}
        {status === 'pending' && <span className="w-3 flex-shrink-0" />}

        <span
          className={`flex-1 pr-1 leading-tight ${
            item.semHistorico ? 'text-amber-400/80' : 'text-[#A3A3A3]'
          }`}
        >
          {item.semHistorico && '⚠️ '}
          {item.funcao}
        </span>

        {isEditing ? (
          <div className="flex items-center gap-1 flex-shrink-0 text-[#666666]">
            <input
              type="number"
              value={qtd}
              onChange={(e) => setQtd(parseFloat(e.target.value) || 0)}
              className="w-8 text-center bg-[#0A0A0A] border border-[#333] rounded px-1 py-0.5 focus:outline-none focus:border-amber-500/50 text-[#FAFAFA]"
            />
            <span>×</span>
            <input
              type="number"
              value={dias}
              onChange={(e) => setDias(parseFloat(e.target.value) || 0)}
              className="w-8 text-center bg-[#0A0A0A] border border-[#333] rounded px-1 py-0.5 focus:outline-none focus:border-amber-500/50 text-[#FAFAFA]"
            />
            <span>d ×</span>
            <input
              type="number"
              value={valorDia}
              onChange={(e) => setValorDia(parseFloat(e.target.value) || 0)}
              className="w-16 text-right bg-[#0A0A0A] border border-[#333] rounded px-1 py-0.5 focus:outline-none focus:border-amber-500/50 text-[#FAFAFA]"
            />
            <button
              onClick={() => onConfirmEdit({ qtd, dias, valorDia })}
              disabled={disabled}
              className="p-0.5 rounded text-green-400 hover:bg-green-400/10 transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onCancelEdit}
              className="p-0.5 rounded text-[#666666] hover:text-[#A3A3A3] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[#666666] w-20 text-center">
              {item.qtd}× · {item.dias}d
            </span>
            <span className="text-[#FAFAFA] w-22 text-right font-medium">
              {formatCurrency(item.total)}
            </span>
            {!isConfirmed && (
              <>
                <button
                  onClick={onAccept}
                  disabled={disabled}
                  title="Aceitar valor"
                  className="p-0.5 rounded text-green-400/60 hover:text-green-400 hover:bg-green-400/10 transition-colors disabled:opacity-40"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={onStartEdit}
                  title="Editar valor"
                  className="p-0.5 rounded text-amber-400/60 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {item.fonte && !isEditing && (
        <div className="text-[10px] text-[#555555] mt-0.5 pl-4">Ref: {item.fonte}</div>
      )}
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
