/**
 * Import the historical knowledge base from the client's SharePoint tenant
 * via Microsoft Graph, instead of the ZIP-upload dance.
 *
 * Strategy (v1): download the SharePoint subtree we care about into a
 * staging directory, then delegate to the existing importer's `runImport()`
 * with `--dir <staging>`. Zero refactor of the sync extractors; ~2-5 GB of
 * temporary disk. The staging is cleaned up in `finally` unless
 * `--keep-staging` is passed.
 *
 * CLI shape mirrors scripts/import-historico.ts:75-101 (hand-rolled
 * parseArgs). Env keys added: MS_SERVICE_ACCOUNT_USERNAME / _PASSWORD (see
 * lib/graph/client.ts for auth details).
 */

import 'dotenv/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { makeGraphClient } from '../lib/graph/client'
import {
  resolveSiteId,
  resolveSiteByUrl,
  resolveDriveId,
  resolveDriveByName,
  resolveItemByPath,
  listChildren,
  downloadItem,
  downloadItemToFile,
  MAX_FILE_BYTES,
  type DriveItem,
} from '../lib/graph/traverse'
import { readIndexXlsxFromWorkbook, runImport } from './import-historico'
import { readPricingWorkbookFromBuffer } from '../lib/excel/extractor'

// Same extension whitelist as lib/extractors/docs.ts:6 SUPPORTED_TEXT_EXT.
const SUPPORTED_EXTS = new Set([
  '.pdf', '.docx', '.msg', '.txt', '.xlsx', '.xls', '.xlsm', '.pptx', '.ppt', '.zip', '.eml',
])

// Excel lock file convention — matches findLatestPricingXlsx in import-historico.ts.
const SKIP_PATTERNS = [/^~\$/]

interface CliArgs {
  siteName: string
  siteUrl: string
  libraryName: string
  indexLibrary: string
  rootPath: string
  indexGraphPath: string
  osPrefix: string
  stagingDir: string
  keepStaging: boolean
  dryRun: boolean
  limit: number | null
  clean: boolean
  skipEmpty: boolean
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2)
  const args: CliArgs = {
    siteName: '',
    siteUrl: '',
    libraryName: '',
    indexLibrary: '',
    rootPath: '',
    indexGraphPath: '',
    osPrefix: '',
    stagingDir: '',
    keepStaging: false,
    dryRun: false,
    limit: null,
    clean: false,
    skipEmpty: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--site-name') args.siteName = argv[++i]
    else if (a === '--site-url') args.siteUrl = argv[++i]
    else if (a === '--library-name') args.libraryName = argv[++i]
    else if (a === '--index-library') args.indexLibrary = argv[++i]
    else if (a === '--root-path') args.rootPath = argv[++i]
    else if (a === '--index-graph-path') args.indexGraphPath = argv[++i]
    else if (a === '--os-prefix') args.osPrefix = argv[++i]
    else if (a === '--staging-dir') args.stagingDir = argv[++i]
    else if (a === '--keep-staging') args.keepStaging = true
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10)
    else if (a === '--clean') args.clean = true
    else if (a === '--skip-empty') args.skipEmpty = true
  }

  const siteFromEnv = !!(process.env.MS_GRAPH_SITE_ID && process.env.MS_GRAPH_DRIVE_ID)
  if (!args.siteName && !args.siteUrl && !siteFromEnv) {
    console.error(
      'Uso: tsx scripts/import-historico-o365.ts\n' +
      '        (--site-url <url> | --site-name <"Metodo Projetos">)\n' +
      '        [--library-name <"Processos">]      (necessário se != library default)\n' +
      '        --root-path <"PropostasOrcamentos/2026">\n' +
      '        --index-graph-path <"FUP Metodo.xlsx">\n' +
      '        [--os-prefix 2026-]\n' +
      '        [--staging-dir <path>] [--keep-staging]\n' +
      '        [--dry-run] [--limit N] [--clean] [--skip-empty]\n' +
      '\n' +
      '  Env obrigatórias no .env:\n' +
      '    MS_SERVICE_ACCOUNT_USERNAME\n' +
      '    MS_SERVICE_ACCOUNT_PASSWORD\n' +
      '\n' +
      '  Opcionais (pinam após primeira run):\n' +
      '    MS_GRAPH_SITE_ID     MS_GRAPH_DRIVE_ID',
    )
    process.exit(1)
  }

  // rootPath opcional: se vazio, iteramos a raiz da library.
  if (!args.indexGraphPath) {
    console.error('--index-graph-path é obrigatório')
    process.exit(1)
  }

  if (!args.stagingDir) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    args.stagingDir = `/var/lib/metodo/graph-staging/${stamp}`
  }
  return args
}

async function mirrorSubtree(
  clientLike: Awaited<ReturnType<typeof makeGraphClient>>['client'],
  driveId: string,
  parent: DriveItem,
  destDir: string,
  stats: { files: number; bytes: number; skipped: number },
): Promise<void> {
  const children = await listChildren(clientLike, driveId, parent.id)
  for (const child of children) {
    const target = path.join(destDir, child.name)
    if (child.folder) {
      fs.mkdirSync(target, { recursive: true })
      await mirrorSubtree(clientLike, driveId, child, target, stats)
    } else if (child.file) {
      const ext = path.extname(child.name).toLowerCase()
      if (!SUPPORTED_EXTS.has(ext)) { stats.skipped++; continue }
      if (SKIP_PATTERNS.some((r) => r.test(child.name))) { stats.skipped++; continue }
      if (typeof child.size === 'number' && child.size > MAX_FILE_BYTES) {
        stats.skipped++
        continue
      }
      try {
        const n = await downloadItemToFile(clientLike, driveId, child, target)
        stats.files++
        stats.bytes += n
      } catch (err) {
        console.error(`  ⚠ falha ao baixar ${child.name}: ${err instanceof Error ? err.message : err}`)
        stats.skipped++
      }
    }
  }
}

