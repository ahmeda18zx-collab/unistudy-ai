import type { QuestionType, QuestionDifficulty } from '../types'

export interface ExtractedQuestionDraft {
  tempId: string
  type: QuestionType
  text: string
  options?: string[]
  correctAnswer: string | boolean
  explanation?: string
  difficulty: QuestionDifficulty
  sourceReference?: string
  selected: boolean
}

/**
 * Normalizes Arabic letters for robust matching
 */
function normalizeArabic(text: string): string {
  return text
    .replace(/[إأآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '') // Remove tashkeel/diacritics
    .trim()
}

/**
 * Offline regex-based parser that scans text for question patterns and answer keys
 */
export function extractQuestionsOffline(
  rawText: string,
  sourceDocName?: string
): ExtractedQuestionDraft[] {
  const results: ExtractedQuestionDraft[] = []
  if (!rawText || !rawText.trim()) return results

  // 1. Look for separated Answer Key sections (e.g. "نموذج الإجابة", "مفتاح الحل", "Answer Key")
  const answerKeyMap = new Map<number, string | boolean>()
  const answerKeyRegex = /(?:نموذج\s+الإجابة|مفتاح\s+الحل|الإجابات\s+النموذجية|Answer\s*Key)[:\s]+([\s\S]+)$/i
  const keyMatch = rawText.match(answerKeyRegex)

  let contentToParse = rawText
  if (keyMatch) {
    const keySection = keyMatch[1]
    contentToParse = rawText.slice(0, keyMatch.index)

    // Parse keys like: "1- أ", "2: ب", "3. صح", "4) false"
    const itemRegex = /(\d+)[\s.:)-]+([أ-يA-Da-d]|صح|خطأ|true|false|ص|خ)/gi
    let km: RegExpExecArray | null
    while ((km = itemRegex.exec(keySection)) !== null) {
      const qNum = parseInt(km[1], 10)
      const ansRaw = km[2].trim()
      const normAns = normalizeArabic(ansRaw).toLowerCase()

      if (normAns === 'صح' || normAns === 'ص' || normAns === 'true') {
        answerKeyMap.set(qNum, true)
      } else if (normAns === 'خطا' || normAns === 'خ' || normAns === 'false') {
        answerKeyMap.set(qNum, false)
      } else {
        answerKeyMap.set(qNum, ansRaw)
      }
    }
  }

  // 2. Split content into candidate question blocks using question numbering
  // Matches: "س1:", "س 1 -", "1.", "1-", "1)", "(1)", "Q1:", "Question 1:"
  const questionSplitter = /(?:^|\n)\s*(?:(?:س|سؤال|Question|Q)\s*(\d+)[:.-]|\(?(\d+)\)[.:-]?|(\d+)[\.-])\s+/gm

  const blocks: { number: number; text: string }[] = []
  let match: RegExpExecArray | null
  let lastIndex = 0
  let lastNum = 0

  while ((match = questionSplitter.exec(contentToParse)) !== null) {
    if (blocks.length > 0) {
      blocks[blocks.length - 1].text = contentToParse.slice(lastIndex, match.index).trim()
    }
    const num = parseInt(match[1] || match[2] || match[3] || String(blocks.length + 1), 10)
    lastNum = num
    lastIndex = match.index + match[0].length
    blocks.push({ number: num, text: '' })
  }

  if (blocks.length > 0 && lastIndex < contentToParse.length) {
    blocks[blocks.length - 1].text = contentToParse.slice(lastIndex).trim()
  }

  // Fallback: If no numbering was found, try splitting by double linebreaks
  if (blocks.length === 0) {
    const paragraphs = contentToParse.split(/\n\s*\n/)
    paragraphs.forEach((p, idx) => {
      if (p.includes('؟') || p.includes('?') || p.includes('أ)') || p.includes('A)')) {
        blocks.push({ number: idx + 1, text: p.trim() })
      }
    })
  }

  // 3. Parse each question block
  blocks.forEach((block, bIdx) => {
    const bText = block.text
    if (!bText || bText.length < 5) return

    // Option indicators: أ) ب) ج) د) or A) B) C) D) or 1) 2) 3) 4)
    const optionRegex = /(?:^|\n)\s*(?:[\(]?([أ-دA-Da-d1-4])[\).:-])\s*([^\n]+)/g
    const foundOptions: { label: string; text: string }[] = []
    let optMatch: RegExpExecArray | null
    let firstOptIndex = -1

    while ((optMatch = optionRegex.exec(bText)) !== null) {
      if (firstOptIndex === -1) firstOptIndex = optMatch.index
      foundOptions.push({
        label: optMatch[1],
        text: optMatch[2].trim(),
      })
    }

    // In-line answer detection: "الإجابة: أ" or "الجواب الصحيح: ب" or "الحل: ج" or "Answer: A"
    const inLineAnsRegex = /(?:الإجابة|الجواب|الحل|الإجابة\s*الصحيحة|Answer)[:\s]+([^\n]+)/i
    const inLineMatch = bText.match(inLineAnsRegex)

    let detectedCorrectAnswer: string | boolean = ''
    let explanation = ''

    if (inLineMatch) {
      const rawAns = inLineMatch[1].trim()
      const normRaw = normalizeArabic(rawAns).toLowerCase()

      if (normRaw.includes('صح') || normRaw === 'true' || normRaw === 'ص') {
        detectedCorrectAnswer = true
      } else if (normRaw.includes('خطا') || normRaw === 'false' || normRaw === 'خ') {
        detectedCorrectAnswer = false
      } else {
        // Find matching option
        const matchedOpt = foundOptions.find(
          (o) =>
            normalizeArabic(o.label).toLowerCase() === normRaw ||
            normalizeArabic(o.text).toLowerCase().includes(normRaw) ||
            normRaw.includes(normalizeArabic(o.label).toLowerCase())
        )
        if (matchedOpt) {
          detectedCorrectAnswer = matchedOpt.text
        } else {
          detectedCorrectAnswer = rawAns
        }
      }
    } else if (answerKeyMap.has(block.number)) {
      const keyVal = answerKeyMap.get(block.number)!
      if (typeof keyVal === 'boolean') {
        detectedCorrectAnswer = keyVal
      } else {
        const matchedOpt = foundOptions.find(
          (o) => normalizeArabic(o.label).toLowerCase() === normalizeArabic(keyVal).toLowerCase()
        )
        detectedCorrectAnswer = matchedOpt ? matchedOpt.text : keyVal
      }
    }

    // Detect if True/False question
    const isTrueFalse =
      bText.includes('صح أم خطأ') ||
      bText.includes('صح أو خطأ') ||
      bText.includes('(صح / خطأ)') ||
      foundOptions.length === 0 && (bText.includes('صح') || bText.includes('خطأ'))

    let questionPrompt = bText
    if (firstOptIndex !== -1) {
      questionPrompt = bText.slice(0, firstOptIndex).trim()
    } else if (inLineMatch) {
      questionPrompt = bText.slice(0, inLineMatch.index).trim()
    }

    // Clean question text
    questionPrompt = questionPrompt
      .replace(/^(?:س|سؤال|Q|Question)?\s*\d+[\s.:)-]*/i, '')
      .trim()

    if (!questionPrompt) return

    if (foundOptions.length >= 2) {
      const optionTexts = foundOptions.map((o) => o.text)
      let finalAnswer = typeof detectedCorrectAnswer === 'string' ? detectedCorrectAnswer : ''
      if (!finalAnswer || !optionTexts.includes(finalAnswer)) {
        finalAnswer = optionTexts[0] // Default to first if not determined
      }

      results.push({
        tempId: `draft_${Date.now()}_${bIdx}`,
        type: 'multiple_choice',
        text: questionPrompt,
        options: optionTexts,
        correctAnswer: finalAnswer,
        explanation,
        difficulty: 'medium',
        sourceReference: sourceDocName ? `${sourceDocName} (سؤال ${block.number})` : undefined,
        selected: true,
      })
    } else if (isTrueFalse || typeof detectedCorrectAnswer === 'boolean') {
      results.push({
        tempId: `draft_${Date.now()}_${bIdx}`,
        type: 'true_false',
        text: questionPrompt,
        correctAnswer: typeof detectedCorrectAnswer === 'boolean' ? detectedCorrectAnswer : true,
        explanation,
        difficulty: 'easy',
        sourceReference: sourceDocName ? `${sourceDocName} (سؤال ${block.number})` : undefined,
        selected: true,
      })
    }
  })

  return results
}
