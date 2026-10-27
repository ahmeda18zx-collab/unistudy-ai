import { db } from '../db/db'
import type {
  Subject,
  Unit,
  Document,
  Lesson,
  Question,
  ImportJob,
  ImportContentType,
} from '../types'
import {
  pdfProcessingService,
  type ExtractedUnitDraft,
  type ExtractedLessonDraft,
  type ExtractedQuestionDraftItem,
} from './pdfProcessingService'
import { subjectService } from './subjectService'
import { unitService } from './unitService'
import { lessonService } from './lessonService'
import { questionService } from './questionService'
import { documentService } from './documentService'

export interface CommitImportPayload {
  jobId: string
  subjectId: string
  units: ExtractedUnitDraft[]
  generalLessons: ExtractedLessonDraft[]
  questions: ExtractedQuestionDraftItem[]
  originalFileBlob: Blob
  originalFileName: string
  importType: ImportContentType
}

export interface CommitImportResult {
  createdUnitsCount: number
  createdLessonsCount: number
  createdQuestionsCount: number
  unverifiedQuestionsCount: number
  archivedDocumentId: string
}

export const importService = {
  /**
   * Initializes an import job
   */
  async createJob(
    subjectId: string,
    fileName: string,
    importType: ImportContentType
  ): Promise<ImportJob> {
    const now = Date.now()
    const job: ImportJob = {
      id: `job_${now}_${Math.random().toString(36).slice(2, 7)}`,
      subjectId,
      fileName,
      importType,
      status: 'idle',
      progress: 0,
      extractedUnitsCount: 0,
      extractedLessonsCount: 0,
      extractedQuestionsCount: 0,
      unverifiedQuestionsCount: 0,
      createdAt: now,
    }

    await db.importJobs.add(job)
    return job
  },

  /**
   * Updates job progress
   */
  async updateJob(id: string, updates: Partial<ImportJob>): Promise<void> {
    await db.importJobs.update(id, updates)
  },

  /**
   * Commits the reviewed units, lessons, and questions to Dexie
   * and archives the original PDF file locally
   */
  async commitImport(payload: CommitImportPayload): Promise<CommitImportResult> {
    const {
      jobId,
      subjectId,
      units,
      generalLessons,
      questions,
      originalFileBlob,
      originalFileName,
      importType,
    } = payload

    let createdUnitsCount = 0
    let createdLessonsCount = 0
    let createdQuestionsCount = 0
    let unverifiedQuestionsCount = 0

    // 1. Archive the original PDF file locally in documents table for reference/reprocessing
    const docCategory =
      importType === 'question_bank' || importType === 'exam' ? 'exam' : 'lecture'
    const originalFile = new File([originalFileBlob], originalFileName, {
      type: originalFileBlob.type || 'application/pdf',
    })
    const archivedDoc = await documentService.create({
      subjectId,
      file: originalFile,
      category: docCategory,
      customName: originalFileName.replace(/\.pdf$/i, ''),
      allowDuplicate: true,
    })

    // Map temp unit IDs to real DB unit IDs
    const unitIdMap = new Map<string, string>()

    // 2. Save Units & their Lessons
    for (const u of units) {
      const createdUnit = await unitService.create({
        subjectId,
        name: u.name,
        description: u.description,
        order: u.order,
      })
      unitIdMap.set(u.tempId, createdUnit.id)
      createdUnitsCount++

      for (const l of u.lessons) {
        await lessonService.create({
          subjectId,
          unitId: createdUnit.id,
          title: l.title,
          content: l.content,
          summary: l.summary,
          keyTerms: l.keyTerms,
          sourceDocumentId: archivedDoc.id,
          sourcePages: l.sourcePages,
          order: l.order,
        })
        createdLessonsCount++
      }
    }

    // 3. Save general lessons (lessons not assigned to a specific unit)
    for (const gl of generalLessons) {
      await lessonService.create({
        subjectId,
        title: gl.title,
        content: gl.content,
        summary: gl.summary,
        keyTerms: gl.keyTerms,
        sourceDocumentId: archivedDoc.id,
        sourcePages: gl.sourcePages,
        order: gl.order,
      })
      createdLessonsCount++
    }

    // 4. Save selected questions
    const selectedQuestions = questions.filter((q) => q.selected)
    for (const q of selectedQuestions) {
      const realUnitId = q.unitTempId ? unitIdMap.get(q.unitTempId) : undefined

      const savedQ = await questionService.create({
        subjectId,
        unitId: realUnitId,
        type: q.type,
        text: q.text,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        sourceType: 'pdf_extract',
        sourceDocumentId: archivedDoc.id,
        sourceReference: q.sourceReference,
        sourcePage: q.sourcePage,
        verificationStatus: q.verificationStatus,
        userReviewed: q.userReviewed,
      })

      createdQuestionsCount++
      if (savedQ.verificationStatus === 'needs_review') {
        unverifiedQuestionsCount++
      }
    }

    // 5. Update Job record
    await this.updateJob(jobId, {
      status: 'completed',
      progress: 100,
      documentId: archivedDoc.id,
      extractedUnitsCount: createdUnitsCount,
      extractedLessonsCount: createdLessonsCount,
      extractedQuestionsCount: createdQuestionsCount,
      unverifiedQuestionsCount,
      completedAt: Date.now(),
    })

    return {
      createdUnitsCount,
      createdLessonsCount,
      createdQuestionsCount,
      unverifiedQuestionsCount,
      archivedDocumentId: archivedDoc.id,
    }
  },
}
