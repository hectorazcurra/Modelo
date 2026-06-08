'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Paperclip, X, FileText } from 'lucide-react'

const ACCEPTED_EXTS = [
  '.pdf', '.docx', '.doc', '.msg', '.eml',
  '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.zip',
]

function isAccepted(f: File): boolean {
  return ACCEPTED_EXTS.some((ext) => f.name.toLowerCase().endsWith(ext))
}

interface ChatInputProps {
  onSend: (message: string) => void
  isLoading: boolean
  onUpload?: (files: File[]) => Promise<void>
  isUploading?: boolean
}

export function ChatInput({ onSend, isLoading, onUpload, isUploading }: ChatInputProps) {
  const [input, setInput] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [input])

  function addFiles(incoming: FileList | File[]) {
    const valid = Array.from(incoming).filter(isAccepted)
    if (!valid.length) return
    setPendingFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name))
      return [...prev, ...valid.filter((f) => !existing.has(f.name))]
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (isLoading || isUploading) return

    if (pendingFiles.length > 0 && onUpload) {
      await onUpload(pendingFiles)
      setPendingFiles([])
      if (trimmed) onSend(trimmed)
      setInput('')
      return
    }

    if (!trimmed) return
    onSend(trimmed)
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  const busy = isLoading || isUploading

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {/* Pending files chips */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pendingFiles.map((f) => (
            <div
              key={f.name}
              className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 pl-2.5 pr-1.5 py-0.5 text-xs text-[var(--accent-text)]"
            >
              <FileText className="w-3 h-3 flex-shrink-0" />
              <span className="max-w-[140px] truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => setPendingFiles((p) => p.filter((x) => x.name !== f.name))}
                className="text-[var(--accent-text)]/60 hover:text-[var(--accent-text)]"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Paperclip upload */}
        {onUpload && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              title="Anexar arquivos"
              className="flex-shrink-0 w-9 h-9 rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface)] flex items-center justify-center text-[var(--fg-faint)] hover:text-[var(--accent-text)] hover:border-amber-500/40 transition-colors disabled:opacity-40"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Paperclip className="w-4 h-4" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.msg,.eml,.xlsx,.xls,.pptx,.ppt,.txt,.zip"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            pendingFiles.length
              ? 'Mensagem opcional (Enter para enviar com arquivos)'
              : 'Mensagem… (Enter para enviar, Shift+Enter para nova linha)'
          }
          rows={1}
          disabled={busy}
          className="flex-1 rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-sm text-[var(--fg-base)] placeholder:text-[var(--fg-faint)] focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none overflow-hidden disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={busy || (!input.trim() && !pendingFiles.length)}
          className="flex-shrink-0 w-9 h-9 rounded-xl bg-amber-500 text-black flex items-center justify-center hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </form>
  )
}
