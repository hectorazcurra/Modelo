'use client'

import {
  FileText,
  CheckCircle2,
  TrendingUp,
  Users,
  Calendar,
  ChevronDown,
  ChevronUp,
  Pencil,
  Save,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import type { OrcamentoDados, OrcamentoItem, MaoDeObra, FaseCronograma } from '@/types'

interface OrcamentoPanelProps {
  dados: OrcamentoDados | null
  versao: number
  aprovado: boolean
  onAprovar: () => void
  onSalvarEdicao?: (dados: OrcamentoDados) => Promise<void>
}

export function OrcamentoPanel({
  dados,
  versao,
  aprovado,
  onAprovar,
  onSalvarEdicao,
}: OrcamentoPanelProps) {
  const [editMode, setEditMode] = useState(false)
  const [editDados, setEditDados] = useState<OrcamentoDados | null>(null)
  const [saving, setSaving] = useState(false)

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

  function startEdit() {
    setEditDados(JSON.parse(JSON.stringify(dados)))
    setEditMode(true)
  }

  function cancelEdit() {
    setEditDados(null)
    setEditMode(false)
  }

  async function handleSave() {
    if (!editDados || !onSalvarEdicao) return
    setSaving(true)
    try {
      await onSalvarEdicao(editDados)
      setEditMode(false)
      setEditDados(null)
    } finally {
      setSaving(false)
    }
  }

  const view = editMode && editDados ? editDados : dados

  function setField<K extends keyof OrcamentoDados>(key: K, value: OrcamentoDados[K]) {
    setEditDados((prev) => prev ? { ...prev, [key]: value } : prev)
  }

  function setResumoField(key: keyof OrcamentoDados['resumo'], value: string) {
    setEditDados((prev) =>
      prev ? { ...prev, resumo: { ...prev.resumo, [key]: value } } : prev
    )
  }

  function updateItem(idx: number, field: keyof OrcamentoItem, val: string | number) {
    setEditDados((prev) => {
      if (!prev) return prev
      const itens = prev.itens.map((it, i) => {
        if (i !== idx) return it
        const updated = { ...it, [field]: typeof val === 'string' ? parseFloatSafe(val) ?? it[field] : val }
        if (field === 'qtd' || field === 'custoUnit') {
          updated.total = updated.qtd * updated.custoUnit
        }
        return updated
      })
      const totalMateriais = itens.reduce((s, it) => s + it.total, 0)
      return { ...prev, itens, totalMateriais, totalGeral: totalMateriais + (prev.totalMaoDeObra ?? 0) }
    })
  }

  function updateMdo(idx: number, field: keyof MaoDeObra, val: string | number) {
    setEditDados((prev) => {
      if (!prev) return prev
      const maoDeObra = prev.maoDeObra.map((m, i) => {
        if (i !== idx) return m
        const updated = { ...m, [field]: typeof val === 'string' ? parseFloatSafe(val) ?? m[field] : val }
        if (field === 'qtd' || field === 'dias' || field === 'valorDia') {
          updated.total = updated.qtd * updated.dias * updated.valorDia
        }
        return updated
      })
      const totalMaoDeObra = maoDeObra.reduce((s, m) => s + m.total, 0)
      return { ...prev, maoDeObra, totalMaoDeObra, totalGeral: (prev.totalMateriais ?? 0) + totalMaoDeObra }
    })
  }

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
            {editMode ? (
              <>
                <button
                  onClick={cancelEdit}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 text-xs text-[#A3A3A3] hover:bg-[#1A1A1A] transition-colors"
                >
                  <X className="w-3 h-3" />
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                >
                  <Save className="w-3 h-3" />
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </>
            ) : aprovado ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-400">
                <CheckCircle2 className="w-3 h-3" />
                Aprovado
              </span>
            ) : (
              <>
                {onSalvarEdicao && (
                  <button
                    onClick={startEdit}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#2A2A2A] bg-[#111111] px-3 py-1 text-xs text-[#A3A3A3] hover:bg-[#1A1A1A] hover:text-[#FAFAFA] transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    Editar
                  </button>
                )}
                <button
                  onClick={onAprovar}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-400 hover:bg-amber-500/15 transition-colors"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Aprovar
                </button>
              </>
            )}
          </div>
        </div>

        {/* Total destaque */}
        {view.totalGeral > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-[#A3A3A3] mb-0.5">Total Geral</div>
                {editMode && editDados ? (
                  <NumericInput
                    value={editDados.totalGeral}
                    onChange={(v) => setField('totalGeral', v)}
                    className="text-2xl font-bold text-amber-400 bg-transparent border-b border-amber-500/40 w-44 focus:outline-none"
                  />
                ) : (
                  <div className="text-2xl font-bold text-amber-400">
                    {formatCurrency(view.totalGeral)}
                  </div>
                )}
              </div>
              <div className="text-right space-y-1">
                {(view.areaTotal > 0 || (editMode && editDados)) && (
                  <div className="text-xs text-[#A3A3A3]">
                    {editMode && editDados ? (
                      <span className="flex items-center gap-1 justify-end">
                        <NumericInput
                          value={editDados.areaTotal}
                          onChange={(v) => setField('areaTotal', v)}
                          className="w-16 text-right bg-transparent border-b border-[#2A2A2A] focus:outline-none text-[#A3A3A3]"
                        />
                        {' '}m²
                      </span>
                    ) : (
                      <>{view.areaTotal} m²</>
                    )}
                  </div>
                )}
                {view.custoM2 > 0 && (
                  <div className="text-sm font-semibold text-[#FAFAFA]">
                    {editMode && editDados ? (
                      <span className="flex items-center gap-1 justify-end">
                        <NumericInput
                          value={editDados.custoM2}
                          onChange={(v) => setField('custoM2', v)}
                          className="w-20 text-right bg-transparent border-b border-[#2A2A2A] focus:outline-none"
                        />
                        {' '}/m²
                      </span>
                    ) : (
                      <>{formatCurrency(view.custoM2)}/m²</>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Resumo */}
        <Section title="Resumo Executivo" icon={<FileText className="w-4 h-4" />} defaultOpen>
          <dl className="space-y-2 text-sm">
            {view.resumo.numeroEdital && (
              <EditableInfoRow
                label="Edital"
                value={view.resumo.numeroEdital}
                editing={editMode}
                onChange={(v) => setResumoField('numeroEdital', v)}
              />
            )}
            <EditableInfoRow
              label="Objeto"
              value={view.resumo.objeto}
              editing={editMode}
              onChange={(v) => setResumoField('objeto', v)}
            />
            {view.resumo.local && (
              <EditableInfoRow
                label="Local"
                value={view.resumo.local}
                editing={editMode}
                onChange={(v) => setResumoField('local', v)}
              />
            )}
            {view.resumo.prazo && (
              <EditableInfoRow
                label="Prazo"
                value={view.resumo.prazo}
                editing={editMode}
                onChange={(v) => setResumoField('prazo', v)}
              />
            )}
            {view.resumo.responsavel && (
              <EditableInfoRow
                label="Responsável"
                value={view.resumo.responsavel}
                editing={editMode}
                onChange={(v) => setResumoField('responsavel', v)}
              />
            )}
          </dl>
        </Section>

        {/* Escopo */}
        {view.escopo.length > 0 && (
          <Section title="Escopo dos Serviços" icon={<TrendingUp className="w-4 h-4" />}>
            <ul className="space-y-1">
              {view.escopo.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#A3A3A3]">
                  <span className="text-amber-400 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Itens de custo */}
        {view.itens.length > 0 && (
          <Section title="Itens de Custo" icon={<TrendingUp className="w-4 h-4" />}>
            <div className="space-y-3">
              {groupByCategory(view.itens).map(([cat, items]) => {
                const catIdxs = view.itens
                  .map((it, i) => (it.categoria === cat ? i : -1))
                  .filter((i) => i >= 0)
                return (
                  <div key={cat}>
                    <div className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-1.5">
                      {cat}
                    </div>
                    <div className="space-y-1">
                      {items.map((item, localIdx) => {
                        const globalIdx = catIdxs[localIdx]
                        return (
                          <div
                            key={localIdx}
                            className="py-1.5 border-b border-[#1A1A1A] last:border-0"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className={`flex-1 pr-2 ${item.semHistorico ? 'text-amber-400/80' : 'text-[#A3A3A3]'}`}>
                                {item.semHistorico && '⚠️ '}{item.descricao}
                              </span>
                              {editMode ? (
                                <div className="flex items-center gap-1">
                                  <NumericInput
                                    value={item.qtd}
                                    onChange={(v) => updateItem(globalIdx, 'qtd', v)}
                                    className="w-10 text-center bg-transparent border-b border-[#2A2A2A] focus:outline-none text-[#666666]"
                                  />
                                  <span className="text-[#666666]">{item.unidade} ×</span>
                                  <NumericInput
                                    value={item.custoUnit}
                                    onChange={(v) => updateItem(globalIdx, 'custoUnit', v)}
                                    className="w-20 text-right bg-transparent border-b border-[#2A2A2A] focus:outline-none text-[#FAFAFA]"
                                  />
                                </div>
                              ) : (
                                <>
                                  <span className="text-[#666666] w-14 text-center">
                                    {item.qtd} {item.unidade}
                                  </span>
                                  <span className="text-[#FAFAFA] w-24 text-right font-medium">
                                    {formatCurrency(item.total)}
                                  </span>
                                </>
                              )}
                            </div>
                            {item.fonte && !editMode && (
                              <div className="text-[10px] text-[#555555] mt-0.5 pl-0.5">
                                Ref: {item.fonte}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              <div className="flex justify-between pt-2 border-t border-[#2A2A2A]">
                <span className="text-sm font-semibold text-[#FAFAFA]">Total Materiais</span>
                <span className="text-sm font-bold text-amber-400">
                  {formatCurrency(view.totalMateriais || view.itens.reduce((a, i) => a + i.total, 0))}
                </span>
              </div>
            </div>
          </Section>
        )}

        {/* Mão de obra */}
        {view.maoDeObra.length > 0 && (
          <Section title="Mão de Obra" icon={<Users className="w-4 h-4" />}>
            <div className="space-y-1">
              {view.maoDeObra.map((item, i) => (
                editMode ? (
                  <EditMdoRow key={i} item={item} onChange={(f, v) => updateMdo(i, f, v)} />
                ) : (
                  <MaoDeObraRow key={i} item={item} />
                )
              ))}
              <div className="flex justify-between pt-2 border-t border-[#2A2A2A]">
                <span className="text-sm font-semibold text-[#FAFAFA]">Total Mão de Obra</span>
                <span className="text-sm font-bold text-amber-400">
                  {formatCurrency(view.totalMaoDeObra || view.maoDeObra.reduce((a, i) => a + i.total, 0))}
                </span>
              </div>
            </div>
          </Section>
        )}

        {/* Cronograma */}
        {view.cronograma.length > 0 && (
          <Section title="Cronograma" icon={<Calendar className="w-4 h-4" />}>
            <div className="space-y-2">
              {view.cronograma.map((fase, i) => (
                <CronogramaRow key={i} fase={fase} />
              ))}
            </div>
          </Section>
        )}

        {/* Observações */}
        {(view.observacoes || editMode) && (
          <Section title="Observações">
            {editMode && editDados ? (
              <textarea
                value={editDados.observacoes}
                onChange={(e) => setField('observacoes', e.target.value)}
                rows={3}
                className="w-full text-sm text-[#A3A3A3] bg-transparent border border-[#2A2A2A] rounded px-2 py-1.5 focus:outline-none focus:border-amber-500/50 resize-none"
              />
            ) : (
              <p className="text-sm text-[#A3A3A3] leading-relaxed">{view.observacoes}</p>
            )}
          </Section>
        )}
      </div>
    </div>
  )
}

function parseFloatSafe(v: string): number | null {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function NumericInput({
  value,
  onChange,
  className,
}: {
  value: number
  onChange: (v: number) => void
  className?: string
}) {
  return (
    <input
      type="number"
      defaultValue={value}
      onBlur={(e) => {
        const n = parseFloat(e.target.value)
        if (Number.isFinite(n)) onChange(n)
      }}
      className={className}
    />
  )
}

function EditableInfoRow({
  label,
  value,
  editing,
  onChange,
}: {
  label: string
  value: string
  editing: boolean
  onChange: (v: string) => void
}) {
  if (editing) {
    return (
      <div className="flex gap-2">
        <dt className="text-[#666666] w-24 flex-shrink-0">{label}:</dt>
        <dd className="flex-1">
          <input
            type="text"
            defaultValue={value}
            onBlur={(e) => onChange(e.target.value)}
            className="w-full bg-transparent border-b border-[#2A2A2A] text-[#FAFAFA] focus:outline-none focus:border-amber-500/50 text-sm"
          />
        </dd>
      </div>
    )
  }
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

function MaoDeObraRow({ item }: { item: MaoDeObra }) {
  return (
    <div className="py-1.5 border-b border-[#1A1A1A] last:border-0">
      <div className="flex items-center justify-between text-xs">
        <span className={`flex-1 pr-2 ${item.semHistorico ? 'text-amber-400/80' : 'text-[#A3A3A3]'}`}>
          {item.semHistorico && '⚠️ '}{item.funcao}
        </span>
        <span className="text-[#666666] w-24 text-center">
          {item.qtd}x · {item.dias}d
        </span>
        <span className="text-[#FAFAFA] w-24 text-right font-medium">
          {formatCurrency(item.total)}
        </span>
      </div>
      {item.fonte && (
        <div className="text-[10px] text-[#555555] mt-0.5 pl-0.5">
          Ref: {item.fonte}
        </div>
      )}
    </div>
  )
}

function EditMdoRow({
  item,
  onChange,
}: {
  item: MaoDeObra
  onChange: (field: keyof MaoDeObra, value: number) => void
}) {
  return (
    <div className="flex items-center justify-between text-xs py-1.5 border-b border-[#1A1A1A] last:border-0 gap-1">
      <span className="text-[#A3A3A3] flex-1 pr-1">{item.funcao}</span>
      <div className="flex items-center gap-1 text-[#666666]">
        <NumericInput
          value={item.qtd}
          onChange={(v) => onChange('qtd', v)}
          className="w-8 text-center bg-transparent border-b border-[#2A2A2A] focus:outline-none"
        />
        <span>× </span>
        <NumericInput
          value={item.dias}
          onChange={(v) => onChange('dias', v)}
          className="w-8 text-center bg-transparent border-b border-[#2A2A2A] focus:outline-none"
        />
        <span>d ×</span>
        <NumericInput
          value={item.valorDia}
          onChange={(v) => onChange('valorDia', v)}
          className="w-16 text-right bg-transparent border-b border-[#2A2A2A] focus:outline-none text-[#FAFAFA]"
        />
      </div>
      <span className="text-[#FAFAFA] w-20 text-right font-medium">
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
