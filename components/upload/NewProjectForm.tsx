'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Upload, X, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { withBase } from '@/lib/basePath'

const ACCEPTED_EXTS = [
  '.pdf', '.docx', '.doc', '.msg', '.eml',
  '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.zip',
]

function isAccepted(f: File): boolean {
  const name = f.name.toLowerCase()
  return ACCEPTED_EXTS.some((ext) => name.endsWith(ext))
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function NewProjectForm() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [aiProvider, setAiProvider] = useState<'claude' | 'openai'>('claude')
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function addFiles(incoming: FileList | File[]) {
    const valid: File[] = []
    const rejected: string[] = []
    for (const f of Array.from(incoming)) {
      if (isAccepted(f)) valid.push(f)
      else rejected.push(f.name)
    }
    if (valid.length) {
      setFiles((prev) => {
        const existing = new Set(prev.map((f) => f.name))
        return [...prev, ...valid.filter((f) => !existing.has(f.name))]
      })
      setError('')
    }
    if (rejected.length) {
      setError(`Formato não suportado: ${rejected.join(', ')}`)
    }
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      setError('Nome do projeto é obrigatório')
      return
    }
    setLoading(true)
    setError('')

    try {
      const res = await fetch(withBase('/api/projetos'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, descricao, aiProvider }),
      })

      if (!res.ok) throw new Error('Erro ao criar projeto')
      const projeto = await res.json()

      if (files.length > 0) {
        const formData = new FormData()
        formData.append('projetoId', projeto.id)
        for (const f of files) formData.append('file', f)

        const uploadRes = await fetch(withBase('/api/upload'), {
          method: 'POST',
          body: formData,
        })

        if (!uploadRes.ok) {
          const body = await uploadRes.json().catch(() => ({}))
          throw new Error(body.error ?? 'Erro ao fazer upload dos arquivos')
        }
      }

      router.push(`/projetos/${projeto.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Project name */}
      <div>
        <label className="block text-sm font-medium text-[var(--fg-base)] mb-1.5">
          Nome do Projeto <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Construção de UBS — Edital 001/2025"
          className="w-full h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 text-sm text-[var(--fg-base)] placeholder:text-[var(--fg-faint)] focus:outline-none focus:ring-1 focus:ring-amber-500"
          disabled={loading}
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-[var(--fg-base)] mb-1.5">
          Descrição <span className="text-[var(--fg-faint)] font-normal">(opcional)</span>
        </label>
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Breve descrição do projeto ou observações relevantes"
          rows={3}
          className="w-full rounded-md border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--fg-base)] placeholder:text-[var(--fg-faint)] focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
          disabled={loading}
        />
      </div>

      {/* AI Provider */}
      <div>
        <label className="block text-sm font-medium text-[var(--fg-base)] mb-1.5">
          Modelo de IA
        </label>
        <Select
          value={aiProvider}
          onValueChange={(v) => setAiProvider(v as 'claude' | 'openai')}
          disabled={loading}
        >
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="claude">Claude (Anthropic) — Recomendado</SelectItem>
            <SelectItem value="openai">GPT-4o (OpenAI)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-[var(--fg-faint)] mt-1.5">
          O modelo será usado para analisar o edital e gerar o orçamento
        </p>
      </div>

      {/* File Upload */}
      <div>
        <label className="block text-sm font-medium text-[var(--fg-base)] mb-1.5">
          Carta Convite / Documentos{' '}
          <span className="text-[var(--fg-faint)] font-normal">(opcional — pode enviar depois)</span>
        </label>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed cursor-pointer transition-all p-6 text-center ${
            isDragging
              ? 'border-amber-500 bg-amber-500/5'
              : 'border-[var(--border-base)] hover:border-amber-500/50 hover:bg-[var(--bg-surface)]'
          }`}
        >
          <Upload className="w-7 h-7 text-[var(--fg-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--fg-muted)]">
            Arraste arquivos aqui ou{' '}
            <span className="text-[var(--accent-text)] font-medium">clique para selecionar</span>
          </p>
          <p className="text-xs text-[var(--fg-faint)] mt-1">
            PDF · DOCX · PPTX · MSG · EML · XLSX · TXT · ZIP — múltiplos arquivos
          </p>
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
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {files.map((f) => (
              <div
                key={f.name}
                className="flex items-center gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2"
              >
                <FileText className="w-4 h-4 text-[var(--accent-text)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[var(--fg-base)] truncate">{f.name}</div>
                  <div className="text-[10px] text-[var(--fg-faint)]">{formatSize(f.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(f.name)}
                  disabled={loading}
                  className="text-[var(--fg-faint)] hover:text-[var(--fg-muted)] transition-colors flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={loading || !nome.trim()}
          className="flex-1 sm:flex-none sm:px-8"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {files.length ? `Enviando ${files.length} arquivo${files.length > 1 ? 's' : ''}…` : 'Criando projeto…'}
            </>
          ) : (
            'Criar Projeto'
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/dashboard')}
          disabled={loading}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
