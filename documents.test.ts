import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/db'
import { documentService } from '../src/services/documentService'

function makePdf(name: string, extra = ''): File {
  const body = `%PDF-1.4\n1 0 obj<<>>endobj\n${extra}\n%%EOF`
  return new File([body], name, { type: 'application/pdf' })
}

describe('document lifecycle', () => {
  beforeEach(async () => {
    await db.documents.clear()
  })

  it('stores binary content and reads it back identically', async () => {
    const file = makePdf('ملف عربي.pdf', 'مرحبا')
    const doc = await documentService.create({ subjectId: 's1', file, category: 'other' as any })
    const saved = await db.documents.get(doc.id)
    expect(saved?.originalFileName).toBe('ملف عربي.pdf')
    const a = new Uint8Array(await file.arrayBuffer())
    const b = new Uint8Array(await saved!.blob.arrayBuffer())
    expect(b).toEqual(a)
  })

  it('rename does not damage the content', async () => {
    const doc = await documentService.create({ subjectId: 's1', file: makePdf('a.pdf'), category: 'other' as any })
    const before = doc.size
    await documentService.update(doc.id, { name: 'اسم جديد' })
    const saved = await db.documents.get(doc.id)
    expect(saved?.name).toBe('اسم جديد')
    expect(saved?.blob.size).toBe(before)
  })

  it('rejects non-PDF content disguised as .pdf', async () => {
    const fake = new File(['hello'], 'fake.pdf', { type: 'application/pdf' })
    await expect(
      documentService.create({ subjectId: 's1', file: fake, category: 'other' as any })
    ).rejects.toThrow()
  })

  it('detects duplicates but allows an explicit copy', async () => {
    const f = makePdf('d.pdf')
    await documentService.create({ subjectId: 's1', file: f, category: 'other' as any })
    await expect(
      documentService.create({ subjectId: 's1', file: f, category: 'other' as any })
    ).rejects.toThrow()
    await documentService.create({ subjectId: 's1', file: f, category: 'other' as any, allowDuplicate: true })
    expect(await db.documents.count()).toBe(2)
  })
})
