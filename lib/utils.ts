import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { StatusProjeto } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

export function statusLabel(status: StatusProjeto): string {
  const labels: Record<StatusProjeto, string> = {
    ANALISE: 'Em Análise',
    ORCAMENTO: 'Orçamento',
    REVISAO: 'Em Revisão',
    APROVADO: 'Aprovado',
  }
  return labels[status]
}

export function statusColor(status: StatusProjeto): string {
  const colors: Record<StatusProjeto, string> = {
    ANALISE: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    ORCAMENTO: 'bg-amber-500/20 text-[var(--accent-text)] border-amber-500/30',
    REVISAO: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    APROVADO: 'bg-green-500/20 text-green-400 border-green-500/30',
  }
  return colors[status]
}

export function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export function excerpt(text: string | undefined, max: number): string | null {
  return text ? text.replace(/\s+/g, ' ').slice(0, max).trim() : null
}

export function extractOs(fonte: string): string | null {
  const m = fonte.match(/OS\s+([\d.\-/]+)/i)
  return m ? m[1] : null
}
