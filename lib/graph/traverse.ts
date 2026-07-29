/**
 * Microsoft Graph traversal helpers. Consumed by scripts/import-historico-o365.ts
 * for driving the mirror-then-import pipeline.
 *
 * All list endpoints follow `@odata.nextLink` transparently. Downloads use
 * the pre-authenticated `@microsoft.graph.downloadUrl` (no bearer token
 * needed on the CDN URL) — this is the same shortcut move-acc's Python
 * client uses and it survives long download times without token refresh
 * pain.
 *
 * The graph-client v3 middleware already handles 429/5xx retry with
 * Retry-After. We add a minimal outer retry wrapper for the raw `fetch`
 * calls (downloadUrl + OpenID discovery) that don't go through the SDK.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Client } from '@microsoft/microsoft-graph-client'

export const MAX_FILE_BYTES = 50 * 1024 * 1024

export interface DriveItem {
  id: string
  name: string
  size?: number
  file?: { mimeType?: string }
  folder?: { childCount?: number }
  parentReference?: { driveId?: string; path?: string }
  '@microsoft.graph.downloadUrl'?: string
}

/**
 * Sleep with jitter to avoid thundering-herd on Retry-After batches.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms + Math.random() * 200))
}

/**
 * Retry a raw `fetch` call on 429/503 honoring Retry-After. Idempotent
 * callers only — everything the importer uses (downloads, OpenID GETs) is
 * idempotent.
 */
export async function retryFetch(url: string, init?: RequestInit, maxRetries = 3): Promise<Response> {
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, init)
      if (resp.status === 429 || resp.status === 503) {
        const ra = resp.headers.get('retry-after')
        const waitMs = ra ? Math.min(60_000, parseInt(ra, 10) * 1000) : 1000 * 2 ** attempt
        await sleep(waitMs)
        continue
      }
      return resp
    } catch (err) {
      lastErr = err
      if (attempt < maxRetries) await sleep(1000 * 2 ** attempt)
    }
  }
  throw lastErr ?? new Error(`retryFetch: giving up on ${url}`)
}

/**
 * Search for a SharePoint site by term (site name or path segment).
 * Returns the first match — most useful when the user knows the display
 * name of the site (e.g. "Metodo Projetos").
 */
export async function resolveSiteId(client: Client, siteSearchTerm: string): Promise<string> {
  const resp = (await client.api('/sites').search(siteSearchTerm).get()) as { value?: Array<{ id: string; name?: string }> }
  const hit = resp.value?.[0]
  if (!hit) throw new Error(`Nenhum SharePoint site encontrado com search="${siteSearchTerm}"`)
  return hit.id
}

/**
 * Resolve the ROOT site of a tenant hostname — used when the projects live
 * on the root Metodo site (e.g. https://metodoengenharia.sharepoint.com/) as
 * opposed to a nested /sites/<name>/ collection.
 */
export async function resolveSiteByHostname(client: Client, hostname: string): Promise<string> {
  const site = (await client.api(`/sites/${hostname}`).get()) as { id: string }
  return site.id
}

/**
 * Resolve a site from any SharePoint URL. Handles any subsite depth:
 *   https://tenant.sharepoint.com/                                    → root
 *   https://tenant.sharepoint.com/sites/foo/                          → /sites/foo
 *   https://tenant.sharepoint.com/Processos/PropostasOrcamentos/      → classic subsite path
 * Graph's `/sites/{host}:{path}` accepts ANY path (not just /sites/x).
 */
export async function resolveSiteByUrl(client: Client, siteUrl: string): Promise<string> {
  const u = new URL(siteUrl)
  const p = u.pathname.replace(/\/+$/, '')
  if (p && p !== '/') {
    const site = (await client.api(`/sites/${u.hostname}:${p}`).get()) as { id: string }
    return site.id
  }
  return resolveSiteByHostname(client, u.hostname)
}

/**
 * Default document library of a site — good enough for tenants that keep
 * projects in a single library.
 */
export async function resolveDriveId(client: Client, siteId: string): Promise<string> {
  const drive = (await client.api(`/sites/${siteId}/drive`).get()) as { id: string }
  return drive.id
}

/**
 * Find a specific document library (drive) by its DISPLAY NAME. Useful when
 * a site has multiple libraries and the projects don't live in the default.
 * The path segment in a SharePoint URL (e.g. `Processos` in
 * `/Processos/PropostasOrcamentos/`) is usually the library display name.
 */
