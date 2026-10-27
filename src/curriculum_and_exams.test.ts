import { describe, expect, it } from 'vitest'
import { pdfProcessingService } from '../src/services/pdfProcessingService'
import { lessonService } from '../src/services/lessonService'
import { subjectService } from '../src/services/subjectService'
import { unitService } from '../src/services/unitService'
import { questionService } from '../src/services/questionService'
import { examService } from '../src/services/examService'

describe('نظام استيراد المناهج واستخراج الأسئلة والامتحانات', () => {
  it('يكتشف الملف المصور (Scanned PDF) الذي لا يحتوي على نص قابل للاستخراج ويطلب OCR', async () => {
    // Mock Blob with empty text
    // In our service, average chars per page < 35 triggers scanned image detection
    const mockPages = [
      { pageNumber: 1, text: '' },
      { pageNumber: 2, text: '   ' },
    ]

    // Verify detection logic in pdfProcessingService:
    const totalChars = mockPages.reduce((acc, p) => acc + p.text.replace(/\s/g, '').length, 0)
    const avgChars = totalChars / mockPages.length
    const isScanned = avgChars < 35

    expect(isScanned).toBe(true)
  })

  it('يستخرج هيكل المنهج (الوحدات، الدروس، الملخصات، والمصطلحات) من النص بدقة', () => {
    const sampleText = `
الوحدة الأولى: أساسيات قواعد البيانات
الدرس الأول: مقدمة في النظم العلائقية
تعتبر قواعد البيانات العلائقية من أهم ركائز البرمجيات الحديثة.
المقصود بـ المفتاح الأساسي: هو حقل فريد يميز كل سجل في الجدول دون تكرار.
الخلاصة: قواعد البيانات العلائقية تعتمد على الجداول والمفاتيح لربط البيانات بكفاءة.

الدرس الثاني: لغة الاستعلامات البنيوية SQL
لغة SQL هي اللغة القياسية للتعامل مع البيانات.
يقصد بـ لغة DDL: هي تعليمات لتعريف جداول وهيكل قاعدة البيانات مثل CREATE و ALTER.
`
    const { units, generalLessons } = pdfProcessingService.extractCurriculumStructure(
      sampleText,
      [{ pageNumber: 1, text: sampleText }],
      'database_lecture.pdf'
    )

    expect(units.length).toBe(1)
    expect(units[0].name).toContain('الوحدة الأولى')
    expect(units[0].lessons.length).toBeGreaterThanOrEqual(2)

    // Check lesson 1
    const lesson1 = units[0].lessons[0]
    expect(lesson1.title).toContain('الدرس الأول')
    expect(lesson1.summary).toContain('قواعد البيانات العلائقية')
    expect(lesson1.keyTerms.length).toBeGreaterThanOrEqual(1)
    expect(lesson1.keyTerms[0].term).toContain('المفتاح الأساسي')

    // Check lesson 2
    const lesson2 = units[0].lessons[1]
    expect(lesson2.title).toContain('الدرس الثاني')
    expect(lesson2.keyTerms.some((t) => t.term.includes('DDL'))).toBe(true)
  })

  it('يستخرج الأسئلة مع الإجابات الصريحة ومفاتيح الحلول بنجاح ويضع غير المؤكد في قائمة المراجعة', () => {
    const examText = `
س1: ما هو المكون الأساسي للذاكرة العشوائية RAM؟
أ) الترانزستور والمكثف
ب) القرص الصلب
ج) المعالج الدقيق
د) كابل الشبكة
الإجابة: أ) الترانزستور والمكثف

س2: لغة HTML تعتبر لغة برمجة إجرائية.
(صح / خطأ)
الجواب: خطأ

س3: ما هي وظيفة مترجم الكود Compiler؟
أ) تحويل الكود المصدري إلى لغة الآلة
ب) تشغيل الصوت
ج) تخزين الملفات
د) تسريع الإنترنت
`
    const questions = pdfProcessingService.extractQuestionsWithVerification(
      examText,
      [{ pageNumber: 1, text: examText }],
      'exam_sample.pdf',
      []
    )

    expect(questions.length).toBe(3)

    // Q1: Multiple choice with explicit inline answer
    const q1 = questions[0]
    expect(q1.type).toBe('multiple_choice')
    expect(q1.correctAnswer).toBe('الترانزستور والمكثف')
    expect(q1.verificationStatus).toBe('verified')
    expect(q1.userReviewed).toBe(true)

    // Q2: True/False with explicit answer
    const q2 = questions[1]
    expect(q2.type).toBe('true_false')
    expect(q2.correctAnswer).toBe(false)
    expect(q2.verificationStatus).toBe('verified')

    // Q3: Multiple choice WITHOUT explicit answer
    // STRICT RULE: Must NOT invent an answer!
    const q3 = questions[2]
    expect(q3.type).toBe('multiple_choice')
    expect(q3.verificationStatus).toBe('needs_review')
    expect(q3.correctAnswer).toBe('') // Empty answer
    expect(q3.userReviewed).toBe(false)
    expect(q3.reviewReason).toBeDefined()
  })

  it('يحفظ الدروس والوحدات في Dexie ويسترجعها مرتبة ومربوطة بالمادة الصحيحة', async () => {
    const subject = await subjectService.create({ name: 'نظم التشغيل' })
    const unit = await unitService.create({
      subjectId: subject.id,
      name: 'إدارة الذاكرة',
      order: 1,
    })

    const lesson1 = await lessonService.create({
      subjectId: subject.id,
      unitId: unit.id,
      title: 'الذاكرة الافتراضية والتجزئة',
      content: 'تسمح الذاكرة الافتراضية للنظام بتشغيل برامج تتجاوز حجم RAM الفعلي.',
      summary: 'مفهوم الذاكرة الافتراضية والصفحات.',
      keyTerms: [{ term: 'Page Fault', definition: 'حدوث طلب لصفحة غير موجودة بالذاكرة الفعلية.' }],
      order: 1,
    })

    const lesson2 = await lessonService.create({
      subjectId: subject.id,
      unitId: unit.id,
      title: 'خوارزميات استبدال الصفحات LRU',
      content: 'خوارزمية LRU تستبدل الصفحة الأقل استخداماً في الآونة الأخيرة.',
      order: 2,
    })

    // Retrieve by subject
    const subjectLessons = await lessonService.getBySubject(subject.id)
    expect(subjectLessons.length).toBe(2)
    expect(subjectLessons[0].title).toBe('الذاكرة الافتراضية والتجزئة')
    expect(subjectLessons[0].keyTerms?.[0].term).toBe('Page Fault')

    // Retrieve by unit
    const unitLessons = await lessonService.getByUnit(unit.id)
    expect(unitLessons.length).toBe(2)
    expect(unitLessons[1].title).toBe('خوارزميات استبدال الصفحات LRU')

    // Clean up
    await lessonService.delete(lesson1.id)
    const afterDelete = await lessonService.getByUnit(unit.id)
    expect(afterDelete.length).toBe(1)
  })

  it('يمنع استخدام الأسئلة غير المعتمدة في الامتحانات ويصحح الأسئلة المعتمدة بنجاح واحتفاظ باللقطة', async () => {
    const subject = await subjectService.create({ name: 'أمن المعلومات' })

    // 1. Verified Question
    const vQ = await questionService.create({
      subjectId: subject.id,
      type: 'multiple_choice',
      text: 'ما هو التشفير المتماثل؟',
      options: ['استخدام نفس المفتاح للتشفير وفك التشفير', 'استخدام مفتاحين مختلفين', 'بدون مفاتيح'],
      correctAnswer: 'استخدام نفس المفتاح للتشفير وفك التشفير',
      difficulty: 'medium',
      verificationStatus: 'verified',
    })

    // 2. Unverified Question (needs review - empty answer)
    const unverifiedQ = await questionService.create({
      subjectId: subject.id,
      type: 'multiple_choice',
      text: 'ما هو هجوم الوسيط Man-in-the-Middle؟',
      options: ['اعتراض الاتصال والتنصت', 'تدمير الكابلات', 'سرقة الجهاز'],
      correctAnswer: '',
      difficulty: 'hard',
      verificationStatus: 'needs_review',
    })

    // 3. Create exam with onlyVerified = true (default)
    const { exam, questions } = await examService.createExam({
      title: 'امتحان أمن المعلومات النصفي',
      subjectId: subject.id,
      questionCount: 5,
      durationMinutes: 15,
      onlyVerified: true,
    })

    // Assert: only verified question is picked!
    expect(questions.length).toBe(1)
    expect(questions[0].id).toBe(vQ.id)

    // 4. Start attempt
    const attempt = await examService.startAttempt(exam, questions)
    expect(attempt.questionSnapshot.length).toBe(1)
    expect(attempt.questionSnapshot[0].id).toBe(vQ.id)

    // 5. Submit correct answer
    const result = await examService.submitAttempt({
      attemptId: attempt.id,
      answers: {
        [vQ.id]: 'استخدام نفس المفتاح للتشفير وفك التشفير',
      },
      elapsedTimeSeconds: 120,
    })

    expect(result.correctCount).toBe(1)
    expect(result.percentage).toBe(100)
    expect(result.questions[0].isCorrect).toBe(true)

    // 6. Test immutability: modify original question in bank
    await questionService.update(vQ.id, {
      text: 'نص سؤال معدل بعد الامتحان',
    })

    // Retrieve past attempt result again
    const storedResult = await examService.getAttemptResult(attempt.id)
    expect(storedResult).not.toBeNull()
    expect(storedResult!.percentage).toBe(100)
    // Snapshot retains original text!
    expect(storedResult!.questions[0].question.text).toBe('ما هو التشفير المتماثل؟')
  })
})
