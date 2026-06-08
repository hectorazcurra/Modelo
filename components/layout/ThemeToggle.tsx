'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

// Toggle the `dark` class on <html> and persist the choice. Default is light
// (the dashboard is the entry). A pre-hydration script in app/layout.tsx
// applies the persisted value before React renders, avoiding flash.
export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !isDark
    setIsDark(next)
    if (next) {
      document.documentElement.classList.add('dark')
      try {
        localStorage.setItem('theme', 'dark')
      } catch {}
    } else {
      document.documentElement.classList.remove('dark')
      try {
        localStorage.setItem('theme', 'light')
      } catch {}
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? 'Mudar para claro' : 'Mudar para escuro'}
      aria-label={isDark ? 'Mudar para claro' : 'Mudar para escuro'}
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--border-base)] bg-[var(--bg-elev)] text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:border-amber-500/40 transition-colors"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  )
}
