import Dexie, { type Table } from 'dexie'
import type {
  Subject,
  Unit,
  Lesson,
  Document,
  Question,
  Exam,
  ExamAttempt,
  StudyProgress,
  ImportJob,
  AppSettings,
} from '../types'

export class UniStudyDB extends Dexie {
  subjects!: Table<Subject, string>
  units!: Table<Unit, string>
  lessons!: Table<Lesson, string>
  documents!: Table<Document, string>
  questions!: Table<Question, string>
  exams!: Table<Exam, string>
  examAttempts!: Table<ExamAttempt, string>
  studyProgress!: Table<StudyProgress, string>
  importJobs!: Table<ImportJob, string>
  settings!: Table<AppSettings, string>

  constructor() {
    super('UniStudyDB')

    // Schema version 1
    this.version(1).stores({
      subjects: 'id, name, semester, createdAt, updatedAt',
      units: 'id, subjectId, order, createdAt',
      documents: 'id, subjectId, unitId, category, name, createdAt, updatedAt',
      questions: 'id, subjectId, unitId, type, difficulty, createdAt',
      exams: 'id, subjectId, createdAt',
      examAttempts: 'id, examId, subjectId, startedAt, status',
      studyProgress: 'id, subjectId, unitId, status, lastStudiedAt',
      settings: 'id',
    })

    // Schema version 2: Curriculum Lessons, Import Jobs, and Question Verification
    this.version(2)
      .stores({
        subjects: 'id, name, semester, createdAt, updatedAt',
        units: 'id, subjectId, order, createdAt',
        lessons: 'id, subjectId, unitId, order, createdAt',
        documents: 'id, subjectId, unitId, category, name, createdAt, updatedAt',
        questions:
          'id, subjectId, unitId, lessonId, type, difficulty, verificationStatus, userReviewed, createdAt',
        exams: 'id, subjectId, createdAt',
        examAttempts: 'id, examId, subjectId, startedAt, status',
        studyProgress: 'id, subjectId, unitId, status, lastStudiedAt',
        importJobs: 'id, subjectId, status, createdAt',
        settings: 'id',
      })
      .upgrade((tx) => {
        return tx
          .table('questions')
          .toCollection()
          .modify((q: any) => {
            if (!q.verificationStatus) {
              q.verificationStatus = q.verified
                ? 'verified'
                : q.correctAnswer
                  ? 'verified'
                  : 'needs_review'
            }
            if (q.userReviewed === undefined) {
              q.userReviewed = Boolean(q.verified)
            }
          })
      })
  }
}

export const db = new UniStudyDB()
