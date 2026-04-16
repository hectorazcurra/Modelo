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

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.type === 'application/pdf') {
      setFile(dropped)
    } else {
      setError('Solo se aceptan archivos PDF')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      setError('El nombre del proyecto es obligatorio')
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

      if (!res.ok) throw new Error('Error al crear el proyecto')
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

        if (!uploadRes.ok) throw new Error('Error al subir el PDF')
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
          Nombre del Proyecto <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ej: Construcción de centro de salud — Pliego 001/2025"
          className="w-full h-9 rounded-md border border-[#2A2A2A] bg-[#0A0A0A] px-3 text-sm text-[#FAFAFA] placeholder:text-[#666666] focus:outline-none focus:ring-1 focus:ring-amber-500"
          disabled={loading}
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-[#FAFAFA] mb-1.5">
          Descripción <span className="text-[#666666] font-normal">(opcional)</span>
        </label>
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Breve descripción del proyecto u observaciones relevantes"
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
          El modelo se usará para analizar el pliego y generar el presupuesto
        </p>
      </div>

      {/* PDF Upload */}
      <div>
        <label className="block text-sm font-medium text-[#FAFAFA] mb-1.5">
          Pliego en PDF <span className="text-[#666666] font-normal">(opcional — puede enviarlo después)</span>
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
              Arrastre el PDF aquí o{' '}
              <span className="text-amber-400 font-medium">haga clic para seleccionar</span>
            </p>
            <p className="text-xs text-[#666666] mt-1">Solo archivos PDF</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setFile(f)
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
              {file ? 'Subiendo PDF...' : 'Creando proyecto...'}
            </>
          ) : (
            'Crear Proyecto'
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
