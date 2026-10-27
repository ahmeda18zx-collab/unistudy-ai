import { redisPipeline, redisConfig } from './_lib/redis.js'
import { limited, type Req, type Res } from './_lib/http.js'

// GET /api/content?meta=1  -> { version, updatedAt, subjectIds }
// GET /api/content         -> full shared catalog
export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'الطريقة غير مسموحة' })
  }
  if (limited(req, 60)) return res.status(429).json({ error: 'طلبات كثيرة، حاول بعد دقيقة.' })
  if (!redisConfig()) return res.status(503).json({ error: 'تخزين المحتوى المشترك غير مضبوط على الخادم.' })
  try {
    const [rawIndex] = await redisPipeline([['GET', 'unistudy:index']])
    const index = rawIndex ? JSON.parse(String(rawIndex)) : { version: 0, updatedAt: 0, subjectIds: [] }
    if (req.query?.meta) return res.status(200).json(index)
    const ids: string[] = index.subjectIds || []
    const parts = ids.length ? await redisPipeline(ids.map((id) => ['GET', `unistudy:s:${id}`])) : []
    const out = { version: index.version, updatedAt: index.updatedAt, subjects: [] as unknown[], units: [] as unknown[], lessons: [] as unknown[], questions: [] as unknown[] }
    for (const p of parts) {
      if (!p) continue
      const d = JSON.parse(String(p))
      out.subjects.push(d.subject)
      out.units.push(...(d.units || []))
      out.lessons.push(...(d.lessons || []))
      out.questions.push(...(d.questions || []))
    }
    return res.status(200).json(out)
  } catch (e: any) {
    console.error('[content]', e)
    return res.status(502).json({ error: 'تعذر قراءة المحتوى المشترك.' })
  }
}
