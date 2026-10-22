import { db } from '../db/db'
import type {
  Question,
  QuestionType,
  QuestionDifficulty,
  VerificationStatus,
} from '../types'

export interface CreateQuestionInput {
  subjectId: string
  unitId?: string
  lessonId?: string
  type: QuestionType
  text: string
  options?: string[]
  correctAnswer?: string | boolean
  explanation?: string
  difficulty: QuestionDifficulty
  sourceType?: 'manual' | 'ai' | 'pdf_extract'
  sourceDocumentId?: string
  sourceReference?: string
  sourcePage?: number
  verified?: boolean
  verificationStatus?: VerificationStatus
  userReviewed?: boolean
}

export interface UpdateQuestionInput {
  subjectId?: string
  unitId?: string | null
  lessonId?: string | null
  type?: QuestionType
  text?: string
  options?: string[]
  correctAnswer?: string | boolean
  explanation?: string
  difficulty?: QuestionDifficulty
  sourceDocumentId?: string | null
  sourceReference?: string
  sourcePage?: number
  verified?: boolean
  verificationStatus?: VerificationStatus
  userReviewed?: boolean
}

export interface QuestionFilters {
  subjectId?: string
  unitId?: string
  lessonId?: string
  type?: QuestionType
  difficulty?: QuestionDifficulty
  searchQuery?: string
  verified?: boolean
  verificationStatus?: VerificationStatus
}

export interface QuestionStats {
  total: number
  multipleChoiceCount: number
  trueFalseCount: number
  easyCount: number
  mediumCount: number
  hardCount: number
  verifiedCount: number
  needsReviewCount: number
}

