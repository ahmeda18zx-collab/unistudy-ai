import { db } from '../db/db'
import type { Subject } from '../types'

export interface CreateSubjectInput {
  name: string
  description?: string
  semester?: string
  code?: string
}

export interface UpdateSubjectInput {
  name?: string
  description?: string
  semester?: string
  code?: string
}

export interface SubjectStats {
  unitsCount: number
  documentsCount: number
  totalFilesSize: number
  questionsCount: number
}

export const subjectService = {
  async getAll(): Promise<Subject[]> {
    return await db.subjects.orderBy('createdAt').reverse().toArray()
  },

  async getById(id: string): Promise<Subject | undefined> {
    return await db.subjects.get(id)
  },

  async create(input: CreateSubjectInput): Promise<Subject> {
    const trimmedName = input.name.trim()
    if (!trimmedName) {
      throw new Error('يرجى إدخال اسم المادة الدراسية')
    }

    const now = Date.now()
    const subject: Subject = {
      id: `subj_${now}_${Math.random().toString(36).slice(2, 7)}`,
      name: trimmedName,
      description: input.description?.trim() || '',
      semester: input.semester?.trim() || '',
      code: input.code?.trim() || '',
      createdAt: now,
      updatedAt: now,
    }

    await db.subjects.add(subject)
    return subject
  },

  async update(id: string, input: UpdateSubjectInput): Promise<Subject> {
    const existing = await db.subjects.get(id)
    if (!existing) {
      throw new Error('المادة غير موجودة')
    }

    const updates: Partial<Subject> = {
      updatedAt: Date.now(),
    }

    if (input.name !== undefined) {
      const trimmed = input.name.trim()
      if (!trimmed) throw new Error('لا يمكن أن يكون اسم المادة فارغاً')
      updates.name = trimmed
    }
    if (input.description !== undefined) updates.description = input.description.trim()
    if (input.semester !== undefined) updates.semester = input.semester.trim()
    if (input.code !== undefined) updates.code = input.code.trim()

    await db.subjects.update(id, updates)
    return { ...existing, ...updates }
  },

  async delete(id: string): Promise<void> {
    await db.transaction('rw', [db.subjects, db.units, db.lessons, db.documents, db.questions, db.exams, db.examAttempts, db.studyProgress, db.importJobs], async () => {
      // Also remove attempts, lessons and import jobs so no orphan records remain
      await db.examAttempts.where('subjectId').equals(id).delete()
      await db.lessons.where('subjectId').equals(id).delete()
      await db.importJobs.where('subjectId').equals(id).delete()
      // Delete all documents linked to this subject
      await db.documents.where('subjectId').equals(id).delete()
      // Delete all units linked to this subject
      await db.units.where('subjectId').equals(id).delete()
      // Delete questions linked
      await db.questions.where('subjectId').equals(id).delete()
      // Delete exams linked
      await db.exams.where('subjectId').equals(id).delete()
      // Delete study progress
      await db.studyProgress.where('subjectId').equals(id).delete()
      // Delete subject itself
      await db.subjects.delete(id)
    })
  },

  async getStats(subjectId: string): Promise<SubjectStats> {
    const [units, docs, questions] = await Promise.all([
      db.units.where('subjectId').equals(subjectId).count(),
      db.documents.where('subjectId').equals(subjectId).toArray(),
      db.questions.where('subjectId').equals(subjectId).count(),
    ])

    const totalFilesSize = docs.reduce((acc, doc) => acc + (doc.size || 0), 0)

    return {
      unitsCount: units,
      documentsCount: docs.length,
      totalFilesSize,
      questionsCount: questions,
    }
  },
}
