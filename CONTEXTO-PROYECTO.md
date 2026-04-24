# Contexto del Proyecto — Metodo Engenharia

## ¿Qué es este sistema?

Plataforma SaaS para **Metodo Engenharia** (empresa brasileña de construcción civil) que permite:
1. Importar pliegos de licitación pública en PDF
2. Analizar los requisitos con IA (Claude o GPT-4o)
3. Generar presupuestos detallados con interfaz de chat split-screen
4. Aprobar y exportar el presupuesto final

**Cliente:** Metodo Engenharia  
**Desarrollado por:** Nato Digital  
**Idioma de la UI:** Español  
**Idioma del código/DB:** Portugués (variables internas)

---

## Stack Técnico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16.2.3 (App Router, TypeScript, Turbopack) |
| Estilos | Tailwind CSS v4 + shadcn/ui |
| Base de datos | MySQL 8 via Prisma ORM (adaptador MariaDB) |
| IA principal | Anthropic SDK — `claude-sonnet-4-6` |
| IA alternativa | OpenAI SDK — `gpt-4o` |
| Streaming | Vercel AI SDK v6 (`ai`) |
| Extracción PDF | `pdf-parse` v1.1.1 (import dinámico — requerido por Turbopack) |
| React | v19.2.4 |

---

## Repositorio y Rama

- **Repo:** `hectorazcurra/Modelo`
- **Rama de desarrollo:** `claude/construction-website-pdf-importer-cbfwR`
- **Servidor VPS:** Vultr — IP `144.202.38.93`
- **Path en servidor:** `/var/www/lab/metodo`
- **Process manager:** PM2 (proceso `modelo`)
- **Puerto:** 3000

---

## Arquitectura de Archivos

```
/
├── app/
│   ├── page.tsx                    # Landing page (Hero, Features, CTA)
│   ├── layout.tsx                  # Root layout + metadata
│   ├── dashboard/page.tsx          # Lista de proyectos con estadísticas
│   ├── projetos/
│   │   ├── novo/page.tsx           # Formulario nuevo proyecto + upload PDF
│   │   └── [id]/
│   │       ├── page.tsx            # Server component: carga datos del proyecto
│   │       └── WorkspaceClient.tsx # Split-screen: chat + presupuesto (client)
│   └── api/
│       ├── projetos/route.ts       # GET lista / POST crear proyecto
│       ├── projetos/[id]/route.ts  # GET / PUT / DELETE proyecto
│       ├── upload/route.ts         # POST: recibe PDF, extrae texto con pdf-parse
│       ├── chat/route.ts           # POST: streaming con Vercel AI SDK
│       └── orcamento/[id]/route.ts # GET / PUT presupuesto
├── components/
│   ├── layout/Header.tsx
│   ├── landing/Hero.tsx, Features.tsx, CTA.tsx
│   ├── chat/ChatPanel.tsx, ChatInput.tsx
│   ├── orcamento/OrcamentoPanel.tsx   # Panel derecho con secciones colapsables
│   └── upload/NewProjectForm.tsx      # Form + drag & drop PDF
├── lib/
│   ├── ai/
│   │   ├── providers.ts            # Instancias Claude + OpenAI
│   │   ├── prompts.ts              # System prompts en PT-BR para la IA
│   │   └── analyzer.ts            # Extrae JSON de presupuesto de la respuesta IA
│   ├── db/client.ts                # Prisma singleton con adaptador MariaDB
│   └── pdf/extractor.ts           # pdf-parse con import dinámico
├── prisma/
│   └── schema.prisma
└── next.config.ts                 # serverExternalPackages: ['pdf-parse']
```

---

## Schema de Base de Datos (MySQL)

```prisma
model Projeto {
  id           String    # cuid
  nome         String    # nombre del proyecto
  descricao    String?
  pdfNome      String?   # nombre del archivo PDF
  pdfTexto     String?   # texto extraído del PDF (LongText)
  status       Status    # ANALISE | ORCAMENTO | REVISAO | APROVADO
  aiProvider   String    # "claude" | "openai"
  mensagens    Mensagem[]
  orcamento    Orcamento?
}

model Mensagem {
  id        String
  projetoId String
  role      String    # "user" | "assistant"
  conteudo  String
}

model Orcamento {
  id        String
  projetoId String @unique
  dados     Json   # OrcamentoDados (ver abajo)
  versao    Int
  aprovado  Boolean
}

model BaseConhecimento {
  id     String
  tipo   String  # "projeto_anterior" | "custo_m2" | "mao_de_obra" | "equipamento"
  titulo String
  dados  Json
}
```

### Estructura JSON del Presupuesto (`OrcamentoDados`)

