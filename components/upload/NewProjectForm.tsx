'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Upload, X, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function NewProjectForm() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [aiProvider, setAiProvider] = useState<'claude' | 'openai'>('claude')
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const ACCEPTED_EXTS = ['.pdf', '.docx', '.doc', '.msg', '.eml', '.xlsx', '.xls', '.txt', '.zip']

  function isAccepted(f: File): boolean {
    const name = f.name.toLowerCase()
    return ACCEPTED_EXTS.some((ext) => name.endsWith(ext))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped && isAccepted(dropped)) {
      setFile(dropped)
      setError('')
    } else {
      setError('Formato não suportado. Use PDF, DOCX, MSG, EML, XLSX, TXT ou ZIP.')
    }
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
      // Create project
      const res = await fetch('/api/projetos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, descricao, aiProvider }),
      })

      if (!res.ok) throw new Error('Erro ao criar projeto')
      const projeto = await res.json()

      // Upload PDF if provided
      if (file) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('projetoId', projeto.id)

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        if (!uploadRes.ok) throw new Error('Erro ao fazer upload do PDF')
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
        <label className="block text-sm font-medium text-[#FAFAFA] mb-1.5">
          Nome do Projeto <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Construção de UBS — Edital 001/2025"
          className="w-full h-9 rounded-md border border-[#2A2A2A] bg-[#0A0A0A] px-3 text-sm text-[#FAFAFA] placeholder:text-[#666666] focus:outline-none focus:ring-1 focus:ring-amber-500"
          disabled={loading}
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-[#FAFAFA] mb-1.5">
          Descrição <span className="text-[#666666] font-normal">(opcional)</span>
        </label>
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Breve descrição do projeto ou observações relevantes"
          rows={3}
          className="w-full rounded-md border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#666666] focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
          disabled={loading}
        />
      </div>

      {/* AI Provider */}
      <div>
        <label className="block text-sm font-medium text-[#FAFAFA] mb-1.5">
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
        <p className="text-xs text-[#666666] mt-1.5">
          O modelo será usado para analisar o edital e gerar o orçamento
        </p>
      </div>

      {/* PDF Upload */}
      <div>
        <label className="block text-sm font-medium text-[#FAFAFA] mb-1.5">
          Carta Convite / Edital <span className="text-[#666666] font-normal">(opcional — pode enviar depois)</span>
        </label>

        {file ? (
          <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <FileText className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{file.name}</div>
              <div className="text-xs text-[#A3A3A3]">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="text-[#A3A3A3] hover:text-[#FAFAFA] transition-colors"
              disabled={loading}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed cursor-pointer transition-all p-8 text-center ${
              isDragging
                ? 'border-amber-500 bg-amber-500/5'
                : 'border-[#2A2A2A] hover:border-amber-500/50 hover:bg-[#111111]'
            }`}
          >
            <Upload className="w-8 h-8 text-[#A3A3A3] mx-auto mb-3" />
            <p className="text-sm text-[#A3A3A3]">
              Arraste o arquivo aqui ou{' '}
              <span className="text-amber-400 font-medium">clique para selecionar</span>
            </p>
            <p className="text-xs text-[#666666] mt-1">PDF · DOCX · MSG · EML · XLSX · TXT · ZIP</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.msg,.eml,.xlsx,.xls,.txt,.zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  if (isAccepted(f)) { setFile(f); setError('') }
                  else setError('Formato não suportado. Use PDF, DOCX, MSG, EML, XLSX, TXT ou ZIP.')
                }
              }}
            />
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
              {file ? 'Enviando arquivo...' : 'Criando projeto...'}
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
