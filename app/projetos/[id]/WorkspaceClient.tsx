'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useChat } from '@ai-sdk/react'
import { TextStreamChatTransport, type UIMessage } from 'ai'
import { Building2, ArrowLeft, FileText, Settings2 } from 'lucide-react'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { OrcamentoPanel } from '@/components/orcamento/OrcamentoPanel'
import { Badge } from '@/components/ui/badge'
import { statusLabel, statusColor } from '@/lib/utils'
import { withBase } from '@/lib/basePath'
import type { StatusProjeto, OrcamentoDados, LinhaBaseInfo } from '@/types'

interface WorkspaceClientProps {
  projeto: {
    id: string
    nome: string
    status: string
    aiProvider: string
    pdfNome: string | null
    hasPdf: boolean
  }
  initialMessages: UIMessage[]
  initialOrcamento: {
    dados: OrcamentoDados
    versao: number
    aprovado: boolean
  } | null
}

export function WorkspaceClient({
  projeto,
  initialMessages,
  initialOrcamento,
}: WorkspaceClientProps) {
  const [orcamento, setOrcamento] = useState(initialOrcamento)
  const [aprovado, setAprovado] = useState(initialOrcamento?.aprovado ?? false)
  const [hasPdf, setHasPdf] = useState(projeto.hasPdf)
  const [pdfNome, setPdfNome] = useState(projeto.pdfNome)
  const [isUploading, setIsUploading] = useState(false)

  const { messages, sendMessage, status, error } = useChat({
    transport: new TextStreamChatTransport({
      api: withBase('/api/chat'),
      body: { projetoId: projeto.id },
    }),
    messages: initialMessages,
    onError: (err) => {
      console.error('[chat] error:', err)
    },
    onFinish: async () => {
      // Refresh orcamento after each AI response
      const res = await fetch(withBase(`/api/orcamento/${projeto.id}`))
      if (res.ok) {
        const data = await res.json()
        setOrcamento({ dados: data.dados, versao: data.versao, aprovado: data.aprovado })
        setAprovado(data.aprovado)
      }
    },
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  const handleSendMessage = useCallback(
    async (content: string) => {
      // Save user message to DB
      fetch(withBase(`/api/projetos/${projeto.id}/mensagem`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conteudo: content }),
      }).catch(() => {})

      await sendMessage({ text: content })
    },
    [sendMessage, projeto.id]
  )

  const handleAnalyze = useCallback(async () => {
    await sendMessage({
      text: 'Por favor, analise o edital carregado e gere um orçamento inicial detalhado com todos os itens, custos por m², mão de obra e cronograma.',
    })
  }, [sendMessage])

  const handleUpload = useCallback(
    async (files: File[]) => {
      setIsUploading(true)
      try {
        const formData = new FormData()
        formData.append('projetoId', projeto.id)
        for (const f of files) formData.append('file', f)

        const res = await fetch(withBase('/api/upload'), { method: 'POST', body: formData })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? 'Erro ao fazer upload')
        }
        const data = await res.json()
        setHasPdf(true)
        setPdfNome(data.arquivos?.join(', ') ?? files.map((f) => f.name).join(', '))

        await sendMessage({
          text: 'Por favor, analise os documentos carregados e execute o fluxo completo de análise: identificação, mapeamento na base histórica, projeção de horas e orçamento consolidado.',
        })
      } finally {
        setIsUploading(false)
      }
    },
    [projeto.id, sendMessage]
  )

  const handleAprovar = useCallback(async () => {
    const res = await fetch(withBase(`/api/orcamento/${projeto.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aprovado: true }),
    })
    if (res.ok) {
      setAprovado(true)
      setOrcamento((prev) => (prev ? { ...prev, aprovado: true } : prev))
    }
  }, [projeto.id])

  const handleSalvarEdicao = useCallback(
    async (dados: OrcamentoDados) => {
      const res = await fetch(withBase(`/api/orcamento/${projeto.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dados }),
      })
      if (res.ok) {
        const data = await res.json()
        setOrcamento({ dados: data.dados, versao: data.versao, aprovado: data.aprovado })
      }
    },
    [projeto.id]
  )

  const handleConfirmarLinha = useCallback(
    async (linha: LinhaBaseInfo) => {
      await fetch(withBase(`/api/orcamento/${projeto.id}/confirmar-linha`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linha }),
      })
    },
    [projeto.id]
  )

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-base)] overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-[var(--border-base)] bg-[var(--bg-base)]/95 backdrop-blur-md px-4 h-14 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg-base)] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>

        <div className="w-px h-4 bg-[var(--border-base)] flex-shrink-0" />

        <Link href="/" className="flex-shrink-0">
          <div className="w-7 h-7 rounded-md bg-amber-500 flex items-center justify-center">
            <Building2 className="w-3.5 h-3.5 text-black" strokeWidth={2.5} />
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">{projeto.nome}</h1>
          {pdfNome && (
            <p className="text-xs text-[var(--fg-muted)] truncate flex items-center gap-1">
              <FileText className="w-3 h-3 text-[var(--accent-text)]" />
              {pdfNome}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge className={statusColor(projeto.status as StatusProjeto)}>
            {statusLabel(projeto.status as StatusProjeto)}
          </Badge>
          <span className="hidden sm:flex items-center gap-1 text-xs text-[var(--fg-faint)] border border-[var(--border-base)] rounded px-2 py-0.5">
            <Settings2 className="w-3 h-3" />
            {projeto.aiProvider === 'claude' ? 'Claude' : 'GPT-4o'}
          </span>
        </div>
      </header>

      {/* Split screen */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat panel — 40% */}
        <div className="w-[40%] min-w-[300px] flex flex-col border-r border-[var(--border-base)] overflow-hidden">
          <div className="flex-shrink-0 px-4 py-2.5 border-b border-[var(--border-base)] bg-[var(--bg-surface)]">
            <span className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider">
              Chat
            </span>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              projeto={{ nome: projeto.nome, aiProvider: projeto.aiProvider }}
              onAnalyze={handleAnalyze}
              hasPdf={hasPdf}
              onUpload={handleUpload}
              isUploading={isUploading}
              error={error}
            />
          </div>
        </div>

        {/* Orcamento panel — 60% */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-4 py-2.5 border-b border-[var(--border-base)] bg-[var(--bg-surface)] flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider">
              Orçamento
            </span>
            {orcamento && (
              <span className="text-xs text-[var(--fg-faint)]">v{orcamento.versao}</span>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <OrcamentoPanel
              dados={orcamento?.dados ?? null}
              versao={orcamento?.versao ?? 1}
              aprovado={aprovado}
              onAprovar={handleAprovar}
              onSalvarEdicao={handleSalvarEdicao}
              onConfirmarLinha={handleConfirmarLinha}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