async function main() {
  const args = parseArgs()
  console.log(`Staging: ${args.stagingDir}`)
  console.log()

  const { client, tenantId, clientIdUsed, username } = await makeGraphClient()
  console.log(`Autenticado como ${username} (tenant ${tenantId}, client_id ${clientIdUsed})`)

  const siteId = process.env.MS_GRAPH_SITE_ID
    ?? (args.siteUrl ? await resolveSiteByUrl(client, args.siteUrl) : await resolveSiteId(client, args.siteName))
  const driveId = process.env.MS_GRAPH_DRIVE_ID
    ?? (args.libraryName ? await resolveDriveByName(client, siteId, args.libraryName) : await resolveDriveId(client, siteId))
  console.log(`Site: ${siteId}`)
  console.log(`Drive: ${driveId}`)
  console.log(`  (pin com MS_GRAPH_SITE_ID=${siteId} MS_GRAPH_DRIVE_ID=${driveId} para pular resolve)`)
  console.log()

  fs.mkdirSync(args.stagingDir, { recursive: true })

  // 1) Baixa FUP em buffer, parseia; usamos a lista para filtrar quais pastas
  //    baixar da árvore de projetos (economiza chamadas Graph). Aceita
  //    --index-library caso a FUP viva numa library diferente da dos OS
  //    (ex.: OS em "2026", FUP em "Modelos / Templates").
  const indexDriveId = args.indexLibrary
    ? await resolveDriveByName(client, siteId, args.indexLibrary)
    : driveId
  console.log(`Baixando FUP: ${args.indexGraphPath}${args.indexLibrary ? ` (library "${args.indexLibrary}")` : ''}`)
  const fupItem = await resolveItemByPath(client, indexDriveId, args.indexGraphPath)
  const fupBuf = await downloadItem(client, indexDriveId, fupItem.id)
  const fupWb = readPricingWorkbookFromBuffer(fupBuf)
  const projetos = readIndexXlsxFromWorkbook(fupWb, args.indexGraphPath)
  console.log(`  ${projetos.length} projetos no índice`)

  // Salva FUP no staging para runImport consumir.
  const localFupPath = path.join(args.stagingDir, path.basename(args.indexGraphPath))
  fs.writeFileSync(localFupPath, fupBuf)

  // 2) Filtra por os-prefix, monta índice de nomes de pasta esperados.
  const filtered = args.osPrefix ? projetos.filter((p) => p.os.startsWith(args.osPrefix)) : projetos
  const limited = args.limit ? filtered.slice(0, args.limit) : filtered
  const expectedNames = new Set(limited.map((p) => (p.nomePasta || p.os).toLowerCase()))
  const expectedPrefixes = new Set(limited.map((p) => p.os.toLowerCase()))
  console.log(`  ${limited.length} projetos após filtro`)
  console.log()

  // 3) Resolve pasta raiz e enumera crianças direto. rootPath vazio = raiz da library.
  console.log(`Enumerando ${args.rootPath || '<raiz da library>'}`)
  const rootItem = args.rootPath
    ? await resolveItemByPath(client, driveId, args.rootPath)
    : ({ id: 'root' } as DriveItem)
  const rootChildren = await listChildren(client, driveId, rootItem.id)
  console.log(`  ${rootChildren.length} entradas na raiz`)
  console.log()

  // 4) Baixa cada pasta que bate um dos prefixos/nomes esperados.
  let matched = 0
  const totalStats = { files: 0, bytes: 0, skipped: 0 }
  for (const child of rootChildren) {
    if (!child.folder) continue
    const nameLc = child.name.toLowerCase()
    const isExpected =
      expectedNames.has(nameLc) ||
      [...expectedPrefixes].some((os) => nameLc === os || nameLc.startsWith(os + ' ') || nameLc.startsWith(os + '-') || nameLc.startsWith(os + '_'))
    if (!isExpected) continue

    matched++
    const dest = path.join(args.stagingDir, child.name)
    fs.mkdirSync(dest, { recursive: true })
    const stats = { files: 0, bytes: 0, skipped: 0 }
    await mirrorSubtree(client, driveId, child, dest, stats)
    console.log(`  [${child.name}] ${stats.files} arquivos / ${(stats.bytes / (1024 * 1024)).toFixed(1)} MB (${stats.skipped} pulados)`)
    totalStats.files += stats.files
    totalStats.bytes += stats.bytes
    totalStats.skipped += stats.skipped
  }
  console.log()
  console.log(`Total: ${matched} pastas | ${totalStats.files} arquivos | ${(totalStats.bytes / (1024 * 1024 * 1024)).toFixed(2)} GB | ${totalStats.skipped} pulados`)
  console.log()

  // 5) Delega para o importer existente.
  try {
    await runImport({
      index: localFupPath,
      dir: args.stagingDir,
      dryRun: args.dryRun,
      limit: args.limit,
      os: args.osPrefix || null,
      skipEmpty: args.skipEmpty,
      clean: args.clean,
    })
  } finally {
    if (!args.keepStaging) {
      console.log(`\nLimpando staging: ${args.stagingDir}`)
      fs.rmSync(args.stagingDir, { recursive: true, force: true })
    } else {
      console.log(`\nStaging preservado em: ${args.stagingDir}`)
    }
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
})
