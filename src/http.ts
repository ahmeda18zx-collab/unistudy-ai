export interface Req { method?: string; body?: any; query?: Record<string, string | string[] | undefined>; headers: Record<string, string | string[] | undefined> }
export interface Res { status(code: number): Res; json(body: unknown): void; setHeader(k: string, v: string): void }

const hits = new Map<string, number[]>()
/** Best-effort per-instance rate limit. */
export function limited(req: Req, max: number, windowMs = 60_000): boolean {
  const fwd = req.headers['x-forwarded-for']
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd || 'unknown').split(',')[0].trim()
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > max
}
export function header(req: Req, name: string): string {
  const v = req.headers[name]
  return (Array.isArray(v) ? v[0] : v) || ''
}