export async function resolveDriveByName(client: Client, siteId: string, libraryName: string): Promise<string> {
  const resp = (await client.api(`/sites/${siteId}/drives`).get()) as {
    value?: Array<{ id: string; name: string; webUrl?: string }>
  }
  const wanted = libraryName.toLowerCase()
  const hit = resp.value?.find(
    (d) => d.name.toLowerCase() === wanted || (d.webUrl ?? '').toLowerCase().includes('/' + wanted.replace(/ /g, '')),
  )
  if (!hit) {
    const available = (resp.value ?? []).map((d) => d.name).join(', ')
    throw new Error(`Library "${libraryName}" não encontrada no site. Disponíveis: ${available}`)
  }
  return hit.id
}

/**
 * Resolve a driveItem from any SharePoint URL — the same pattern move-acc's
 * `resolve_folder_url` uses. Encoding is Base64URL of the raw URL prefixed
 * with `u!`. Works for site URLs, folder URLs, file share links.
 */
export async function resolveItemByUrl(client: Client, sharedUrl: string): Promise<DriveItem> {
  const b64 = Buffer.from(sharedUrl).toString('base64')
  // base64url: strip trailing '=' + '/' → '_' + '+' → '-'
  const encoded = 'u!' + b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
  const item = (await client.api(`/shares/${encoded}/driveItem`).get()) as DriveItem
  return item
}

/**
 * Resolve a driveItem at a path RELATIVE to the drive root. The Graph
 * syntax is `/drives/{driveId}/root:/<path>`. Trailing slash of `path`
 * is normalized.
 */
export async function resolveItemByPath(client: Client, driveId: string, itemPath: string): Promise<DriveItem> {
  const p = itemPath.replace(/^\/+/, '').replace(/\/+$/, '')
  const url = p ? `/drives/${driveId}/root:/${p}` : `/drives/${driveId}/root`
  const item = (await client.api(url).get()) as DriveItem
  return item
}

/**
 * List children of a driveItem, following pagination. Returns a single flat
 * array — good enough for the O(hundreds) fan-outs we see in project
 * folders. Backed by graph-client's built-in retry middleware.
 */
export async function listChildren(client: Client, driveId: string, itemId: string): Promise<DriveItem[]> {
  const out: DriveItem[] = []
  let nextLink: string | null = `/drives/${driveId}/items/${itemId}/children?$top=200`
  while (nextLink) {
    const page = (await client.api(nextLink).get()) as { value: DriveItem[]; '@odata.nextLink'?: string }
    out.push(...(page.value ?? []))
    nextLink = page['@odata.nextLink'] ?? null
    if (nextLink && nextLink.startsWith('https://')) {
      // graph-client accepts either a relative path or a fully-qualified
      // URL — the nextLink is fully-qualified.
    }
  }
  return out
}

/**
 * Download a driveItem's bytes into a Buffer via the pre-authenticated
 * downloadUrl (no bearer token needed). Retries transient failures.
 */
export async function downloadItem(client: Client, driveId: string, itemId: string): Promise<Buffer> {
  // No .select() — the @microsoft.graph.downloadUrl is an OData instance
  // annotation added implicitly and gets stripped when we cherry-pick fields.
  const item = (await client.api(`/drives/${driveId}/items/${itemId}`).get()) as DriveItem
  const url = item['@microsoft.graph.downloadUrl']
  if (!url) throw new Error(`downloadUrl ausente para item ${itemId} (${item.name}). Talvez seja pasta, não arquivo.`)
  const resp = await retryFetch(url)
  if (!resp.ok) throw new Error(`Falha ao baixar ${item.name}: HTTP ${resp.status}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  return buf
}

/**
 * Stream a driveItem to disk. Wraps downloadItem for now (buffers in
 * memory) — good enough for files ≤ MAX_FILE_BYTES. A future v2 could
 * switch to real streaming for huge files.
 */
export async function downloadItemToFile(
  client: Client,
  driveId: string,
  item: DriveItem,
  destPath: string,
): Promise<number> {
  if (typeof item.size === 'number' && item.size > MAX_FILE_BYTES) {
    throw new Error(`Arquivo ${item.name} excede MAX_FILE_BYTES (${item.size} > ${MAX_FILE_BYTES}) — pulado.`)
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  const buf = await downloadItem(client, driveId, item.id)
  fs.writeFileSync(destPath, buf)
  return buf.length
}
