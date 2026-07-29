# Import histórico via Office 365 / SharePoint

Este documento cobre o setup e o troubleshooting do script `scripts/import-historico-o365.ts`, que popula a `BaseConhecimento` diretamente do SharePoint do cliente (sem passar pelo ZIP-upload manual).

## Como funciona

1. Você fornece usuário + senha do SharePoint no `.env`.
2. O script descobre o `tenant` do domínio do seu e-mail via OpenID discovery.
3. Autentica via ROPC (Resource Owner Password Credentials) reutilizando um dos **client_ids públicos da Microsoft** — não precisa registrar app no Azure.
4. Baixa o FUP + subárvores dos projetos filtrados para um diretório de staging.
5. Delega ao `runImport()` do importer legado — mesmo pipeline de extração + persistência.
6. Limpa o staging no fim (ou preserva com `--keep-staging`).

## Env vars

No `.env`:

```
MS_SERVICE_ACCOUNT_USERNAME=voce@metodo.com.br
MS_SERVICE_ACCOUNT_PASSWORD=sua_senha_ou_app_password
# Opcionais — pinar após a primeira run para pular o resolve:
# MS_GRAPH_SITE_ID=<GUID retornado no log>
# MS_GRAPH_DRIVE_ID=<GUID retornado no log>
```

⚠️ A senha vai em texto plano no `.env`. Trate como segredo (`chmod 600 .env`, nunca commit).

## Uso

```bash
./node_modules/.bin/tsx scripts/import-historico-o365.ts \
  --site-name "Metodo Projetos" \
  --root-path "Documentos/Projetos/2026" \
  --index-graph-path "Documentos/FUP Metodo.xlsx" \
  --os-prefix 2026- \
  --skip-empty
```

Testar com `--dry-run --limit 1 --keep-staging` primeiro.

## Troubleshooting

### `AADSTS50076: Due to a configuration change...` (MFA required)

Sua conta tem MFA obrigatório e ROPC não funciona diretamente. Duas soluções:

1. **App Password** — gerar em https://account.microsoft.com/security → *Advanced security options* → *App passwords* → *Create a new app password*. Use a senha gerada em `MS_SERVICE_ACCOUNT_PASSWORD`. Funciona só se o tenant permite App Passwords (algumas orgs desligam).
2. **Fallback Playwright** (não implementado neste v1). Se App Password não estiver disponível, precisamos automatizar login via navegador — 1-2 dias de trabalho a mais.

### `AADSTS7000218: The request body must contain 'client_assertion' or 'client_secret'`

Este client_id específico requer secret. O script já tenta 3 client_ids públicos em ordem, então esse erro só aparece se **todos** forem bloqueados. Alternativa: registrar app próprio no Entra ID (5 min de Azure) e informar `MS_GRAPH_CLIENT_ID` no `.env`.

### `AADSTS50126: Invalid username or password`

Confira o `.env`. Também: contas federadas (SSO Google, ADFS) não funcionam via ROPC — o Entra ID redireciona pra outro IdP que o MSAL não segue.

### `429 Too Many Requests` durante download

Normal para o primeiro sync (500+ OS × dezenas de arquivos cada). O retry helper honra `Retry-After` automaticamente. Se o job ficar horas parado em backoff, considere rodar em janelas de menor tráfego.

### Nada é baixado / "0 pastas"

Verifique:
- `--os-prefix` casa com o padrão real das pastas no SharePoint (case-insensitive).
- A service account tem read no site (`Sites.Read.All` delegated é o suficiente por padrão).
- O `--root-path` está certo. Testar com `--dry-run --keep-staging --limit 1` e conferir o staging.

## Rotação de senha

Quando trocar sua senha do Metodo (compliance interno), atualiza o `.env` na hora. O startup check do script faz smoke `/me` e falha rápido se a senha estiver inválida — evita rodar half-broken.
