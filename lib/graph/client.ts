/**
 * Microsoft Graph auth for the historical importer.
 *
 * We do NOT register an app in the client's Entra ID tenant — instead we
 * reuse well-known public client IDs that Microsoft ships with implicit
 * consent for Sites.Read.All / Files.Read.All (the pattern used by `az cli`,
 * `msgraph-cli`, `office365-rest-python-client`, and many other tools).
 *
 * Auth flow: ROPC (Resource Owner Password Credentials). User supplies a
 * SharePoint username + password via env vars; we discover the tenant from
 * their email domain and mint tokens on the fly.
 *
 * Limitations that WILL bite:
 * - MFA on the account → AADSTS50076. Workaround: App Password on the
 *   account, or bail to Playwright browser automation.
 * - Conditional Access forcing MFA regardless → same failure.
 * - Tenant blocks "public client flows" → AADSTS7000218. Rare but possible.
 *
 * The public client IDs below are stable but Microsoft owns them. If they
 * ever stop working, add a new fallback constant and re-deploy.
 */

import 'isomorphic-fetch'
import { ConfidentialClientApplication, PublicClientApplication, type LogLevel } from '@azure/msal-node'
import { Client, type AuthenticationProvider } from '@microsoft/microsoft-graph-client'

// Well-known Microsoft first-party public client IDs. Order matters: try
// the Graph-native ones first, since Microsoft has restricted the older
// generic ones (Azure PowerShell, MS Office) with AADSTS65002 in 2024+.
const PUBLIC_CLIENT_IDS = [
  // Microsoft Graph Command Line Tools — the current recommended public
  // client for Graph. Used by `mgc` and Microsoft.Graph PowerShell v2.
  '14d82eec-204b-4c2f-b7e8-296a70dab67e',
  // Microsoft Azure CLI (`az login`). Still works for Graph in most tenants.
  '04b07795-8ddb-461a-bbee-02f9e1bf7b46',
  // SharePoint Online Client Extensibility Web Application Principal —
  // used by office365-rest-python-client for UserCredential auth.
  '08e18876-6177-487e-b8b5-cf950c1e598c',
  // Legacy fallbacks — Microsoft has been restricting these with AADSTS65002:
  '1950a258-227b-4e31-a9cf-717495945fc2', // Azure PowerShell
  'd3590ed6-52b3-4102-aeff-aad2292ab01c', // Microsoft Office
]

const SCOPES = ['https://graph.microsoft.com/Sites.Read.All', 'https://graph.microsoft.com/Files.Read.All']

const USER_AGENT = 'NONISV|MetodoEngenharia|MetodoImporter/1.0'

/**
 * Discover the tenant GUID from the user's email domain via the
 * OpenID Connect discovery endpoint. Works for any Microsoft-managed tenant
 * (Azure AD / Entra ID); federated domains resolve to their home tenant.
 */
export async function discoverTenantId(username: string): Promise<string> {
  const at = username.indexOf('@')
  if (at < 0) throw new Error(`Username sem domínio: "${username}". Use o UPN completo (ex: voce@metodo.com.br).`)
  const domain = username.slice(at + 1)
  const url = `https://login.microsoftonline.com/${encodeURIComponent(domain)}/.well-known/openid-configuration`
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`Falha ao descobrir tenant do domínio "${domain}": HTTP ${resp.status}`)
  }
  const cfg = (await resp.json()) as { issuer?: string }
  // issuer looks like https://login.microsoftonline.com/<tenant-guid>/v2.0
  const m = cfg.issuer?.match(/\/([0-9a-fA-F-]{36})\//)
  if (!m) throw new Error(`Issuer inesperado no OpenID discovery: ${cfg.issuer}`)
  return m[1]
}

interface AcquireResult {
  accessToken: string
  expiresOn: Date | null
  clientIdUsed: string
}

/**
 * Try each public client ID in order; return on the first that succeeds.
 * Surfaces the ORIGINAL error from the primary client if all fail — the
 * subsequent errors are almost always the same (MFA blocks every client).
 */
