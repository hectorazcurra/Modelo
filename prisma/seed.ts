import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string)
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

async function main() {
  await prisma.baseConhecimento.createMany({
    data: [
      {
        tipo: 'custo_m2',
        titulo: 'Tabela de Custos por m² (referência 2024)',
        dados: {
          residencial_simples: { custoM2: 1800, descricao: 'Padrão simples, acabamento básico' },
          residencial_medio: { custoM2: 2800, descricao: 'Padrão médio, acabamento standard' },
          residencial_alto: { custoM2: 4500, descricao: 'Padrão alto, acabamento premium' },
          comercial_simples: { custoM2: 2200, descricao: 'Galpão comercial básico' },
          comercial_medio: { custoM2: 3500, descricao: 'Edifício comercial padrão' },
          institucional_ubs: { custoM2: 3200, descricao: 'UBS - Unidade Básica de Saúde' },
          institucional_escola: { custoM2: 2900, descricao: 'Escola pública padrão MEC' },
          industrial: { custoM2: 1900, descricao: 'Galpão industrial estrutura metálica' },
        },
      },
      {
        tipo: 'mao_de_obra',
        titulo: 'Tabela de Mão de Obra (SINAPI 2024)',
        dados: {
          engenheiro_civil: { valorDia: 900, categoria: 'Técnico' },
          engenheiro_eletrico: { valorDia: 850, categoria: 'Técnico' },
          mestre_obras: { valorDia: 350, categoria: 'Liderança' },
          pedreiro: { valorDia: 250, categoria: 'Operacional' },
          servente: { valorDia: 150, categoria: 'Operacional' },
          eletricista: { valorDia: 280, categoria: 'Especializado' },
          encanador: { valorDia: 270, categoria: 'Especializado' },
          carpinteiro: { valorDia: 260, categoria: 'Especializado' },
          pintor: { valorDia: 220, categoria: 'Especializado' },
          armador: { valorDia: 240, categoria: 'Especializado' },
        },
      },
      {
        tipo: 'projeto_anterior',
        titulo: 'Projeto: UBS São João — 2023',
        dados: {
          tipo: 'UBS',
          area: 450,
          valor: 1620000,
          custoM2: 3600,
          prazo: '18 meses',
          local: 'São Paulo, SP',
          principais_servicos: [
            'Fundação em radier',
            'Estrutura de concreto',
            'Alvenaria bloco cerâmico',
            'Cobertura telha sanduíche',
            'Instalações hidrossanitárias',
            'Instalações elétricas e SPDA',
            'Revestimentos e pintura',
            'Acessibilidade e paisagismo',
          ],
          licoes_aprendidas: 'Atentar para detalhes de acessibilidade NBR 9050. Previsão de BDI de 28%.',
        },
      },
      {
        tipo: 'projeto_anterior',
        titulo: 'Projeto: Escola Municipal Jardim Primavera — 2022',
        dados: {
          tipo: 'Escola',
          area: 1200,
          valor: 3840000,
          custoM2: 3200,
          prazo: '24 meses',
          local: 'Campinas, SP',
          principais_servicos: [
            'Fundação sapata',
            'Estrutura mista aço-concreto',
            'Alvenaria bloco cerâmico',
            'Cobertura laje impermeabilizada',
            'Instalações hidrossanitárias complexas',
            'Instalações elétricas',
            'Climatização',
            'Playground e quadra esportiva',
          ],
          licoes_aprendidas:
            'Incluir 15% de contingência para obras escolares. Atentar para ABNT NBR 12023.',
        },
      },
    ],
    skipDuplicates: true,
  })

  console.log('Base de conhecimento populada com sucesso!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
