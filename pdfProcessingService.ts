import type {
  KeyTerm,
  QuestionType,
  QuestionDifficulty,
  VerificationStatus,
  ImportContentType,
} from '../types'
import { extractTextFromPdf } from '../utils/pdfTextExtractor'

export interface ExtractedUnitDraft {
  tempId: string
  name: string
  order: number
  description?: string
  lessons: ExtractedLessonDraft[]
}

export interface ExtractedLessonDraft {
  tempId: string
  title: string
  content: string
  summary: string
  keyTerms: KeyTerm[]
  sourcePages: number[]
  order: number
}

export interface ExtractedQuestionDraftItem {
  tempId: string
  type: QuestionType
  text: string
  options?: string[]
  correctAnswer: string | boolean
  explanation?: string
  difficulty: QuestionDifficulty
  verificationStatus: VerificationStatus
  userReviewed: boolean
  sourceReference?: string
  sourcePage?: number
  selected: boolean
  unitTempId?: string
  lessonTempId?: string
  reviewReason?: string
}

export interface PdfProcessingResult {
  success: boolean
  isScanned: boolean
  ocrNeeded: boolean
  errorMessage?: string
  warningMessage?: string
  pageCount: number
  totalCharacters: number
  rawText: string
  pages: { pageNumber: number; text: string; charCount: number; isComplex?: boolean }[]
  units: ExtractedUnitDraft[]
  generalLessons: ExtractedLessonDraft[]
  questions: ExtractedQuestionDraftItem[]
  stats: {
    unitsCount: number
    lessonsCount: number
    questionsCount: number
    verifiedQuestionsCount: number
    unverifiedQuestionsCount: number
  }
}

/**
 * Normalizes Arabic string for pattern matching while preserving original formatting
 */
