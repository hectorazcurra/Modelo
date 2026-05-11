export type AIProvider = 'claude' | 'openai'

export type StatusProjeto = 'ANALISE' | 'ORCAMENTO' | 'REVISAO' | 'APROVADO'

export type LinhaStatus = 'pending' | 'accepted' | 'edited'

export interface LinhaBaseInfo {
  descricao: string
  unidade?: string
  custoUnit?: number
  valorDia?: number
  total: number
  tipo: 'item' | 'mdo'
}

export interface OrcamentoItem {
  categoria: string
  descricao: string
  unidade: string
  qtd: number
  custoUnit: number
  total: number
  fonte?: string
  semHistorico?: boolean
  status?: LinhaStatus
}

export interface MaoDeObra {
  funcao: string
  qtd: number
  dias: number
  valorDia: number
  total: number
  fonte?: string
  semHistorico?: boolean
  status?: LinhaStatus
}

export interface FaseCronograma {
  fase: string
  inicio: string
  fim: string
  percentual: number
}

export interface OrcamentoDados {
  resumo: {
    objeto: string
    local: string
    prazo: string
    responsavel: string
    numeroEdital?: string
  }
  escopo: string[]
  itens: OrcamentoItem[]
  custoM2: number
  areaTotal: number
  maoDeObra: MaoDeObra[]
  cronograma: FaseCronograma[]
  totalMateriais: number
  totalMaoDeObra: number
  totalGeral: number
  observacoes: string
}

export interface ProjetoComRelacoes {
  id: string
  nome: string
  descricao: string | null
  pdfNome: string | null
  pdfTexto: string | null
  status: StatusProjeto
  aiProvider: AIProvider
  criadoEm: Date
  atualizadoEm: Date
  mensagens: MensagemType[]
  orcamento: OrcamentoType | null
}

export interface MensagemType {
  id: string
  projetoId: string
  role: 'user' | 'assistant'
  conteudo: string
  criadoEm: Date
}

export interface OrcamentoType {
  id: string
  projetoId: string
  dados: OrcamentoDados
  versao: number
  aprovado: boolean
  criadoEm: Date
  atualizadoEm: Date
}

export interface ProjetoListItem {
  id: string
  nome: string
  descricao: string | null
  status: StatusProjeto
  aiProvider: AIProvider
  criadoEm: Date
  atualizadoEm: Date
  _count?: {
    mensagens: number
  }
  orcamento?: {
    totalGeral?: number
    aprovado: boolean
  } | null
}
