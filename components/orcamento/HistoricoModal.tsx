'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { HistoricoDetalheView } from './HistoricoDetalheView'
import { withBase } from '@/lib/basePath'
import type { HistoricoDados } from '@/types'

interface HistoricoModalProps {
  os: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type CacheEntry =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ok'; dados: HistoricoDados }

export function HistoricoModal({ os, open, onOpenChange }: HistoricoModalProps) {
  const cache = useRef<Map<string, CacheEntry>>(new Map())
  const [entry, setEntry] = useState<CacheEntry | null>(null)

  useEffect(() => {
    if (!open || !os) return

    const cached = cache.current.get(os)
    if (cached) {
      setEntry(cached)
      return
    }

    const loading: CacheEntry = { state: 'loading' }
    cache.current.set(os, loading)
    setEntry(loading)

    fetch(withBase(`/api/historicos/${encodeURIComponent(os)}`))
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<HistoricoDados>
      })
      .then((dados) => {
        const ok: CacheEntry = { state: 'ok', dados }
        cache.current.set(os, ok)
        setEntry(ok)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        const error: CacheEntry = { state: 'error', message: msg }
        cache.current.set(os, error)
        setEntry(error)
      })
  }, [os, open])

  const cliente = entry?.state === 'ok' ? entry.dados.cliente : null
  const title = os ? `OS ${os}${cliente ? ` — ${cliente}` : ''}` : 'Projeto histórico'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {entry?.state === 'ok' && entry.dados.statusComercial && (
            <DialogDescription>{entry.dados.statusComercial}</DialogDescription>
          )}
        </DialogHeader>

        {!entry || entry.state === 'loading' ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400/60 animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 rounded-full bg-amber-400/60 animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-amber-400/60 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        ) : entry.state === 'error' ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Projeto não encontrado: {entry.message}</span>
          </div>
        ) : (
          <HistoricoDetalheView os={os!} dados={entry.dados} mode="modal" />
        )}
      </DialogContent>
    </Dialog>
  )
}
