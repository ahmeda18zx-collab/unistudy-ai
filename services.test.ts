import { describe, expect, it } from 'vitest'
import { subjectService } from '../src/services/subjectService'
import { unitService } from '../src/services/unitService'
import { documentService } from '../src/services/documentService'
import { backupService } from '../src/services/backupService'

describe('خدمات المواد والوحدات والملفات (Phase 2 Services)', () => {
  it('subjectService: يضيف مادة ويعدلها ويحذفها بنجاح', async () => {
    // 1. Create
    const subj = await subjectService.create({
      name: 'هياكل البيانات',
      code: 'CS201',
      semester: 'الفصل الدراسي الأول',
      description: 'مادة الخوارزميات وهياكل البيانات الأساسية',
    })

    expect(subj.id).toBeDefined()
    expect(subj.name).toBe('هياكل البيانات')

    // 2. Fetch
    const list = await subjectService.getAll()
    expect(list.length).toBe(1)
    expect(list[0].code).toBe('CS201')

    // 3. Update
    const updated = await subjectService.update(subj.id, {
      name: 'هياكل البيانات والخوارزميات',
    })
    expect(updated.name).toBe('هياكل البيانات والخوارزميات')

    // 4. Delete
    await subjectService.delete(subj.id)
    const afterDelete = await subjectService.getAll()
    expect(afterDelete.length).toBe(0)
  })

  it('unitService: يضيف وحدات ويرتبها بالترتيب الصحيح', async () => {
    const subj = await subjectService.create({ name: 'نظم التشغيل' })

    const u1 = await unitService.create({
      subjectId: subj.id,
      name: 'الوحدة 1: العمليات والخيوط',
      order: 1,
    })
    const u2 = await unitService.create({
      subjectId: subj.id,
      name: 'الوحدة 2: إدارة الذاكرة',
      order: 2,
    })

    const units = await unitService.getBySubject(subj.id)
    expect(units.length).toBe(2)
    expect(units[0].id).toBe(u1.id)
    expect(units[1].id).toBe(u2.id)

    // Delete unit
    await unitService.delete(u1.id)
    const remainingUnits = await unitService.getBySubject(subj.id)
    expect(remainingUnits.length).toBe(1)
    expect(remainingUnits[0].id).toBe(u2.id)
  })

  it('documentService: يرفض الملفات غير الـ PDF ويحفظ ملفات الـ PDF مع كشف التكرار', async () => {
    const subj = await subjectService.create({ name: 'الذكاء الاصطناعي' })

    // Non-PDF rejection
    const txtFile = new File(['hello text'], 'notes.txt', { type: 'text/plain' })
    await expect(
      documentService.create({
        subjectId: subj.id,
        file: txtFile,
        category: 'notes',
      })
    ).rejects.toThrow(/PDF/)

    // Valid PDF creation
    const pdfBlob = new Blob(['%PDF-1.4 mock content'], { type: 'application/pdf' })
    const pdfFile = new File([pdfBlob], 'lecture1.pdf', { type: 'application/pdf' })

    const doc = await documentService.create({
      subjectId: subj.id,
      file: pdfFile,
      category: 'lecture',
    })

    expect(doc.id).toBeDefined()
    expect(doc.name).toBe('lecture1')
    expect(doc.category).toBe('lecture')
    expect(doc.size).toBe(pdfFile.size)

    // Check duplicate rejection
    await expect(
      documentService.create({
        subjectId: subj.id,
        file: pdfFile,
        category: 'lecture',
      })
    ).rejects.toThrow(/مضاف مسبقاً/)

    // Allow duplicate with explicit flag
    const docDuplicate = await documentService.create({
      subjectId: subj.id,
      file: pdfFile,
      category: 'lecture',
      allowDuplicate: true,
    })
    expect(docDuplicate.id).not.toBe(doc.id)

    // Get all docs
    const allDocs = await documentService.getAll({ subjectId: subj.id })
    expect(allDocs.length).toBe(2)

    // Update document
    const updated = await documentService.update(doc.id, {
      name: 'المحاضرة الأولى: مقدمة',
      category: 'summary',
    })
    expect(updated.name).toBe('المحاضرة الأولى: مقدمة')
    expect(updated.category).toBe('summary')

    // Delete document
    await documentService.delete(doc.id)
    const remainingDocs = await documentService.getAll({ subjectId: subj.id })
    expect(remainingDocs.length).toBe(1)
  })

  it('subjectService.delete يحذف المادة ووحداتها وملفاتها بحذف تسلسلي آمن', async () => {
    const subj = await subjectService.create({ name: 'شبكات الحاسب' })
    const unit = await unitService.create({ subjectId: subj.id, name: 'طبقة النقل' })
    const pdfFile = new File(['%PDF-1.4 content'], 'networking.pdf', { type: 'application/pdf' })
    await documentService.create({
      subjectId: subj.id,
      unitId: unit.id,
      file: pdfFile,
      category: 'lecture',
    })

    const statsBefore = await subjectService.getStats(subj.id)
    expect(statsBefore.unitsCount).toBe(1)
    expect(statsBefore.documentsCount).toBe(1)

    // Cascading delete
    await subjectService.delete(subj.id)

    const subs = await subjectService.getAll()
    const units = await unitService.getBySubject(subj.id)
    const docs = await documentService.getAll({ subjectId: subj.id })

    expect(subs.length).toBe(0)
    expect(units.length).toBe(0)
    expect(docs.length).toBe(0)
  })
})
