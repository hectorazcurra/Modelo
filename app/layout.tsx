import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Metodo Engenharia — Orçamentos de Obras Públicas',
  description:
    'Plataforma inteligente para análise de editais e geração de orçamentos de obras públicas com IA.',
}

// Inline pre-hydration script — applies the persisted theme class BEFORE React
// renders, so the user never sees a flash of the wrong theme. Default is light
// (dashboard is the entry); user override is stored in localStorage 'theme'.
const themeBootstrap = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})()`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--bg-base)] text-[var(--fg-base)]">{children}</body>
    </html>
  )
}
