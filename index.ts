export type DocumentCategory = 'lecture' | 'notes' | 'summary' | 'exam' | 'other'

export interface Subject {
  id: string
  name: string
  description?: string
  semester?: string
  code?: string
  createdAt: number
  updatedAt: number
}

export interface Unit {
  id: string
  subjectId: string
  name: string
  description?: string
  order: number
  createdAt: number
  updatedAt: number
}

export interface Document {
  id: string
  subjectId: string
  unitId?: string
  name: string
  originalFileName: string
  category: DocumentCategory
  mimeType: string
  size: number
  blob: Blob
  extractedText?: string
  createdAt: number
  updatedAt: number
}

export interface KeyTerm {
  term: string
  definition: string
}

export interface Lesson {
  id: string
  subjectId: string
  unitId?: string
  title: string
  content: string
  summary?: string
  keyTerms?: KeyTerm[]
  sourceDocumentId?: string
  sourcePages?: number[]
  order: number
  createdAt: number
  updatedAt: number
}

export type QuestionType = 'multiple_choice' | 'true_false'
export type QuestionDifficulty = 'easy' | 'medium' | 'hard'
export type VerificationStatus = 'verified' | 'needs_review' | 'rejected'

export interface Question {
  id: string
  subjectId: string
  unitId?: string
  lessonId?: string
  type: QuestionType
  text: string
  options?: string[]
  correctAnswer: string | boolean
  explanation?: string
  difficulty: QuestionDifficulty
  sourceType?: 'manual' | 'ai' | 'pdf_extract'
  sourceDocumentId?: string
  sourceReference?: string
  sourcePage?: number
  verified?: boolean
  verificationStatus: VerificationStatus
  userReviewed: boolean
  createdAt: number
  updatedAt: number
}

export type ImportContentType = 'lecture' | 'question_bank' | 'exam' | 'hybrid'
export type ImportJobStatus =
  | 'idle'
  | 'reading_pdf'
  | 'analyzing'
  | 'extracting'
  | 'review'
  | 'completed'
  | 'failed'

export interface ImportJob {
  id: string
  subjectId: string
  documentId?: string
  fileName: string
  importType: ImportContentType
  status: ImportJobStatus
  progress: number
  extractedUnitsCount: number
  extractedLessonsCount: number
  extractedQuestionsCount: number
  unverifiedQuestionsCount: number
  error?: string
  isScannedImage?: boolean
  createdAt: number
  completedAt?: number
}

export interface Exam {
  id: string
  title: string
  subjectId: string
  unitIds?: string[]
  questionTypes?: QuestionType[]
  questionCount: number
  durationMinutes: number
  difficulty?: 'all' | QuestionDifficulty
  shuffleQuestions: boolean
  shuffleOptions: boolean
  createdAt: number
}

export interface ExamAttempt {
  id: string
  examId: string
  subjectId: string
  startedAt: number
  submittedAt?: number
  answers: Record<string, string | boolean>
  score?: number
  totalScore?: number
  status: 'in_progress' | 'completed' | 'abandoned'
  elapsedTimeSeconds: number
  questionSnapshot: Question[]
}

export interface StudyProgress {
  id: string
  subjectId: string
  unitId?: string
  status: 'not_started' | 'in_progress' | 'completed'
  lastStudiedAt: number
  reviewCount: number
}

export interface AppSettings {
  id: string
  theme: 'light' | 'dark' | 'system'
  userName?: string
  autoSaveInterval?: number
  lastBackupAt?: number
}

export const CATEGORY_INFO: Record<
  DocumentCategory,
  { label: string; color: string; badgeClass: string }
> = {
  lecture: {
    label: 'محاضرة',
    color: 'blue',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  notes: {
    label: 'مذكرة',
    color: 'emerald',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  summary: {
    label: 'مراجعة وتلخيص',
    color: 'purple',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  },
  exam: {
    label: 'نموذج امتحان',
    color: 'amber',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  other: {
    label: 'ملف آخر',
    color: 'slate',
    badgeClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
}

export const SEMESTER_OPTIONS = [
  'الفصل الدراسي الأول',
  'الفصل الدراسي الثاني',
  'الفصل الصيفي',
  'السنة الأولى - ترم 1',
  'السنة الأولى - ترم 2',
  'السنة الثانية - ترم 1',
  'السنة الثانية - ترم 2',
  'السنة الثالثة - ترم 1',
  'السنة الثالثة - ترم 2',
  'السنة الرابعة - ترم 1',
  'السنة الرابعة - ترم 2',
  'عام / مستمر',
] as const

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 بايت'
  const k = 1024
  const sizes = ['بايت', 'كيلوبايت', 'ميجابايت', 'جيجابايت']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function formatDate(timestamp: number | string | Date): string {
  if (!timestamp) return '—'
  const date = new Date(timestamp)
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}
