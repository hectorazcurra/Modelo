// Mirrors `basePath` in next.config.ts. Used to prefix client-side fetch() calls,
// since Next.js does not auto-prefix fetch URLs (only <Link> and <Image>).
export const BASE_PATH = '/metodo'

export function withBase(path: string): string {
  if (!path.startsWith('/')) path = '/' + path
  return BASE_PATH + path
}
