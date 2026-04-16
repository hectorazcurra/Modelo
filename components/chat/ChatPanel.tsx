'use client'

import { useRef, useEffect } from 'react'
import { Bot, User } from 'lucide-react'
import type { UIMessage } from 'ai'
import { ChatInput } from './ChatInput'

interface ChatPanelProps {
  messages: UIMessage[]
  onSendMessage: (content: string) => void
  isLoading: boolean
  projeto: { nome: string; aiProvider: string }
  onAnalyze: () => void
  hasPdf: boolean
}

export function ChatPanel({
  messages,
  onSendMessage,
  isLoading,
  onAnalyze,
  hasPdf,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
              <Bot className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="font-medium text-[#FAFAFA] mb-2">Asistente de Presupuestos</h3>
            <p className="text-sm text-[#A3A3A3] mb-6 max-w-xs">
              {hasPdf
                ? 'El pliego ha sido cargado. Haga clic en "Analizar Pliego" para comenzar el análisis con IA.'
                : 'Suba un pliego en PDF o describa el proyecto para generar el presupuesto.'}
            </p>
            {hasPdf && (
              <button
                onClick={onAnalyze}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-400 hover:bg-amber-500/15 transition-colors disabled:opacity-50"
              >
                <Bot className="w-4 h-4" />
                Analizar Pliego con IA
              </button>
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

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-[#2A2A2A] p-4">
        <ChatInput onSend={onSendMessage} isLoading={isLoading} />
      </div>
    </div>
  )
}

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
