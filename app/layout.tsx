import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Metodo Engenharia — Orçamentos de Obras Públicas',
  description:
    'Plataforma inteligente para análise de editais e geração de orçamentos de obras públicas com IA.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#0A0A0A] text-[#FAFAFA]">{children}</body>
    </html>
  )
}
