// Minimal Upstash/Vercel-KV REST client (no dependency, just fetch).
export function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  return url && token ? { url: url.replace(/\/$/, ''), token } : null
}

export async function redisPipeline(commands: unknown[][]): Promise<unknown[]> {
  const cfg = redisConfig()
  if (!cfg) throw new Error('STORAGE_NOT_CONFIGURED')
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  })
  if (!res.ok) throw new Error(`STORAGE_ERROR_${res.status}`)
  const out = (await res.json()) as { result?: unknown; error?: string }[]
  return out.map((r) => {
    if (r.error) throw new Error(`STORAGE_ERROR: ${r.error}`)
    return r.result
  })
}
