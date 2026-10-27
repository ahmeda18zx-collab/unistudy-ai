import JSZip from 'jszip'
import { db } from '../db/db'
import type {
  Subject,
  Unit,
  Document,
  Question,
  Exam,
  ExamAttempt,
  StudyProgress,
  AppSettings,
} from '../types'

export const BACKUP_SCHEMA_VERSION = 1
export const BACKUP_APP_ID = 'UniStudy-AI'

export interface BackupManifest {
  app: string
  version: number
  exportedAt: number
  appName: string
  counts: {
    subjects: number
    units: number
    documents: number
    questions: number
    exams: number
  }
}

export interface BackupInspectionResult {
  valid: boolean
  error?: string
  manifest?: BackupManifest
  hasFiles: boolean
  subjectsPreview: { id: string; name: string }[]
}

export interface ImportReport {
  success: boolean
  mode: 'replace' | 'merge'
  importedSubjects: number
  importedUnits: number
  importedDocuments: number
  importedQuestions: number
  importedExams: number
  warnings: string[]
}

export const backupService = {
  /**
   * Export all database records and binary PDF files into a single zip archive
   */
  async exportFullBackup(): Promise<void> {
    const zip = new JSZip()

    // 1. Fetch all records
    const [
      subjects,
      units,
      documents,
      questions,
      exams,
      examAttempts,
      studyProgress,
      settings,
      lessons,
    ] = await Promise.all([
      db.subjects.toArray(),
      db.units.toArray(),
      db.documents.toArray(),
      db.questions.toArray(),
      db.exams.toArray(),
      db.examAttempts.toArray(),
      db.studyProgress.toArray(),
      db.settings.toArray(),
      db.lessons.toArray(),
    ])

    const now = Date.now()

    // 2. Separate documents metadata from binary blobs to avoid massive JSON bloat
    const documentsMetadata = documents.map((doc) => ({
      id: doc.id,
      subjectId: doc.subjectId,
      unitId: doc.unitId,
      name: doc.name,
      originalFileName: doc.originalFileName,
      category: doc.category,
      mimeType: doc.mimeType,
      size: doc.size,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      filePathInZip: `files/${doc.id}.pdf`,
    }))

    // 3. Manifest
    const manifest: BackupManifest = {
      app: BACKUP_APP_ID,
      version: BACKUP_SCHEMA_VERSION,
      exportedAt: now,
      appName: 'UniStudy AI',
      counts: {
        subjects: subjects.length,
        units: units.length,
        documents: documents.length,
        questions: questions.length,
        exams: exams.length,
      },
    }

    const dataPayload = {
      manifest,
      subjects,
      units,
      documents: documentsMetadata,
      questions,
      exams,
      examAttempts,
      studyProgress,
      settings,
      lessons,
    }

    zip.file('manifest.json', JSON.stringify(manifest, null, 2))
    zip.file('data.json', JSON.stringify(dataPayload, null, 2))

    // 4. Add binary PDF files to `files/` folder
    const filesFolder = zip.folder('files')
    if (filesFolder) {
      for (const doc of documents) {
        if (doc.blob) {
          filesFolder.file(`${doc.id}.pdf`, doc.blob)
        }
      }
    }

    // 5. Generate zip archive
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    // 6. Trigger download
    const dateStr = new Date(now).toISOString().split('T')[0]
    const fileName = `unistudy-backup-${dateStr}.unistudy.zip`

    const url = URL.createObjectURL(zipBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  },

  /**
   * Validate and inspect backup file before applying
   */
  async inspectBackup(file: File): Promise<BackupInspectionResult> {
    try {
      const zip = await JSZip.loadAsync(file)

      // Check manifest
      const manifestFile = zip.file('manifest.json')
      const dataFile = zip.file('data.json')

      if (!manifestFile || !dataFile) {
        return {
          valid: false,
          error: 'الملف المحدد ليس نسخة احتياطية صالحة من UniStudy AI (مفقود manifest.json أو data.json).',
          hasFiles: false,
          subjectsPreview: [],
        }
      }

      const manifestText = await manifestFile.async('text')
      const manifest: BackupManifest = JSON.parse(manifestText)

      if (manifest.app !== BACKUP_APP_ID) {
        return {
          valid: false,
          error: 'هذا الملف غير تابع لمنصة UniStudy AI.',
          hasFiles: false,
          subjectsPreview: [],
        }
      }

      if (manifest.version > BACKUP_SCHEMA_VERSION) {
        return {
          valid: false,
          error: `تم إنشاء هذه النسخة الاحتياطية بإصدار أحدث (${manifest.version}) غير متوافق مع هذا التطبيق (${BACKUP_SCHEMA_VERSION}).`,
          hasFiles: false,
          subjectsPreview: [],
        }
      }

      const dataText = await dataFile.async('text')
      const data = JSON.parse(dataText)

      const filesFolder = zip.folder('files')
      const hasFiles = Boolean(filesFolder && Object.keys(filesFolder.files).length > 0)

      const subjectsPreview = Array.isArray(data.subjects)
        ? data.subjects.slice(0, 5).map((s: any) => ({ id: s.id, name: s.name }))
        : []

      return {
        valid: true,
        manifest,
        hasFiles,
        subjectsPreview,
      }
    } catch (err: any) {
      return {
        valid: false,
        error: `تعذر قراءة ملف النسخة الاحتياطية: ${err.message || 'الملف تالف'}`,
        hasFiles: false,
        subjectsPreview: [],
      }
    }
  },

  /**
   * Apply import into Dexie database
   */
  async importBackup(file: File, mode: 'replace' | 'merge'): Promise<ImportReport> {
    const zip = await JSZip.loadAsync(file)
    const dataFile = zip.file('data.json')
    if (!dataFile) {
      throw new Error('ملف البيانات data.json غير موجود في الحزمة')
    }

    const dataText = await dataFile.async('text')
    const data = JSON.parse(dataText)

    const warnings: string[] = []
    const importedSubjects: Subject[] = Array.isArray(data.subjects) ? data.subjects : []
    const importedUnits: Unit[] = Array.isArray(data.units) ? data.units : []
    const rawDocuments: any[] = Array.isArray(data.documents) ? data.documents : []
    const importedQuestions: Question[] = Array.isArray(data.questions) ? data.questions : []
    const importedExams: Exam[] = Array.isArray(data.exams) ? data.exams : []

    // Read binary files and rebuild Document objects
    const restoredDocuments: Document[] = []
    for (const rawDoc of rawDocuments) {
      let fileBlob: Blob | null = null

      const zipFilePath = rawDoc.filePathInZip || `files/${rawDoc.id}.pdf`
      const zippedFile = zip.file(zipFilePath)

      if (zippedFile) {
        const arrayBuffer = await zippedFile.async('arraybuffer')
        fileBlob = new Blob([arrayBuffer], { type: rawDoc.mimeType || 'application/pdf' })
      } else {
        warnings.push(`الملف الثنائي للمستند "${rawDoc.name}" غير متوفر في النسخة.`)
      }

      if (fileBlob) {
        restoredDocuments.push({
          id: rawDoc.id,
          subjectId: rawDoc.subjectId,
          unitId: rawDoc.unitId,
          name: rawDoc.name,
          originalFileName: rawDoc.originalFileName,
          category: rawDoc.category || 'other',
          mimeType: rawDoc.mimeType || 'application/pdf',
          size: rawDoc.size || fileBlob.size,
          blob: fileBlob,
          createdAt: rawDoc.createdAt || Date.now(),
          updatedAt: rawDoc.updatedAt || Date.now(),
        })
      }
    }

    // Validate everything BEFORE touching existing data (replace mode wipes tables)
    const subjectIds = new Set(importedSubjects.map((x) => x.id))
    if (importedSubjects.some((x) => !x || !x.id)) {
      throw new Error('النسخة الاحتياطية تحتوي على مواد بدون معرّف. لم يتم تغيير أي بيانات.')
    }
    const orphanDocs = restoredDocuments.filter((d) => !subjectIds.has(d.subjectId))
    if (mode === 'replace' && orphanDocs.length > 0) {
      throw new Error('بعض الملفات مرتبطة بمواد غير موجودة في النسخة. لم يتم تغيير أي بيانات.')
    }
    for (const d of restoredDocuments) {
      const head = new TextDecoder('ascii').decode(new Uint8Array(await d.blob.slice(0, 1024).arrayBuffer()))
      if (!head.includes('%PDF-')) {
        throw new Error(`الملف \"${d.name}\" داخل النسخة تالف. لم يتم تغيير أي بيانات.`)
      }
    }

    await db.transaction(
      'rw',
      [
        db.subjects,
        db.units,
        db.documents,
        db.questions,
        db.exams,
        db.examAttempts,
        db.studyProgress,
        db.settings,
        db.lessons,
      ],
      async () => {
        if (mode === 'replace') {
          // Clear existing database
          await Promise.all([
            db.subjects.clear(),
            db.units.clear(),
            db.documents.clear(),
            db.questions.clear(),
            db.exams.clear(),
            db.examAttempts.clear(),
            db.studyProgress.clear(),
            db.lessons.clear(),
          ])
        }

        // Put / upsert items
        if (importedSubjects.length > 0) {
          await db.subjects.bulkPut(importedSubjects)
        }
        if (importedUnits.length > 0) {
          await db.units.bulkPut(importedUnits)
        }
        if (restoredDocuments.length > 0) {
          await db.documents.bulkPut(restoredDocuments)
        }
        if (Array.isArray(data.lessons) && data.lessons.length > 0) {
          await db.lessons.bulkPut(data.lessons)
        }
        if (importedQuestions.length > 0) {
          await db.questions.bulkPut(importedQuestions)
        }
        if (importedExams.length > 0) {
          await db.exams.bulkPut(importedExams)
        }
        if (Array.isArray(data.examAttempts) && data.examAttempts.length > 0) {
          await db.examAttempts.bulkPut(data.examAttempts)
        }
        if (Array.isArray(data.studyProgress) && data.studyProgress.length > 0) {
          await db.studyProgress.bulkPut(data.studyProgress)
        }
        if (Array.isArray(data.settings) && data.settings.length > 0) {
          await db.settings.bulkPut(data.settings)
        }
      }
    )

    return {
      success: true,
      mode,
      importedSubjects: importedSubjects.length,
      importedUnits: importedUnits.length,
      importedDocuments: restoredDocuments.length,
      importedQuestions: importedQuestions.length,
      importedExams: importedExams.length,
      warnings,
    }
  },
}
