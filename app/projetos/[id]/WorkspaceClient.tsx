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
import type { StatusProjeto, OrcamentoDados } from '@/types'

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

  const { messages, sendMessage, status } = useChat({
    transport: new TextStreamChatTransport({
      api: '/api/chat',
      body: { projetoId: projeto.id },
    }),
    messages: initialMessages,
    onFinish: async () => {
      // Refresh orcamento after each AI response
      const res = await fetch(`/api/orcamento/${projeto.id}`)
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
      fetch(`/api/projetos/${projeto.id}/mensagem`, {
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
      text: 'Por favor, analiza el pliego cargado y genera un presupuesto inicial detallado con todos los ítems, costos por m², mano de obra y cronograma.',
    })
  }, [sendMessage])

  const handleAprovar = useCallback(async () => {
    const res = await fetch(`/api/orcamento/${projeto.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aprovado: true }),
    })
    if (res.ok) {
      setAprovado(true)
      setOrcamento((prev) => (prev ? { ...prev, aprovado: true } : prev))
    }
  }, [projeto.id])

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0A] overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-[#2A2A2A] bg-[#0A0A0A]/95 backdrop-blur-md px-4 h-14 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-sm text-[#A3A3A3] hover:text-[#FAFAFA] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>

        <div className="w-px h-4 bg-[#2A2A2A] flex-shrink-0" />

        <Link href="/" className="flex-shrink-0">
          <div className="w-7 h-7 rounded-md bg-amber-500 flex items-center justify-center">
            <Building2 className="w-3.5 h-3.5 text-black" strokeWidth={2.5} />
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">{projeto.nome}</h1>
          {projeto.pdfNome && (
            <p className="text-xs text-[#A3A3A3] truncate flex items-center gap-1">
              <FileText className="w-3 h-3 text-amber-400" />
              {projeto.pdfNome}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge className={statusColor(projeto.status as StatusProjeto)}>
            {statusLabel(projeto.status as StatusProjeto)}
          </Badge>
          <span className="hidden sm:flex items-center gap-1 text-xs text-[#666666] border border-[#2A2A2A] rounded px-2 py-0.5">
            <Settings2 className="w-3 h-3" />
            {projeto.aiProvider === 'claude' ? 'Claude' : 'GPT-4o'}
          </span>
        </div>
      </header>

      {/* Split screen */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat panel — 40% */}
        <div className="w-[40%] min-w-[300px] flex flex-col border-r border-[#2A2A2A] overflow-hidden">
          <div className="flex-shrink-0 px-4 py-2.5 border-b border-[#2A2A2A] bg-[#111111]">
            <span className="text-xs font-medium text-[#A3A3A3] uppercase tracking-wider">
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
              hasPdf={projeto.hasPdf}
            />
          </div>
        </div>

        {/* Orcamento panel — 60% */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-4 py-2.5 border-b border-[#2A2A2A] bg-[#111111] flex items-center justify-between">
            <span className="text-xs font-medium text-[#A3A3A3] uppercase tracking-wider">
              Presupuesto
            </span>
            {orcamento && (
              <span className="text-xs text-[#666666]">v{orcamento.versao}</span>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <OrcamentoPanel
              dados={orcamento?.dados ?? null}
              versao={orcamento?.versao ?? 1}
              aprovado={aprovado}
              onAprovar={handleAprovar}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