function normalizeArabicText(text: string): string {
  return text
    .replace(/[إأآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '') // remove tashkeel
    .trim()
}

export const pdfProcessingService = {
  /**
   * Primary processing pipeline for PDF:
   * 1. Extract text page by page with PDF.js
   * 2. Inspect text quality and detect scanned/image-only pages
   * 3. Segment into curriculum units, lessons, summaries, terms
   * 4. Extract questions with strict verification rules
   */
  async processPdf(
    blob: Blob,
    fileName: string,
    importType: ImportContentType = 'hybrid',
    onProgress?: (stage: string, percent: number) => void
  ): Promise<PdfProcessingResult> {
    onProgress?.('قراءة ملف PDF واستخراج الطبقة النصية...', 15)

    let extraction
    try {
      extraction = await extractTextFromPdf(blob)
    } catch (err: any) {
      return {
        success: false,
        isScanned: false,
        ocrNeeded: true,
        errorMessage: `تعذر قراءة ملف PDF: ${err.message || 'الملف تالف أو غير مدعوم'}`,
        pageCount: 0,
        totalCharacters: 0,
        rawText: '',
        pages: [],
        units: [],
        generalLessons: [],
        questions: [],
        stats: {
          unitsCount: 0,
          lessonsCount: 0,
          questionsCount: 0,
          verifiedQuestionsCount: 0,
          unverifiedQuestionsCount: 0,
        },
      }
    }

    const { pages, pageCount, text: rawText } = extraction

    // Evaluate text quality & detect scanned/image-only PDFs
    const totalChars = rawText.replace(/\s/g, '').length
    const avgCharsPerPage = pageCount > 0 ? totalChars / pageCount : 0

    // Scanned document detection:
    // If average non-space characters per page is less than 35, or empty, it is a scanned image PDF
    const isScanned = pageCount > 0 && avgCharsPerPage < 35

    if (isScanned) {
      return {
        success: false,
        isScanned: true,
        ocrNeeded: true,
        errorMessage:
          'الملف عبارة عن صفحات مصورة ولا يحتوي على طبقة نصية رقمية يمكن استخراجها مباشرة. يتطلب هذا الملف تقنية التعرف الضوئي على الحروف (OCR) لتحويل الصور إلى نصوص.',
        pageCount,
        totalCharacters: totalChars,
        rawText,
        pages: pages.map((p) => ({
          pageNumber: p.pageNumber,
          text: p.text,
          charCount: p.text.length,
        })),
        units: [],
        generalLessons: [],
        questions: [],
        stats: {
          unitsCount: 0,
          lessonsCount: 0,
          questionsCount: 0,
          verifiedQuestionsCount: 0,
          unverifiedQuestionsCount: 0,
        },
      }
    }

    onProgress?.('فحص بنية المستند والفقرات والعناوين...', 40)

    // Analyze complexity per page (tables, formulas, symbols)
    const analyzedPages = pages.map((p) => {
      const hasTableIndicators = /\||-{3,}|\t/.test(p.text)
      const hasMathSymbols = /[∑∫√≠≈≤≥∞±]/.test(p.text)
      return {
        pageNumber: p.pageNumber,
        text: p.text,
        charCount: p.text.length,
        isComplex: hasTableIndicators || hasMathSymbols,
      }
    })

    onProgress?.('استخراج المنهج والوحدات والدروس والمفاهيم...', 65)

    // 1. Structure Curriculum (Units, Lessons, Summaries, Key Terms)
    const { units, generalLessons } =
      importType === 'question_bank'
        ? { units: [], generalLessons: [] }
        : this.extractCurriculumStructure(rawText, analyzedPages, fileName)

    onProgress?.('استخراج بنك الأسئلة ومفاتيح الحلول والتحقق من الإجابات...', 85)

    // 2. Extract Questions with Strict Verification Rules
    const questions =
      importType === 'lecture'
        ? []
        : this.extractQuestionsWithVerification(rawText, analyzedPages, fileName, units)

    const verifiedCount = questions.filter((q) => q.verificationStatus === 'verified').length
    const unverifiedCount = questions.filter((q) => q.verificationStatus === 'needs_review').length

    onProgress?.('اكتملت المعالجة بنجاح!', 100)

    return {
      success: true,
      isScanned: false,
      ocrNeeded: false,
      pageCount,
      totalCharacters: totalChars,
      rawText,
      pages: analyzedPages,
      units,
      generalLessons,
      questions,
      stats: {
        unitsCount: units.length,
        lessonsCount: units.reduce((acc, u) => acc + u.lessons.length, 0) + generalLessons.length,
        questionsCount: questions.length,
        verifiedQuestionsCount: verifiedCount,
        unverifiedQuestionsCount: unverifiedCount,
      },
    }
  },

  /**
   * Heuristic Curriculum extractor that detects units/chapters, lessons, summaries, and key terms
   */
  extractCurriculumStructure(
    rawText: string,
    pages: { pageNumber: number; text: string }[],
    fileName: string
  ): { units: ExtractedUnitDraft[]; generalLessons: ExtractedLessonDraft[] } {
    const units: ExtractedUnitDraft[] = []
    const generalLessons: ExtractedLessonDraft[] = []

    // Look for unit headers: "الوحدة الأولى", "الفصل الأول", "الباب الأول", "Unit 1", "Chapter 1"
    const unitRegex = /(?:^|\n)\s*(?:(?:الوحدة|الفصل|الباب)\s+(?:ال(?:أول|ثاني|ثالث|رابع|خامس|سادس|سابع|ثامن|تاسع|عاشر)|\d+)[:.-]?|(?:Unit|Chapter)\s*\d+[:.-]?)\s*([^\n]+)/gi

    // Split text by unit headers
    const unitMatches: { title: string; index: number }[] = []
    let match: RegExpExecArray | null

    while ((match = unitRegex.exec(rawText)) !== null) {
      unitMatches.push({
        title: match[0].trim(),
        index: match.index,
      })
    }

    if (unitMatches.length > 0) {
      for (let i = 0; i < unitMatches.length; i++) {
        const current = unitMatches[i]
        const nextIndex = i + 1 < unitMatches.length ? unitMatches[i + 1].index : rawText.length
        const unitBlock = rawText.slice(current.index, nextIndex)

        const unitTempId = `unit_draft_${i + 1}`
        const lessons = this.extractLessonsFromBlock(unitBlock, pages, current.index)

        units.push({
          tempId: unitTempId,
          name: current.title.replace(/\n/g, ' ').slice(0, 80),
          order: i + 1,
          lessons,
        })
      }
    } else {
      // If no explicit unit markers, extract lessons as general topics of the document
      const lessons = this.extractLessonsFromBlock(rawText, pages, 0)
      if (lessons.length > 0) {
        generalLessons.push(...lessons)
      } else {
        // Fallback: single structured lesson representing the whole lecture
        const terms = this.extractKeyTerms(rawText)
        const summary = this.extractSummary(rawText)
        generalLessons.push({
          tempId: `lesson_draft_1`,
          title: fileName.replace(/\.pdf$/i, ''),
          content: rawText.slice(0, 15000),
          summary: summary || 'ملخص عام مستخرج من محتوى الملف.',
          keyTerms: terms,
          sourcePages: pages.slice(0, 5).map((p) => p.pageNumber),
          order: 1,
        })
      }
    }

    return { units, generalLessons }
  },

  /**
   * Breaks down a text block into topics / lessons with summaries and key terms
   */
  extractLessonsFromBlock(
    blockText: string,
    pages: { pageNumber: number; text: string }[],
    offsetInRaw: number
  ): ExtractedLessonDraft[] {
    const lessons: ExtractedLessonDraft[] = []

    // Matches: "الدرس الأول:", "المبحث الأول:", "المحاضرة (1):", "الموضوع:", "أولاً:", "ثانياً:"
    const lessonRegex = /(?:^|\n)\s*(?:(?:الدرس|المبحث|المحاضرة)\s+(?:ال(?:أول|ثاني|ثالث|رابع|خامس|سادس|سابع|ثامن|تاسع|عاشر)|\d+)|(?:أولاً|ثانياً|ثالثاً|رابعاً|خامساً)|(?:Topic|Lesson)\s*\d+)[:.-]?\s*([^\n]+)/gi

    const matches: { title: string; index: number }[] = []
    let m: RegExpExecArray | null

    while ((m = lessonRegex.exec(blockText)) !== null) {
      matches.push({
        title: m[0].trim(),
        index: m.index,
      })
    }

    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const cur = matches[i]
        const nxt = i + 1 < matches.length ? matches[i + 1].index : blockText.length
        const content = blockText.slice(cur.index, nxt).trim()

        const keyTerms = this.extractKeyTerms(content)
        const summary = this.extractSummary(content)

        lessons.push({
          tempId: `lesson_sub_${Date.now()}_${i}`,
          title: cur.title.replace(/\n/g, ' ').slice(0, 70),
          content: content.slice(0, 20000),
          summary: summary || '',
          keyTerms,
          sourcePages: this.findSourcePages(offsetInRaw + cur.index, pages),
          order: i + 1,
        })
      }
    } else {
      // Split by major double-linebreak sections if large
      const paragraphs = blockText.split(/\n\s*\n/)
      if (paragraphs.length >= 3) {
        const firstP = paragraphs[0].trim().slice(0, 70)
        lessons.push({
          tempId: `lesson_auto_${Date.now()}`,
          title: firstP.length > 5 ? firstP : 'موضوع رئيسي',
          content: blockText.slice(0, 20000),
          summary: this.extractSummary(blockText),
          keyTerms: this.extractKeyTerms(blockText),
          sourcePages: this.findSourcePages(offsetInRaw, pages),
          order: 1,
        })
      }
    }

    return lessons
  },

  /**
   * Finds the page number(s) where a character offset appears
   */
  findSourcePages(offset: number, pages: { pageNumber: number; text: string }[]): number[] {
    let currentLength = 0
    for (const p of pages) {
      currentLength += p.text.length + 20
      if (currentLength >= offset) {
        return [p.pageNumber]
      }
    }
    return pages.length > 0 ? [pages[0].pageNumber] : [1]
  },

  /**
   * Extracts key terms and definitions
   * Matches patterns like:
   * "التعريف: هو ...", "يقصد بـ [المصطلح]: ...", "[المصطلح]: يعرف بأنه ..."
   */
  extractKeyTerms(text: string): KeyTerm[] {
    const terms: KeyTerm[] = []
    const defRegex = /(?:يقصد\s+ب[ـ\s]*|المقصود\s+ب[ـ\s]*|تعريف\s+)?([^\n:،]{3,35})\s*[:=]\s*(?:هو|هي|عبارة\s+عن|يُعرف\s+بأنه|تُعرف\s+بأنها)?\s*([^\n.]{15,200}[.،\n])/g

    let m: RegExpExecArray | null
    let count = 0
    while ((m = defRegex.exec(text)) !== null && count < 8) {
      const term = m[1].replace(/^(?:أولاً|ثانياً|ثالثاً|ملاحظة|تعريف|مفهوم)\s*[:.-]?/i, '').trim()
      const definition = m[2].trim()

      // Ignore section headers
      if (/^(?:الدرس|المبحث|المحاضرة|الفصل|الوحدة|الباب|سؤال|س\d|س\s*\d)/i.test(term)) {
        continue
      }

      if (term.length >= 3 && term.length <= 35 && definition.length >= 15) {
        // avoid duplicates
        if (!terms.some((t) => t.term === term)) {
          terms.push({ term, definition })
          count++
        }
      }
    }

    return terms
  },

  /**
   * Extracts summary/conclusion sections
   */
  extractSummary(text: string): string {
    const summaryRegex = /(?:الخلاصة|الملخص|ملخص\s+المحاضرة|موجز|Summary)[:\s]+([^\n]+(?:\n[^\n]+){0,5})/i
    const match = text.match(summaryRegex)
    if (match) {
      return match[1].trim()
    }
    return ''
  },

  /**
   * Extracts Questions with strict rules regarding verification:
   * 1. Extract MCQs & True/False
   * 2. Look for explicit in-line answers and separate answer keys
   * 3. IF NO VERIFIED ANSWER IS FOUND:
   *    -> DO NOT invent an answer!
   *    -> Set verificationStatus = 'needs_review'
   *    -> Set correctAnswer = ''
   *    -> userReviewed = false
   */
  extractQuestionsWithVerification(
    rawText: string,
    pages: { pageNumber: number; text: string }[],
    fileName: string,
    units: ExtractedUnitDraft[]
  ): ExtractedQuestionDraftItem[] {
    const questions: ExtractedQuestionDraftItem[] = []

    // 1. Check for separate Answer Key block (نموذج الإجابة / مفتاح الحل / Answer Key)
    const answerKeyMap = new Map<number, string | boolean>()
    const answerKeyRegex = /(?:نموذج\s+الإجابة|مفتاح\s+الحل|الإجابات\s+النموذجية|Answer\s*Key)[:\s]+([\s\S]+)$/i
    const keyMatch = rawText.match(answerKeyRegex)

    let contentToScan = rawText
    if (keyMatch) {
      const keySection = keyMatch[1]
      contentToScan = rawText.slice(0, keyMatch.index)

      const keyItemRegex = /(\d+)[\s.:)-]+([أ-يA-Da-d]|صح|خطأ|true|false|ص|خ)/gi
      let km: RegExpExecArray | null
      while ((km = keyItemRegex.exec(keySection)) !== null) {
        const qNum = parseInt(km[1], 10)
        const ansRaw = km[2].trim()
        const norm = normalizeArabicText(ansRaw).toLowerCase()

        if (norm === 'صح' || norm === 'ص' || norm === 'true') {
          answerKeyMap.set(qNum, true)
        } else if (norm === 'خطا' || norm === 'خ' || norm === 'false') {
          answerKeyMap.set(qNum, false)
        } else {
          answerKeyMap.set(qNum, ansRaw)
        }
      }
    }

    // 2. Split into candidate question blocks
    const qSplitter = /(?:^|\n)\s*(?:(?:س|سؤال|Question|Q)\s*(\d+)[:.-]|\(?(\d+)\)[.:-]?|(\d+)[\.-])\s+/gm
    const blocks: { number: number; text: string; rawIndex: number }[] = []
    let m: RegExpExecArray | null
    let lastIndex = 0

    while ((m = qSplitter.exec(contentToScan)) !== null) {
      if (blocks.length > 0) {
        blocks[blocks.length - 1].text = contentToScan.slice(lastIndex, m.index).trim()
      }
      const num = parseInt(m[1] || m[2] || m[3] || String(blocks.length + 1), 10)
      lastIndex = m.index + m[0].length
      blocks.push({ number: num, text: '', rawIndex: m.index })
    }

    if (blocks.length > 0 && lastIndex < contentToScan.length) {
      blocks[blocks.length - 1].text = contentToScan.slice(lastIndex).trim()
    }

    // Fallback: If no numbering, split by question marks
    if (blocks.length === 0) {
      const chunks = contentToScan.split(/\n\s*\n/)
      chunks.forEach((chunk, idx) => {
        if (chunk.includes('؟') || chunk.includes('?') || chunk.includes('أ)') || chunk.includes('A)')) {
          blocks.push({ number: idx + 1, text: chunk.trim(), rawIndex: 0 })
        }
      })
    }

    // 3. Process each block
    blocks.forEach((block, idx) => {
      const bText = block.text
      if (!bText || bText.length < 6) return

      // Find options: أ) ب) ج) د) or A) B) C) D) or 1) 2) 3) 4)
      const optRegex = /(?:^|\n)\s*(?:[\(]?([أ-دA-Da-d1-4])[\).:-])\s*([^\n]+)/g
      const foundOptions: { label: string; text: string }[] = []
      let om: RegExpExecArray | null
      let firstOptIdx = -1

      while ((om = optRegex.exec(bText)) !== null) {
        if (firstOptIdx === -1) firstOptIdx = om.index
        foundOptions.push({
          label: om[1],
          text: om[2].trim(),
        })
      }

      // Check for in-line answer: "الإجابة: ب", "الجواب الصحيح: صح"
      const inLineRegex = /(?:الإجابة|الجواب|الحل|الإجابة\s*الصحيحة|Answer)[:\s]+([^\n]+)/i
      const inLineMatch = bText.match(inLineRegex)

      let hasExplicitAnswer = false
      let detectedAnswer: string | boolean = ''
      let explanation = ''
      let reviewReason: string | undefined = undefined

      if (inLineMatch) {
        hasExplicitAnswer = true
        const rawAns = inLineMatch[1].trim()
        const norm = normalizeArabicText(rawAns).toLowerCase()

        if (norm.includes('صح') || norm === 'true' || norm === 'ص') {
          detectedAnswer = true
        } else if (norm.includes('خطا') || norm === 'false' || norm === 'خ') {
          detectedAnswer = false
        } else {
          // match with option label or text
          const matched = foundOptions.find(
            (o) =>
              normalizeArabicText(o.label).toLowerCase() === norm ||
              normalizeArabicText(o.text).toLowerCase().includes(norm) ||
              norm.includes(normalizeArabicText(o.label).toLowerCase())
          )
          detectedAnswer = matched ? matched.text : rawAns
        }
      } else if (answerKeyMap.has(block.number)) {
        hasExplicitAnswer = true
        const keyVal = answerKeyMap.get(block.number)!
        if (typeof keyVal === 'boolean') {
          detectedAnswer = keyVal
        } else {
          const matched = foundOptions.find(
            (o) => normalizeArabicText(o.label).toLowerCase() === normalizeArabicText(keyVal).toLowerCase()
          )
          detectedAnswer = matched ? matched.text : keyVal
        }
      }

      // Detect question type
      const isTrueFalse =
        foundOptions.length === 0 &&
        (bText.includes('صح أم خطأ') ||
          bText.includes('صح أو خطأ') ||
          bText.includes('(صح / خطأ)') ||
          bText.includes('صح') ||
          bText.includes('خطأ') ||
          typeof detectedAnswer === 'boolean')

      // Cut prompt before options or answer line
      let prompt = bText
      if (firstOptIdx !== -1) {
        prompt = bText.slice(0, firstOptIdx).trim()
      } else if (inLineMatch) {
        prompt = bText.slice(0, inLineMatch.index).trim()
      }

      // Remove leading question numbers
      prompt = prompt.replace(/^(?:س|سؤال|Q|Question)?\s*\d+[\s.:)-]*/i, '').trim()
      if (!prompt) return

      // Source page
      const pageNum = this.findSourcePages(block.rawIndex, pages)[0]

      if (foundOptions.length >= 2) {
        const optionTexts = foundOptions.map((o) => o.text)
        let finalAnswer = typeof detectedAnswer === 'string' ? detectedAnswer : ''

        // STRICT POLICY: If no verified answer was explicitly present in source, DO NOT GUESS!
        let verificationStatus: VerificationStatus = 'verified'
        if (!hasExplicitAnswer || !optionTexts.includes(finalAnswer)) {
          verificationStatus = 'needs_review'
          finalAnswer = '' // Blank - requires user verification
          reviewReason = 'لم تُذكر الإجابة النموذجية صراحة في المستند، يلزم مراجعتها وتحديدها قبل التصحيح.'
        }

        questions.push({
          tempId: `draft_q_${Date.now()}_${idx}`,
          type: 'multiple_choice',
          text: prompt,
          options: optionTexts,
          correctAnswer: finalAnswer,
          explanation,
          difficulty: 'medium',
          verificationStatus,
          userReviewed: verificationStatus === 'verified',
          reviewReason,
          sourceReference: `${fileName} (سؤال ${block.number})`,
          sourcePage: pageNum,
          selected: true,
        })
      } else if (isTrueFalse || typeof detectedAnswer === 'boolean') {
        let verificationStatus: VerificationStatus = 'verified'
        let finalBool: boolean = true

        if (!hasExplicitAnswer) {
          verificationStatus = 'needs_review'
          finalBool = true // temporary placeholder, flagged as needs review
          reviewReason = 'سؤال صح وخطأ غير محدد الإجابة في النص الأصلي؛ بحاجة لاعتماد الإجابة.'
        } else {
          finalBool = Boolean(detectedAnswer)
        }

        questions.push({
          tempId: `draft_q_${Date.now()}_${idx}`,
          type: 'true_false',
          text: prompt,
          correctAnswer: finalBool,
          explanation,
          difficulty: 'easy',
          verificationStatus,
          userReviewed: verificationStatus === 'verified',
          reviewReason,
          sourceReference: `${fileName} (سؤال ${block.number})`,
          sourcePage: pageNum,
          selected: true,
        })
      }
    })

    return questions
  },
}
