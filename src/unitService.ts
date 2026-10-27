import { db } from '../db/db'
import type { Unit } from '../types'

export interface CreateUnitInput {
  subjectId: string
  name: string
  description?: string
  order?: number
}

export interface UpdateUnitInput {
  name?: string
  description?: string
  order?: number
}

export const unitService = {
  async getBySubject(subjectId: string): Promise<Unit[]> {
    const list = await db.units.where('subjectId').equals(subjectId).toArray()
    return list.sort((a, b) => a.order - b.order)
  },

  async getById(id: string): Promise<Unit | undefined> {
    return await db.units.get(id)
  },

  async create(input: CreateUnitInput): Promise<Unit> {
    const trimmedName = input.name.trim()
    if (!trimmedName) {
      throw new Error('يرجى إدخال اسم الوحدة / الفصل')
    }

    const existingCount = await db.units.where('subjectId').equals(input.subjectId).count()
    const now = Date.now()
    const unit: Unit = {
      id: `unit_${now}_${Math.random().toString(36).slice(2, 7)}`,
      subjectId: input.subjectId,
      name: trimmedName,
      description: input.description?.trim() || '',
      order: input.order !== undefined ? input.order : existingCount + 1,
      createdAt: now,
      updatedAt: now,
    }

    await db.units.add(unit)
    return unit
  },

  async update(id: string, input: UpdateUnitInput): Promise<Unit> {
    const existing = await db.units.get(id)
    if (!existing) {
      throw new Error('الوحدة غير موجودة')
    }

    const updates: Partial<Unit> = {
      updatedAt: Date.now(),
    }

    if (input.name !== undefined) {
      const trimmed = input.name.trim()
      if (!trimmed) throw new Error('لا يمكن أن يكون اسم الوحدة فارغاً')
      updates.name = trimmed
    }
    if (input.description !== undefined) updates.description = input.description.trim()
    if (input.order !== undefined) updates.order = input.order

    await db.units.update(id, updates)
    return { ...existing, ...updates }
  },

  async delete(id: string): Promise<void> {
    await db.transaction('rw', [db.units, db.documents, db.questions], async () => {
      // Unlink documents from this unit (set unitId to undefined) rather than deleting documents
      const docs = await db.documents.where('unitId').equals(id).toArray()
      for (const doc of docs) {
        await db.documents.update(doc.id, { unitId: undefined, updatedAt: Date.now() })
      }

      // Also unlink questions
      const questions = await db.questions.where('unitId').equals(id).toArray()
      for (const q of questions) {
        await db.questions.update(q.id, { unitId: undefined, updatedAt: Date.now() })
      }

      await db.units.delete(id)
    })
  },
}