/**
 * Confidential-client paths (require MS_GRAPH_CLIENT_ID + MS_GRAPH_CLIENT_SECRET).
 * Tried in this order:
 *   1. Client credentials (app-only) — no username needed at all. Use this
 *      when the app has APPLICATION permissions (Sites.Read.All granted via
 *      admin consent). Cleanest for batch: no user, no MFA concerns.
 *   2. ROPC-with-secret — combines the secret with username/password. Use
 *      this when the app has only DELEGATED permissions.
 */
async function acquireTokenConfidential(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  username?: string,
  password?: string,
): Promise<AcquireResult> {
  const cca = new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
    system: {
      loggerOptions: {
        loggerCallback: (_level: LogLevel, _msg: string) => {},
        piiLoggingEnabled: false,
      },
    },
  })

  // 1) ROPC+secret first when we have user+pass — most confidential apps
  //    registered by devs have DELEGATED permissions (which need a user
  //    context) and no application permissions granted admin consent. This
  //    is the case for the Move_Storage app we tested against.
  if (username && password) {
    try {
      const result = await cca.acquireTokenByUsernamePassword({
        scopes: SCOPES,
        username,
        password,
      })
      if (result?.accessToken) {
        return { accessToken: result.accessToken, expiresOn: result.expiresOn, clientIdUsed: `${clientId} (ROPC+secret)` }
      }
    } catch {
      // fall through to client_credentials
    }
  }

  // 2) Client credentials — app-only, needs APPLICATION permissions granted
  //    admin consent on the app registration (Sites.Read.All application,
  //    not delegated). Cleanest for batch when available.
  const result = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  })
  if (result?.accessToken) {
    return { accessToken: result.accessToken, expiresOn: result.expiresOn, clientIdUsed: `${clientId} (client_credentials)` }
  }

  throw new Error('Confidential client: nem ROPC+secret nem client_credentials funcionaram')
}

async function acquireTokenWithFallback(
  tenantId: string,
  username: string,
  password: string,
): Promise<AcquireResult> {
  const errors: Array<{ clientId: string; err: unknown }> = []
  for (const clientId of PUBLIC_CLIENT_IDS) {
    try {
      const pca = new PublicClientApplication({
        auth: {
          clientId,
          authority: `https://login.microsoftonline.com/${tenantId}`,
        },
        system: {
          loggerOptions: {
            loggerCallback: (_level: LogLevel, _msg: string) => {},
            piiLoggingEnabled: false,
          },
        },
      })
      const result = await pca.acquireTokenByUsernamePassword({
        scopes: SCOPES,
        username,
        password,
      })
      if (result?.accessToken) {
        return { accessToken: result.accessToken, expiresOn: result.expiresOn, clientIdUsed: clientId }
      }
    } catch (err) {
      errors.push({ clientId, err })
    }
  }
  // Reporte só o código AADSTS + client_id de cada tentativa (curto).
  const summary = errors
    .map(({ clientId, err }) => {
      const m = String(err instanceof Error ? err.message : err).match(/AADSTS\d+/)
      return `  ${clientId.slice(0, 8)}: ${m?.[0] ?? 'sem código'}`
    })
    .join('\n')
  const msg = errors[0] ? String(errors[0].err instanceof Error ? errors[0].err.message : errors[0].err) : 'sem detalhes'
  // Common failure codes → actionable messages.
  if (/AADSTS50076/.test(msg)) {
    throw new Error(
      `MFA obrigatório na conta. Gere uma App Password em https://account.microsoft.com/security e coloque em MS_SERVICE_ACCOUNT_PASSWORD, ou use o fallback Playwright. (${msg})`,
    )
  }
  if (/AADSTS7000218/.test(msg)) {
    throw new Error(
      `Tenant bloqueia "public client flows" para o client_id principal. Se você tiver acesso ao Azure, registre um app próprio e ligue "Allow public client flows"; sem isso, cai para Playwright. (${msg})`,
    )
  }
  if (/AADSTS50126|AADSTS50034/.test(msg)) {
    throw new Error(`Usuário ou senha inválidos. Confira MS_SERVICE_ACCOUNT_USERNAME/PASSWORD. (${msg})`)
  }
  throw new Error(`Falha na autenticação Graph em todos os client_ids:\n${summary}\n\nErro completo do primeiro: ${msg}`)
}

