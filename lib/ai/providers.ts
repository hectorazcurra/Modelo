import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { AIProvider } from '@/types'

const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export function getModel(provider: AIProvider) {
  if (provider === 'claude') {
    return anthropicProvider('claude-sonnet-4-6')
  }
  return openaiProvider('gpt-4o')
}

export function getProviderLabel(provider: AIProvider): string {
  return provider === 'claude' ? 'Claude (Anthropic)' : 'GPT-4o (OpenAI)'
}