export const questionService = {
  /**
   * Validate question fields according to type
   */
  validate(input: CreateQuestionInput | UpdateQuestionInput): void {
    if (input.text !== undefined) {
      if (!input.text.trim()) {
        throw new Error('يرجى كتابة نص السؤال')
      }
    }

    const isNeedsReview = input.verificationStatus === 'needs_review'

    if (input.type === 'multiple_choice') {
      const options = input.options
      if (!options || !Array.isArray(options) || options.length < 2) {
        throw new Error('سؤال الاختيار من متعدد يتطلب خيارين على الأقل')
      }

      const trimmedOptions = options.map((opt) => opt.trim())
      if (trimmedOptions.some((opt) => opt.length === 0)) {
        throw new Error('لا يمكن أن يحتوي السؤال على خيارات فارغة')
      }

      // If needs review, answer may be unset or empty pending review
      if (!isNeedsReview) {
        if (input.correctAnswer === undefined || typeof input.correctAnswer !== 'string' || !input.correctAnswer.trim()) {
          throw new Error('يرجى تحديد الإجابة الصحيحة من بين الخيارات المتاحة')
        }

        const answerTrimmed = input.correctAnswer.trim()
        if (!trimmedOptions.includes(answerTrimmed)) {
          throw new Error('الإجابة الصحيحة المحددة يجب أن تطابق أحد الخيارات')
        }
      }
    } else if (input.type === 'true_false') {
      if (!isNeedsReview && typeof input.correctAnswer !== 'boolean') {
        throw new Error('يرجى تحديد الإجابة الصحيحة (صح أو خطأ)')
      }
    }
  },

  /**
   * Create new question in Dexie
   */
  async create(input: CreateQuestionInput): Promise<Question> {
    this.validate(input)

    const now = Date.now()
    const cleanOptions =
      input.type === 'multiple_choice' && input.options
        ? input.options.map((o) => o.trim())
        : undefined

    const verificationStatus: VerificationStatus =
      input.verificationStatus || (input.verified === false ? 'needs_review' : 'verified')
    const userReviewed = input.userReviewed ?? (verificationStatus === 'verified')

    let parsedAnswer: string | boolean = ''
    if (input.type === 'true_false') {
      parsedAnswer = typeof input.correctAnswer === 'boolean' ? input.correctAnswer : false
    } else {
      parsedAnswer = input.correctAnswer ? String(input.correctAnswer).trim() : ''
    }

    const question: Question = {
      id: `q_${now}_${Math.random().toString(36).slice(2, 7)}`,
      subjectId: input.subjectId,
      unitId: input.unitId || undefined,
      lessonId: input.lessonId || undefined,
      type: input.type,
      text: input.text.trim(),
      options: cleanOptions,
      correctAnswer: parsedAnswer,
      explanation: input.explanation?.trim() || '',
      difficulty: input.difficulty || 'medium',
      sourceType: input.sourceType || 'manual',
      sourceDocumentId: input.sourceDocumentId || undefined,
      sourceReference: input.sourceReference?.trim() || '',
      sourcePage: input.sourcePage,
      verified: verificationStatus === 'verified',
      verificationStatus,
      userReviewed,
      createdAt: now,
      updatedAt: now,
    }

    await db.questions.add(question)
    return question
  },

  /**
   * Update existing question
   */
  async update(id: string, input: UpdateQuestionInput): Promise<Question> {
    const existing = await db.questions.get(id)
    if (!existing) {
      throw new Error('السؤال غير موجود')
    }

    const merged = { ...existing, ...input }
    this.validate(merged as any)

    const updates: Partial<Question> = {
      updatedAt: Date.now(),
    }

    if (input.text !== undefined) updates.text = input.text.trim()
    if (input.type !== undefined) updates.type = input.type
    if (input.options !== undefined) {
      updates.options = input.options ? input.options.map((o) => o.trim()) : undefined
    }
    if (input.correctAnswer !== undefined) {
      updates.correctAnswer =
        (input.type || existing.type) === 'true_false'
          ? Boolean(input.correctAnswer)
          : String(input.correctAnswer).trim()
    }
    if (input.explanation !== undefined) updates.explanation = input.explanation.trim()
    if (input.difficulty !== undefined) updates.difficulty = input.difficulty
    if (input.subjectId !== undefined) updates.subjectId = input.subjectId
    if (input.unitId !== undefined) {
      updates.unitId = input.unitId === null ? undefined : input.unitId
    }
    if (input.lessonId !== undefined) {
      updates.lessonId = input.lessonId === null ? undefined : input.lessonId
    }
    if (input.sourceDocumentId !== undefined) {
      updates.sourceDocumentId = input.sourceDocumentId === null ? undefined : input.sourceDocumentId
    }
    if (input.sourceReference !== undefined) {
      updates.sourceReference = input.sourceReference.trim()
    }
    if (input.sourcePage !== undefined) {
      updates.sourcePage = input.sourcePage
    }
    if (input.verificationStatus !== undefined) {
      updates.verificationStatus = input.verificationStatus
      updates.verified = input.verificationStatus === 'verified'
    }
    if (input.userReviewed !== undefined) {
      updates.userReviewed = input.userReviewed
    }
    if (input.verified !== undefined && input.verificationStatus === undefined) {
      updates.verified = input.verified
      updates.verificationStatus = input.verified ? 'verified' : 'needs_review'
    }

    await db.questions.update(id, updates)
    return { ...existing, ...updates }
  },

  /**
   * Verify an unverified question and mark it approved for exam grading
   */
  async verifyQuestion(id: string, correctAnswer?: string | boolean): Promise<Question> {
    const existing = await db.questions.get(id)
    if (!existing) {
      throw new Error('السؤال غير موجود')
    }

    const updates: Partial<Question> = {
      verificationStatus: 'verified',
      verified: true,
      userReviewed: true,
      updatedAt: Date.now(),
    }

    if (correctAnswer !== undefined) {
      updates.correctAnswer = correctAnswer
    }

    await db.questions.update(id, updates)
    return { ...existing, ...updates }
  },

  /**
   * Delete a question
   */
  async delete(id: string): Promise<void> {
    await db.questions.delete(id)
  },

  /**
   * Get single question by ID
   */
  async getById(id: string): Promise<Question | undefined> {
    return await db.questions.get(id)
  },

  /**
   * Get questions with filters
   */
  async getAll(filters?: QuestionFilters): Promise<Question[]> {
    let collection = db.questions.toCollection()

    if (filters?.subjectId) {
      collection = db.questions.where('subjectId').equals(filters.subjectId)
    }

    let list = await collection.toArray()

    if (filters?.unitId) {
      list = list.filter((q) => q.unitId === filters.unitId)
    }

    if (filters?.lessonId) {
      list = list.filter((q) => q.lessonId === filters.lessonId)
    }

    if (filters?.type) {
      list = list.filter((q) => q.type === filters.type)
    }

    if (filters?.difficulty) {
      list = list.filter((q) => q.difficulty === filters.difficulty)
    }

    if (filters?.verificationStatus) {
      list = list.filter((q) => q.verificationStatus === filters.verificationStatus)
    }

    if (filters?.verified !== undefined) {
      list = list.filter((q) => {
        const isVer = q.verificationStatus === 'verified' || Boolean(q.verified)
        return isVer === filters.verified
      })
    }

    if (filters?.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.trim().toLowerCase()
      list = list.filter(
        (item) =>
          item.text.toLowerCase().includes(q) ||
          (item.explanation && item.explanation.toLowerCase().includes(q)) ||
          (item.options && item.options.some((opt) => opt.toLowerCase().includes(q))) ||
          (item.sourceReference && item.sourceReference.toLowerCase().includes(q))
      )
    }

    return list.sort((a, b) => b.createdAt - a.createdAt)
  },

  /**
   * Calculate Question statistics
   */
  async getStats(subjectId?: string): Promise<QuestionStats> {
    const list = subjectId
      ? await db.questions.where('subjectId').equals(subjectId).toArray()
      : await db.questions.toArray()

    let multipleChoiceCount = 0
    let trueFalseCount = 0
    let easyCount = 0
    let mediumCount = 0
    let hardCount = 0
    let verifiedCount = 0
    let needsReviewCount = 0

    for (const q of list) {
      if (q.type === 'multiple_choice') multipleChoiceCount++
      else if (q.type === 'true_false') trueFalseCount++

      if (q.difficulty === 'easy') easyCount++
      else if (q.difficulty === 'hard') hardCount++
      else mediumCount++

      if (q.verificationStatus === 'verified' || (q.verified && q.verificationStatus !== 'needs_review')) {
        verifiedCount++
      } else {
        needsReviewCount++
      }
    }

    return {
      total: list.length,
      multipleChoiceCount,
      trueFalseCount,
      easyCount,
      mediumCount,
      hardCount,
      verifiedCount,
      needsReviewCount,
    }
  },
}