interface GraphContext {
  client: Client
  tenantId: string
  clientIdUsed: string
  username: string
}

/**
 * Build a Microsoft Graph client authenticated for batch use. Discovers the
 * tenant from the user's email, tries ROPC across the public client IDs,
 * and wraps the resulting access token in an AuthenticationProvider that
 * refreshes on demand. Fails fast with an actionable error message.
 */
export async function makeGraphClient(): Promise<GraphContext> {
  // Treat empty strings from .env as "not set" so `??` chains work.
  const env = (k: string): string | undefined => {
    const v = process.env[k]
    return v && v.trim() ? v.trim() : undefined
  }
  const username = env('MS_SERVICE_ACCOUNT_USERNAME')
  const password = env('MS_SERVICE_ACCOUNT_PASSWORD')
  const clientId = env('MS_GRAPH_CLIENT_ID')
  const clientSecret = env('MS_GRAPH_CLIENT_SECRET')
  const explicitTenant = env('MS_GRAPH_TENANT_ID')

  // Tenant is derivable from the username domain, but the confidential
  // client flow can use MS_GRAPH_TENANT_ID directly (no username needed for
  // app-only). Require at least ONE identity hint.
  if (!username && !explicitTenant) {
    throw new Error(
      'Precisamos de MS_SERVICE_ACCOUNT_USERNAME (para descobrir o tenant) OU MS_GRAPH_TENANT_ID no .env.',
    )
  }

  const tenantId = explicitTenant ?? (await discoverTenantId(username!))

  // Confidential client: prefer client_credentials (app-only), fall back to
  // ROPC-with-secret if the app has only delegated permissions.
  let initial: AcquireResult
  if (clientId && clientSecret) {
    initial = await acquireTokenConfidential(tenantId, clientId, clientSecret, username, password)
  } else {
    if (!username || !password) {
      throw new Error(
        'Sem MS_GRAPH_CLIENT_SECRET, o fluxo público de fallback exige USERNAME e PASSWORD no .env.',
      )
    }
    initial = await acquireTokenWithFallback(tenantId, username, password)
  }

  // Cache token; re-mint when within 60s of expiry.
  let cached: AcquireResult = initial

  const authProvider: AuthenticationProvider = {
    async getAccessToken(): Promise<string> {
      const now = Date.now()
      const expiresAt = cached.expiresOn ? cached.expiresOn.getTime() : now + 3_500_000
      if (expiresAt - now < 60_000) {
        cached =
          clientId && clientSecret
            ? await acquireTokenConfidential(tenantId, clientId, clientSecret, username, password)
            : await acquireTokenWithFallback(tenantId, username!, password!)
      }
      return cached.accessToken
    },
  }

  const client = Client.initWithMiddleware({
    authProvider,
    defaultVersion: 'v1.0',
  })

  // Smoke test /me — surface auth failures before the caller does real work.
  // Swallowed silently; downstream requests will surface any lingering issue.
  try {
    await client.api('/me').select('id,userPrincipalName').get()
  } catch {
    // Ignore — some tenants deny /me to public clients but permit /sites.
  }

  const client_with_ua: Client = client
  // Inject User-Agent by wrapping api() calls when possible — the SDK's
  // built-in middleware appends User-Agent from configuration but not
  // reliably in v3; we set it via a custom request middleware in v2 shape.
  // For now the default UA is acceptable; the header is a best-effort MS
  // convention, not a hard requirement. (Reserved: replace with a
  // TelemetryHandler when we move to graph-client v4.)
  void USER_AGENT
  void client_with_ua

  return { client, tenantId, clientIdUsed: cached.clientIdUsed, username: username ?? '(app-only)' }
}
