'use client'

import { useRef, useEffect, useState } from 'react'
import { Bot, User, Upload, AlertCircle } from 'lucide-react'
import type { UIMessage } from 'ai'
import { ChatInput } from './ChatInput'

const ACCEPTED_EXTS = [
  '.pdf', '.docx', '.doc', '.msg', '.eml',
  '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.zip',
]

function isAccepted(f: File): boolean {
  return ACCEPTED_EXTS.some((ext) => f.name.toLowerCase().endsWith(ext))
}

interface ChatPanelProps {
  messages: UIMessage[]
  onSendMessage: (content: string) => void
  isLoading: boolean
  projeto: { nome: string; aiProvider: string }
  onAnalyze: () => void
  hasPdf: boolean
  onUpload: (files: File[]) => Promise<void>
  isUploading: boolean
  error?: Error
}

export function ChatPanel({
  messages,
  onSendMessage,
  isLoading,
  onAnalyze,
  hasPdf,
  onUpload,
  isUploading,
  error,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const valid = Array.from(e.dataTransfer.files).filter(isAccepted)
    if (valid.length) onUpload(valid)
  }

  return (
    <div
      className="flex flex-col h-full"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false) }}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-amber-500 bg-amber-500/5 pointer-events-none">
          <div className="text-center">
            <Upload className="w-10 h-10 text-amber-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-amber-400">Solte os arquivos aqui</p>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
              <Bot className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="font-medium text-[#FAFAFA] mb-2">Assistente de Orçamentos</h3>

            {hasPdf ? (
              <>
                <p className="text-sm text-[#A3A3A3] mb-5 max-w-xs">
                  Documentos carregados. Clique em "Analisar" para gerar o orçamento, ou envie mais arquivos.
                </p>
                <button
                  onClick={onAnalyze}
                  disabled={isLoading || isUploading}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-400 hover:bg-amber-500/15 transition-colors disabled:opacity-50"
                >
                  <Bot className="w-4 h-4" />
                  Analisar com IA
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-[#A3A3A3] mb-5 max-w-xs">
                  Carregue a carta convite, edital ou qualquer documento do projeto para começar.
                </p>
                <UploadZone onUpload={onUpload} isUploading={isUploading} />
              </>
            )}
          </div>
        ) : (
          messages.map((message) => <ChatMessage key={message.id} message={message} />)
        )}

        {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant') && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400/60 animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 rounded-full bg-amber-400/60 animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 rounded-full bg-amber-400/60 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-red-300 max-w-[85%] whitespace-pre-wrap">
              <div className="font-medium mb-1">Erro no chat</div>
              <div className="text-xs opacity-90">{error.message || String(error)}</div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-[#2A2A2A] p-4">
        <ChatInput
          onSend={onSendMessage}
          isLoading={isLoading}
          onUpload={onUpload}
          isUploading={isUploading}
        />
      </div>
    </div>
  )
}

// ── Upload drop zone (shown in empty state when no files yet) ─────────────────

function UploadZone({
  onUpload,
  isUploading,
}: {
  onUpload: (files: File[]) => Promise<void>
  isUploading: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      onClick={() => !isUploading && fileInputRef.current?.click()}
      className="w-full max-w-xs rounded-xl border-2 border-dashed border-[#2A2A2A] hover:border-amber-500/50 hover:bg-[#111111] cursor-pointer transition-all p-6 text-center"
    >
      <Upload className="w-7 h-7 text-[#A3A3A3] mx-auto mb-2" />
      <p className="text-sm text-[#A3A3A3]">
        {isUploading ? 'Processando…' : (
          <>Clique ou arraste arquivos</>
        )}
      </p>
      <p className="text-xs text-[#555555] mt-1">
        PDF · DOCX · PPTX · MSG · EML · XLSX · TXT · ZIP
      </p>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.msg,.eml,.xlsx,.xls,.pptx,.ppt,.txt,.zip"
        className="hidden"
        onChange={(e) => {
          if (!e.target.files?.length) return
          const valid = Array.from(e.target.files).filter(isAccepted)
          if (valid.length) onUpload(valid)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ── Message rendering ─────────────────────────────────────────────────────────

function getMessageText(message: UIMessage): string {
  for (const part of message.parts) {
    if (part.type === 'text') return part.text
  }
  return ''
}

function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'
  const text = getMessageText(message)
  if (!text) return null

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
          isUser
            ? 'bg-blue-500/20 border border-blue-500/30'
            : 'bg-amber-500/20 border border-amber-500/30'
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-blue-400" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-amber-400" />
        )}
      </div>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-blue-500/10 border border-blue-500/20 rounded-tr-sm text-[#FAFAFA]'
            : 'bg-[#1A1A1A] border border-[#2A2A2A] rounded-tl-sm text-[#FAFAFA]'
        }`}
      >
        {text}
      </div>
    </div>
  )
}
