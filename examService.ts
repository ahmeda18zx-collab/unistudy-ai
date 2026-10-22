import { db } from '../db/db'
import type {
  Exam,
  ExamAttempt,
  Question,
  QuestionDifficulty,
  QuestionType,
} from '../types'
import { questionService } from './questionService'

export interface CreateExamConfig {
  title: string
  subjectId: string
  unitIds?: string[]
  questionTypes?: QuestionType[]
  questionCount: number
  durationMinutes: number
  difficulty?: 'all' | QuestionDifficulty
  shuffleQuestions?: boolean
  shuffleOptions?: boolean
  onlyVerified?: boolean
}

export interface SubmitAttemptInput {
  attemptId: string
  answers: Record<string, string | boolean>
  elapsedTimeSeconds: number
}

export interface ExamAttemptResult {
  attempt: ExamAttempt
  totalQuestions: number
  correctCount: number
  wrongCount: number
  unansweredCount: number
  percentage: number
  questions: {
    question: Question
    userAnswer?: string | boolean
    correctAnswer: string | boolean
    isCorrect: boolean
    explanation?: string
    sourceReference?: string
    sourcePage?: number
  }[]
}

export function toBool(v: unknown): boolean {
  if (typeof v === 'string') {
    const l = v.trim().toLowerCase()
    return l === 'true' || l === 'صح' || l === 'صحيح'
  }
  return Boolean(v)
}

