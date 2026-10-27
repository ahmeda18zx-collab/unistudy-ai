import { redisPipeline, redisConfig } from './_lib/redis.js'
import { limited, header, type Req, type Res } from './_lib/http.js'

const MAX_BYTES_PER_SUBJECT = 900_000

function validId(x: any): x is { id: string } {
  return x && typeof x === 'object' && typeof x.id === 'string' && x.id.length > 0 && x.id.length < 200
}

// POST /api/publish  (header x-admin-key)
// body: { action: 'publish', subjects, units, lessons, questions } | { action: 'unpublish', subjectIds }
export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'الطريقة غير مسموحة' })
  }
  if (limited(req, 10)) return res.status(429).json({ error: 'طلبات كثيرة، حاول بعد دقيقة.' })
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) return res.status(503).json({ error: 'ADMIN_KEY غير مضبوط على الخادم.' })
  if (header(req, 'x-admin-key') !== adminKey) return res.status(401).json({ error: 'مفتاح الإدارة غير صحيح.' })
  if (!redisConfig()) return res.status(503).json({ error: 'تخزين المحتوى المشترك غير مضبوط على الخادم.' })

  const body = req.body || {}
  try {
    const [rawIndex] = await redisPipeline([['GET', 'unistudy:index']])
    const index = rawIndex ? JSON.parse(String(rawIndex)) : { version: 0, subjectIds: [] }
    let ids: string[] = index.subjectIds || []

    if (body.action === 'unpublish') {
      const rm: string[] = Array.isArray(body.subjectIds) ? body.subjectIds.filter((x: unknown) => typeof x === 'string') : []
      if (rm.length) await redisPipeline(rm.map((id) => ['DEL', `unistudy:s:${id}`]))
      ids = ids.filter((id) => !rm.includes(id))
    } else if (body.action === 'publish') {
      const subjects = Array.isArray(body.subjects) ? body.subjects : []
      const units = Array.isArray(body.units) ? body.units : []
      const lessons = Array.isArray(body.lessons) ? body.lessons : []
      const questions = Array.isArray(body.questions) ? body.questions : []
      if (!subjects.length || ![...subjects, ...units, ...lessons, ...questions].every(validId)) {
        return res.status(400).json({ error: 'بيانات غير صالحة.' })
      }
      const writes: unknown[][] = []
      for (const s of subjects) {
        const part = {
          subject: s,
          units: units.filter((u: any) => u.subjectId === s.id),
          lessons: lessons.filter((l: any) => l.subjectId === s.id),
          questions: questions.filter((q: any) => q.subjectId === s.id),
        }
        const json = JSON.stringify(part)
        if (Buffer.byteLength(json) > MAX_BYTES_PER_SUBJECT) {
          return res.status(413).json({ error: `حجم مادة "${s.name}" أكبر من الحد المسموح (900KB).` })
        }
        writes.push(['SET', `unistudy:s:${s.id}`, json])
        if (!ids.includes(s.id)) ids.push(s.id)
      }
      await redisPipeline(writes)
    } else {
      return res.status(400).json({ error: 'إجراء غير معروف.' })
    }

    const next = { version: Date.now(), updatedAt: Date.now(), subjectIds: ids }
    await redisPipeline([['SET', 'unistudy:index', JSON.stringify(next)]])
    return res.status(200).json({ ok: true, version: next.version, subjectIds: ids })
  } catch (e: any) {
    console.error('[publish]', e)
    return res.status(502).json({ error: 'تعذر الحفظ في التخزين المشترك.' })
  }
}
