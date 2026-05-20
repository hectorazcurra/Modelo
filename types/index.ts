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

// Structured markup applied on top of cost to reach the client price. Mirrors
// the DASHBOARD layout of the Pricing template (modalidade Empreitada vs
// Administração; Margem = principal + 3 outros; Impostos = 3-4 componentes).
// Values are stored in PERCENT (11 = 11%) for UI ergonomics. `bdiCalculado`
// is the determinista result of the modalidade-specific formula and equals
// `variacaoPerc` for back-compat with code that only reads the single number.
export interface BdiComponente {
  label: string
  valor: number   // percent (11 = 11%)
}
export interface BdiOrcamento {
  modalidade: 'empreitada' | 'administracao'
  margemComponentes: BdiComponente[]    // first item = principal (Lucro|Taxa Admin)
  impostosComponentes: BdiComponente[]  // PIS, COFINS, ISSQN, CPRB, ...
  bdiCalculado: number                  // percent
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
    // Contract modalidade ('empreitada' | 'administracao'). Auto-detected from
    // the edital ("Execução de Obra" → administracao; else empreitada) and
    // user-editable on the panel. Determines which BDI formula applies.
    modalidade?: 'empreitada' | 'administracao'
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
  // variacaoPerc é o markup único usado por `precoVenda = custoTotal × (1 +
  // variacaoPerc/100)`. Quando `bdi` está preenchido, variacaoPerc é DERIVADO
  // de `bdi.bdiCalculado` (recomputeTotais garante o nexo). Quando `bdi` está
  // ausente (orçamento legado), variacaoPerc é o único campo editável.
  variacaoPerc: number
  // Composição estruturada do BDI: modalidade + componentes editáveis. Quando
  // presente, é a fonte da verdade; `variacaoPerc` é derivado dele.
  bdi?: BdiOrcamento
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
    // Structured BDI breakdown extracted from DASHBOARD A24/D24–D35.
    // Lets the UI show Lucro / Taxa Admin as primary editable and the rest in
    // an "Avançado" expansible. bdiCalculado equals the legacy `bdi` value.
    bdiBlock?: {
      modalidade?: 'empreitada' | 'administracao' | null
      margemComponentes?: Array<{ label: string; valor: number }>
      impostosComponentes?: Array<{ label: string; valor: number }>
      bdiCalculado?: number
      formula?: string
    } | null
    modalidade?: 'empreitada' | 'administracao' | null
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
  // Structured material totals from the Tarefas aggregate row (separate from
  // `suprimentos` which is the free text of the "03. Suprimentos" folder).
  suprimentosTotais?: { custoTotal?: number; vendaTotal?: number } | null
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
