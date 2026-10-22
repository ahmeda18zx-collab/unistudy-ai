import { db } from '../db/db'
import type { Lesson, KeyTerm } from '../types'

export interface CreateLessonInput {
  subjectId: string
  unitId?: string
  title: string
  content: string
  summary?: string
  keyTerms?: KeyTerm[]
  sourceDocumentId?: string
  sourcePages?: number[]
  order?: number
}

export interface UpdateLessonInput {
  unitId?: string | null
  title?: string
  content?: string
  summary?: string
  keyTerms?: KeyTerm[]
  order?: number
}

export const lessonService = {
  /**
   * Create a new lesson / topic
   */
  async create(input: CreateLessonInput): Promise<Lesson> {
    if (!input.title.trim()) {
      throw new Error('يرجى كتابة عنوان الدرس أو الموضوع')
    }
    if (!input.content.trim()) {
      throw new Error('يرجى إضافة محتوى الدرس')
    }

    const now = Date.now()
    let order = input.order
    if (order === undefined) {
      const existing = await this.getBySubject(input.subjectId)
      order = existing.length + 1
    }

    const lesson: Lesson = {
      id: `lesson_${now}_${Math.random().toString(36).slice(2, 7)}`,
      subjectId: input.subjectId,
      unitId: input.unitId || undefined,
      title: input.title.trim(),
      content: input.content.trim(),
      summary: input.summary?.trim() || '',
      keyTerms: input.keyTerms || [],
      sourceDocumentId: input.sourceDocumentId || undefined,
      sourcePages: input.sourcePages || [],
      order,
      createdAt: now,
      updatedAt: now,
    }

    await db.lessons.add(lesson)
    return lesson
  },

  /**
   * Update an existing lesson
   */
  async update(id: string, input: UpdateLessonInput): Promise<Lesson> {
    const existing = await db.lessons.get(id)
    if (!existing) {
      throw new Error('الدرس غير موجود')
    }

    const updates: Partial<Lesson> = {
      updatedAt: Date.now(),
    }

    if (input.title !== undefined) {
      if (!input.title.trim()) throw new Error('لا يمكن ترك عنوان الدرس فارغاً')
      updates.title = input.title.trim()
    }
    if (input.content !== undefined) {
      if (!input.content.trim()) throw new Error('لا يمكن ترك محتوى الدرس فارغاً')
      updates.content = input.content.trim()
    }
    if (input.summary !== undefined) updates.summary = input.summary.trim()
    if (input.keyTerms !== undefined) updates.keyTerms = input.keyTerms
    if (input.order !== undefined) updates.order = input.order
    if (input.unitId !== undefined) {
      updates.unitId = input.unitId === null ? undefined : input.unitId
    }

    await db.lessons.update(id, updates)
    return { ...existing, ...updates }
  },

  /**
   * Delete a lesson
   */
  async delete(id: string): Promise<void> {
    await db.lessons.delete(id)
  },

  /**
   * Get lesson by ID
   */
  async getById(id: string): Promise<Lesson | undefined> {
    return await db.lessons.get(id)
  },

  /**
   * Get all lessons for a given subject
   */
  async getBySubject(subjectId: string): Promise<Lesson[]> {
    const lessons = await db.lessons.where('subjectId').equals(subjectId).toArray()
    return lessons.sort((a, b) => a.order - b.order)
  },

  /**
   * Get all lessons for a specific unit
   */
  async getByUnit(unitId: string): Promise<Lesson[]> {
    const lessons = await db.lessons.where('unitId').equals(unitId).toArray()
    return lessons.sort((a, b) => a.order - b.order)
  },

  /**
   * Reorder lessons
   */
  async reorder(subjectId: string, orderedIds: string[]): Promise<void> {
    await db.transaction('rw', db.lessons, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.lessons.update(orderedIds[i], {
          order: i + 1,
          updatedAt: Date.now(),
        })
      }
    })
  },

  /**
   * Get count of lessons
   */
  async getCount(subjectId?: string): Promise<number> {
    if (subjectId) {
      return await db.lessons.where('subjectId').equals(subjectId).count()
    }
    return await db.lessons.count()
  },
}