```typescript
interface OrcamentoDados {
  resumo: {
    objeto: string      // descripción del objeto licitado
    numeroEdital: string
    local: string
    prazo: string
    responsavel: string
  }
  escopo: string[]      // lista de servicios/alcance
  itens: {
    categoria: string
    descricao: string
    unidade: string     // m², m, un, etc.
    qtd: number
    custoUnit: number
    total: number
  }[]
  custoM2: number
  areaTotal: number
  maoDeObra: {
    funcao: string      // carpintero, electricista, etc.
    qtd: number
    dias: number
    valorDia: number
    total: number
  }[]
  cronograma: {
    fase: string
    inicio: string
    fim: string
    percentual: number
  }[]
  totalGeral: number
  totalMateriais?: number
  totalMaoDeObra?: number
  observacoes: string
}
```

---

## Flujo de la Aplicación

1. **Landing** → usuario hace clic en "Acceder al Dashboard"
2. **Dashboard** → lista de proyectos con estado, valor total, proveedor IA
3. **Nuevo Proyecto** → nombre + descripción + proveedor IA + PDF (opcional)
   - Upload PDF → API `/api/upload` → `pdf-parse` extrae texto → guardado en `Projeto.pdfTexto`
4. **Workspace** (split-screen `/projetos/[id]`):
   - Panel izquierdo (40%): chat con IA
   - Panel derecho (60%): presupuesto estructurado que se actualiza en tiempo real
   - Al hacer clic "Analizar Pliego con IA" → envía el texto del PDF al chat
   - La IA responde y embebe un bloque JSON con el presupuesto
   - `analyzer.ts` extrae el JSON y actualiza `Orcamento` en la DB
   - El panel derecho se refresca automáticamente tras cada respuesta

---

## Variables de Entorno (`.env` en servidor)

```env
DATABASE_URL="mysql://root:PASS@localhost:3306/modelo"
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-proj-..."   # ⚠️ debe ser clave OpenAI real, NO Anthropic
```

---

## Problemas Resueltos Durante el Desarrollo

| Problema | Solución |
|----------|----------|
| `next: not found` al iniciar | Ejecutar `npm install` primero |
| Prisma: `datasource.url required` | Crear `.env` manualmente en el servidor (no está en git) |
| MySQL RSA auth error | `ALTER USER ... IDENTIFIED WITH mysql_native_password` |
| `pdf.worker.mjs not found` (pdf-parse v2) | Downgrade a pdf-parse v1.1.1 |
| `test/data/05-versions-space.pdf` en build | Import dinámico + `serverExternalPackages: ['pdf-parse']` |
| `OPENAI_API_KEY` inválida | Era una clave Anthropic — claves OpenAI empiezan con `sk-proj-` |

---

## Comandos de Deployment (Servidor)

```bash
# Actualizar código
cd /var/www/lab/metodo
git pull origin claude/construction-website-pdf-importer-cbfwR

# Si cambiaron dependencias (package.json)
npm install

# Rebuild
npm run build

# Reiniciar servidor
pm2 restart modelo

# Ver logs
pm2 logs modelo --lines 50 --err
```

---

## Base de Conocimiento (`BaseConhecimento`)

La tabla `BaseConhecimento` está diseñada para almacenar el **historial de la empresa**:
- `tipo: "projeto_anterior"` → proyectos anteriores con costos reales
- `tipo: "custo_m2"` → tablas de costo por m² por tipo de obra
- `tipo: "mao_de_obra"` → precios de mano de obra por función
- `tipo: "equipamento"` → costos de equipamiento

La IA recibe estos datos en su system prompt para hacer estimaciones más precisas.

### Seed inicial (ya ejecutado)
```bash
npx tsx prisma/seed.ts  # inserta datos de referencia SINAPI 2024
```

---

## Próximos Pasos / Pendiente

- [ ] Configurar Nginx como proxy reverso (acceso sin `:3000`)
- [ ] Certificado SSL (Let's Encrypt / Certbot)
- [ ] Logo NatoDigital en footer (`/public/nato-digital-logo.png`)
- [ ] Exportación de presupuesto a PDF (`@react-pdf/renderer`)
- [ ] **Importar historial de Excel de licitaciones** → poblar `BaseConhecimento`
- [ ] Clave OpenAI real (actualmente solo funciona con Claude)

---

## Contexto para la Siguiente Sesión: Análisis de Excel

El objetivo es analizar los archivos Excel actuales que usa Metodo Engenharia para calcular licitaciones, y diseñar cómo:

1. **Mapear** las columnas/hojas del Excel al schema `BaseConhecimento`
2. **Importar** ese historial a la DB (script de migración)
3. **Incorporarlo** al system prompt de la IA para que aprenda del historial

La tabla `BaseConhecimento` ya existe en la DB con los campos `tipo`, `titulo` y `dados` (JSON flexible), diseñada exactamente para este propósito.

**Preguntas clave a resolver:**
- ¿Qué columnas tienen los Excel? (materiales, mano de obra, m², tipo de obra, fecha, valor final)
- ¿Cuántos proyectos históricos hay?
- ¿Qué formato tiene cada hoja?
- ¿Se puede hacer upload de los Excel directamente desde la UI, o es una importación única?
