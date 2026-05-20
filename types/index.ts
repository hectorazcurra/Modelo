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

export interface Referencia {
  os: string                  // OS code, e.g. "2026-013"
  equipe?: string             // equipe name in the historical project, e.g. "Equipe01"
  valorHora?: number          // R$/h from this reference
  totalHH?: number            // total HH from this equipe in the historical project
  cliente?: string            // client name for context
}

export interface OrcamentoItem {
  categoria: string
  descricao: string
  unidade: string
  qtd: number
  custoUnit: number
  total: number
  fonte?: string              // primary source (text), backward compatible
  fonteOs?: string            // primary OS code, backward compatible
  referencias?: Referencia[]  // additional sources averaged into the chosen rate
  semHistorico?: boolean
  status?: LinhaStatus
}

export interface MaoDeObra {
  funcao: string              // ONE professional/cargo (e.g. "Eng. Sr.", "Coord. Obra")
  // Team this professional belongs to (e.g. "Gerenciamento de Obra"). Used by
  // the UI to group rows under team sub-headers and by the AI to mirror the
  // mold's team/professional structure. Optional for backward compatibility
  // with older orçamentos that emitted one row per macro-function.
  equipe?: string
  qtd: number
  dias: number
  valorDia: number
  total: number
  fonte?: string              // primary source (text), backward compatible
  fonteOs?: string            // primary OS code, backward compatible
  referencias?: Referencia[]  // additional sources averaged into the chosen rate
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
    // Narrative summary of what the client is asking for (3-5 sentences,
    // plain language) so the user can validate hours/rates against intent.
    contexto?: string
    // Demand sub-category (canonical key: 'varejo' | 'edificacoes' |
    // 'infraestrutura'). Auto-classified, user-editable. Used as a RIGID
    // filter when picking the historical mold/envelope — same PRODUTO but
    // different tipologia have very different economics.
    tipologia?: string
  }
  escopo: string[]
  itens: OrcamentoItem[]
  custoM2: number
  areaTotal: number
  maoDeObra: MaoDeObra[]
  cronograma: FaseCronograma[]
  totalMateriais: number
  totalMaoDeObra: number
  // Custo direto = totalMateriais + totalMaoDeObra (linhas são CUSTO puro,
  // sem BDI/margem). variacaoPerc é o markup (%) aplicado por cima para
  // chegar ao preço cobrado do cliente. precoVenda = custoTotal × (1+var/100).
  // totalGeral é mantido = precoVenda (compatibilidade + clamp de envelope).
  custoTotal: number
  variacaoPerc: number
  precoVenda: number
  totalGeral: number
  observacoes: string
  // True when there is NO historical reference of this service type — the AI
  // must NOT fabricate values; the user inserts them manually.
  semReferencia?: boolean
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

export type PPUCategoria = { nome?: string; total?: number; itens?: unknown[] }
export type TextSection = { textoExtraido?: string } | null

export interface HistoricoDados {
  os?: string
  cliente?: string
  descricao?: string
  produto?: string
  tipologia?: string
  valorOrcado?: number | null
  margem?: number | null
  resultado?: number | null
  statusComercial?: string
  totalGeralPPU?: number | null
  mobilizacao?: number | null
  despesasOperacionais?: number | null
  maoDeObraCategoria?: number | null
  areaM2?: number | null
  revisao?: string | null
  dashboard?: {
    municipio?: string
    uf?: string
    prazoContrato?: number
    prazoUnidade?: string
    precoVenda?: number
    custoMaoDeObraDireta?: number
    custoTotal?: number
    margemValor?: number
    margemPerc?: number
    impostos?: number
    hhMOD?: number
    bdi?: number
    areaM2?: number
  } | null
  categorias?: PPUCategoria[] | null
  itens?: Array<{ descricao?: string; unidade?: string; qtd?: number; precoTotal?: number }> | null
  equipes?: Array<{
    nome?: string
    totalHH?: number
    custoTotal?: number
    custoPorHH?: number
    profissionais?: Array<{ funcao?: string; hh?: number; custo?: number }>
  }> | null
  cartaConvite?: TextSection
  suprimentos?: TextSection
  engenharia?: TextSection
  propostas?: TextSection
  outrosOrcamento?: TextSection
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
