import { db } from '../db/db'
import type { Document, DocumentCategory } from '../types'

export interface CreateDocumentInput {
  subjectId: string
  unitId?: string
  file: File
  category: DocumentCategory
  customName?: string
  allowDuplicate?: boolean
}

export interface UpdateDocumentInput {
  name?: string
  category?: DocumentCategory
  unitId?: string | null
}

export interface DocumentFilterOptions {
  subjectId?: string
  unitId?: string
  category?: DocumentCategory
  searchQuery?: string
}

export interface StorageStats {
  totalFiles: number
  totalBytes: number
  quotaBytes?: number
  usageBytes?: number
  quotaPercentage?: number
}

export const documentService = {
  async getAll(filters?: DocumentFilterOptions): Promise<Document[]> {
    let collection = db.documents.toCollection()

    if (filters?.subjectId) {
      collection = db.documents.where('subjectId').equals(filters.subjectId)
    }

    let items = await collection.toArray()

    if (filters?.unitId) {
      items = items.filter((d) => d.unitId === filters.unitId)
    }

    if (filters?.category) {
      items = items.filter((d) => d.category === filters.category)
    }

    if (filters?.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.trim().toLowerCase()
      items = items.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.originalFileName.toLowerCase().includes(q)
      )
    }

    // Sort descending by creation date
    return items.sort((a, b) => b.createdAt - a.createdAt)
  },

  async getById(id: string): Promise<Document | undefined> {
    return await db.documents.get(id)
  },

  /**
   * Check if a file with matching name and size already exists in the same subject
   */
  async checkDuplicate(subjectId: string, fileName: string, fileSize: number): Promise<Document | undefined> {
    const existing = await db.documents
      .where('subjectId')
      .equals(subjectId)
      .toArray()

    return existing.find(
      (doc) =>
        (doc.originalFileName === fileName || doc.name === fileName) &&
        doc.size === fileSize
    )
  },

  /**
   * Add a new PDF document into IndexedDB
   */
  async create(input: CreateDocumentInput): Promise<Document> {
    const { file, subjectId, unitId, category, customName, allowDuplicate } = input

    // Validation 1: Verify file format
    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf')

    if (!isPdf) {
      throw new Error(`الملف "${file.name}" ليس بصيغة PDF. تدعم النسخة الحالية ملفات PDF فقط.`)
    }

    // Validation 2: Check empty or zero-byte file
    if (file.size === 0) {
      throw new Error(`الملف "${file.name}" فارغ (0 بايت).`)
    }

    // Validation 3: Duplicate detection
    if (!allowDuplicate) {
      const duplicate = await this.checkDuplicate(subjectId, file.name, file.size)
      if (duplicate) {
        const error = new Error(`الملف "${file.name}" مضاف مسبقاً لهذه المادة.`)
        ;(error as any).isDuplicate = true
        ;(error as any).duplicateDoc = duplicate
        throw error
      }
    }

    // Validation 4: read the real bytes and check the PDF signature.
    // We store a fresh in-memory Blob (not the picker's File handle), because
    // a File from <input> can be a lazy reference to the original file on disk
    // and may become unreadable later (notably on mobile browsers).
    let buffer: ArrayBuffer
    try {
      buffer = await file.arrayBuffer()
    } catch {
      throw new Error(`تعذر قراءة الملف \"${file.name}\" من الجهاز. حاول اختياره مرة أخرى.`)
    }
    const head = new TextDecoder('ascii').decode(new Uint8Array(buffer.slice(0, 1024)))
    if (!head.includes('%PDF-')) {
      throw new Error(`الملف \"${file.name}\" ليس ملف PDF صالحاً (التوقيع غير موجود).`)
    }
    const storedBlob = new Blob([buffer], { type: 'application/pdf' })

    const now = Date.now()
    const cleanDisplayName =
      customName && customName.trim()
        ? customName.trim()
        : file.name.replace(/\.pdf$/i, '')

    const documentRecord: Document = {
      id: `doc_${now}_${Math.random().toString(36).slice(2, 7)}`,
      subjectId,
      unitId: unitId || undefined,
      name: cleanDisplayName,
      originalFileName: file.name,
      category,
      mimeType: 'application/pdf',
      size: storedBlob.size,
      blob: storedBlob,
      createdAt: now,
      updatedAt: now,
    }

    try {
      await db.transaction('rw', db.documents, async () => {
        await db.documents.add(documentRecord)
      })
      // Read back to prove the binary content was really persisted
      const saved = await db.documents.get(documentRecord.id)
      if (!saved || !saved.blob || saved.blob.size !== storedBlob.size) {
        await db.documents.delete(documentRecord.id).catch(() => undefined)
        throw new Error('تم الحفظ لكن لم يتم العثور على محتوى الملف عند إعادة القراءة.')
      }
    } catch (err: any) {
      if (err?.name === 'QuotaExceededError') {
        throw new Error('تم تجاوز السعة التخزينية المتاحة للمتصفح. يرجى حذف بعض الملفات غير المستخدمة.')
      }
      console.error('[documentService.create] save failed:', err)
      throw new Error(`فشل حفظ الملف محلياً: ${err?.message || 'خطأ غير معروف'}`)
    }

    return documentRecord
  },

  /**
   * Update metadata (rename, change category, change unit)
   */
  async update(id: string, input: UpdateDocumentInput): Promise<Document> {
    const existing = await db.documents.get(id)
    if (!existing) {
      throw new Error('الملف غير موجود')
    }

    const updates: Partial<Document> = {
      updatedAt: Date.now(),
    }

    if (input.name !== undefined) {
      const trimmed = input.name.trim()
      if (!trimmed) throw new Error('لا يمكن أن يكون اسم الملف فارغاً')
      updates.name = trimmed
    }

    if (input.category !== undefined) {
      updates.category = input.category
    }

    if (input.unitId !== undefined) {
      updates.unitId = input.unitId === null ? undefined : input.unitId
    }

    await db.documents.update(id, updates)
    return { ...existing, ...updates }
  },

  /**
   * Delete a document from IndexedDB
   */
  async delete(id: string): Promise<void> {
    await db.documents.delete(id)
  },

  /**
   * Create an object URL for viewing/downloading the file
   */
  createBlobUrl(doc: Document): string {
    return URL.createObjectURL(doc.blob)
  },

  /**
   * Download the document locally to user's device
   */
  downloadDocument(doc: Document): void {
    const url = URL.createObjectURL(doc.blob)
    const a = window.document.createElement('a')
    a.href = url
    a.download = doc.originalFileName.endsWith('.pdf')
      ? doc.originalFileName
      : `${doc.name}.pdf`
    window.document.body.appendChild(a)
    a.click()
    window.document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  },

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    const allDocs = await db.documents.toArray()
    const totalBytes = allDocs.reduce((acc, d) => acc + (d.size || 0), 0)

    let quotaBytes: number | undefined
    let usageBytes: number | undefined
    let quotaPercentage: number | undefined

    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate()
        quotaBytes = estimate.quota
        usageBytes = estimate.usage
        if (quotaBytes && usageBytes) {
          quotaPercentage = Math.round((usageBytes / quotaBytes) * 100)
        }
      } catch {
        // Storage estimate not supported or denied
      }
    }

    return {
      totalFiles: allDocs.length,
      totalBytes,
      quotaBytes,
      usageBytes,
      quotaPercentage,
    }
  },
}
