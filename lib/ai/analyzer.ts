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
  totalGeral: 0,
  observacoes: '',
}