export const examService = {
  /**
   * Generates a new exam from available questions in the database
   */
  async createExam(config: CreateExamConfig): Promise<{ exam: Exam; questions: Question[] }> {
    const onlyVerified = config.onlyVerified !== false // default true

    // Fetch candidate questions
    const allQuestions = await questionService.getAll({
      subjectId: config.subjectId,
      verificationStatus: onlyVerified ? 'verified' : undefined,
    })

    let filtered = allQuestions.filter((q) => {
      // Must be verified if onlyVerified is true
      if (onlyVerified && q.verificationStatus !== 'verified') {
        return false
      }
      // Unit filter
      if (config.unitIds && config.unitIds.length > 0) {
        if (!q.unitId || !config.unitIds.includes(q.unitId)) return false
      }
      // Type filter
      if (config.questionTypes && config.questionTypes.length > 0) {
        if (!config.questionTypes.includes(q.type)) return false
      }
      // Difficulty filter
      if (config.difficulty && config.difficulty !== 'all') {
        if (q.difficulty !== config.difficulty) return false
      }
      return true
    })

    if (filtered.length === 0) {
      throw new Error(
        onlyVerified
          ? 'لا توجد أسئلة معتمدة ومؤكدة الإجابة تطابق هذه المعايير. يرجى اعتماد إجابات الأسئلة أولاً أو تعديل التصفية.'
          : 'لا توجد أسئلة تطابق هذه المعايير.'
      )
    }

    // Shuffle questions if requested
    if (config.shuffleQuestions !== false) {
      filtered = [...filtered].sort(() => Math.random() - 0.5)
    }

    // Limit count
    const selected = filtered.slice(0, Math.min(config.questionCount, filtered.length))

    // Shuffle options inside questions if requested
    const finalQuestions: Question[] = selected.map((q) => {
      if (config.shuffleOptions && q.type === 'multiple_choice' && q.options) {
        return {
          ...q,
          options: [...q.options].sort(() => Math.random() - 0.5),
        }
      }
      return { ...q }
    })

    const now = Date.now()
    const exam: Exam = {
      id: `exam_${now}_${Math.random().toString(36).slice(2, 7)}`,
      title: config.title.trim() || 'امتحان تقييمي',
      subjectId: config.subjectId,
      unitIds: config.unitIds,
      questionTypes: config.questionTypes,
      questionCount: finalQuestions.length,
      durationMinutes: config.durationMinutes || 30,
      difficulty: config.difficulty || 'all',
      shuffleQuestions: config.shuffleQuestions !== false,
      shuffleOptions: Boolean(config.shuffleOptions),
      createdAt: now,
    }

    await db.exams.add(exam)
    return { exam, questions: finalQuestions }
  },

  /**
   * Start an attempt for an exam, storing a complete snapshot of questions
   */
  async startAttempt(exam: Exam, questions: Question[]): Promise<ExamAttempt> {
    const now = Date.now()
    const attempt: ExamAttempt = {
      id: `attempt_${now}_${Math.random().toString(36).slice(2, 7)}`,
      examId: exam.id,
      subjectId: exam.subjectId,
      startedAt: now,
      status: 'in_progress',
      answers: {},
      elapsedTimeSeconds: 0,
      questionSnapshot: JSON.parse(JSON.stringify(questions)), // deep clone snapshot
    }

    await db.examAttempts.add(attempt)
    return attempt
  },

  /**
   * Save partial progress during exam (auto-save)
   */
  async saveProgress(
    attemptId: string,
    answers: Record<string, string | boolean>,
    elapsedTimeSeconds: number
  ): Promise<void> {
    // Never overwrite an attempt that was already submitted
    await db.examAttempts
      .where('id')
      .equals(attemptId)
      .filter((a) => a.status === 'in_progress')
      .modify({ answers, elapsedTimeSeconds })
  },

  /** Remaining seconds computed from the real start time (survives reloads) */
  remainingSeconds(startedAt: number, durationMinutes: number, now = Date.now()): number {
    return Math.max(0, Math.ceil((startedAt + durationMinutes * 60000 - now) / 1000))
  },

  /** Latest unfinished attempt with its exam, so it can be resumed after a reload */
  async getResumableAttempt(): Promise<{ exam: Exam; attempt: ExamAttempt } | null> {
    const open = (await db.examAttempts.where('status').equals('in_progress').toArray()).sort(
      (a, b) => b.startedAt - a.startedAt
    )
    for (const attempt of open) {
      const exam = await db.exams.get(attempt.examId)
      if (exam) return { exam, attempt }
    }
    return null
  },

  /**
   * Submit and grade an exam attempt against its question snapshot
   */
  async submitAttempt(input: SubmitAttemptInput): Promise<ExamAttemptResult> {
    const attempt = await db.examAttempts.get(input.attemptId)
    if (!attempt) {
      throw new Error('محاولة الامتحان غير موجودة')
    }

    // Idempotent: a second submit (double click, timer + click) never re-grades
    if (attempt.status === 'completed') {
      const existing = await this.getAttemptResult(attempt.id)
      if (existing) return existing
    }

    const snapshot = attempt.questionSnapshot || []
    let correctCount = 0
    let wrongCount = 0
    let unansweredCount = 0

    const gradedQuestions = snapshot.map((q) => {
      const userAns = input.answers[q.id]
      const hasAnswered = userAns !== undefined && userAns !== ''

      let isCorrect = false
      if (hasAnswered) {
        if (q.type === 'true_false') {
          isCorrect = toBool(userAns) === toBool(q.correctAnswer)
        } else {
          isCorrect =
            String(userAns).trim().toLowerCase() ===
            String(q.correctAnswer).trim().toLowerCase()
        }

        if (isCorrect) correctCount++
        else wrongCount++
      } else {
        unansweredCount++
      }

      return {
        question: q,
        userAnswer: userAns,
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
        sourceReference: q.sourceReference,
        sourcePage: q.sourcePage,
      }
    })

    const total = snapshot.length
    const score = correctCount
    const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0
    const submittedAt = Date.now()

    const updatedAttempt: ExamAttempt = {
      ...attempt,
      answers: input.answers,
      score,
      totalScore: total,
      status: 'completed',
      submittedAt,
      elapsedTimeSeconds: input.elapsedTimeSeconds,
    }

    await db.examAttempts.put(updatedAttempt)

    return {
      attempt: updatedAttempt,
      totalQuestions: total,
      correctCount,
      wrongCount,
      unansweredCount,
      percentage,
      questions: gradedQuestions,
    }
  },

  /**
   * Get all past exam attempts
   */
  async getAttempts(subjectId?: string): Promise<ExamAttempt[]> {
    const list = subjectId
      ? await db.examAttempts.where('subjectId').equals(subjectId).toArray()
      : await db.examAttempts.toArray()

    return list.sort((a, b) => b.startedAt - a.startedAt)
  },

  /**
   * Get single attempt with computed grade breakdown
   */
  async getAttemptResult(attemptId: string): Promise<ExamAttemptResult | null> {
    const attempt = await db.examAttempts.get(attemptId)
    if (!attempt) return null

    const snapshot = attempt.questionSnapshot || []
    let correctCount = 0
    let wrongCount = 0
    let unansweredCount = 0

    const gradedQuestions = snapshot.map((q) => {
      const userAns = attempt.answers[q.id]
      const hasAnswered = userAns !== undefined && userAns !== ''

      let isCorrect = false
      if (hasAnswered) {
        if (q.type === 'true_false') {
          isCorrect = toBool(userAns) === toBool(q.correctAnswer)
        } else {
          isCorrect =
            String(userAns).trim().toLowerCase() ===
            String(q.correctAnswer).trim().toLowerCase()
        }

        if (isCorrect) correctCount++
        else wrongCount++
      } else {
        unansweredCount++
      }

      return {
        question: q,
        userAnswer: userAns,
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
        sourceReference: q.sourceReference,
        sourcePage: q.sourcePage,
      }
    })

    const total = snapshot.length
    const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0

    return {
      attempt,
      totalQuestions: total,
      correctCount,
      wrongCount,
      unansweredCount,
      percentage,
      questions: gradedQuestions,
    }
  },

  /**
   * Delete an attempt
   */
  async deleteAttempt(attemptId: string): Promise<void> {
    await db.examAttempts.delete(attemptId)
  },
}
