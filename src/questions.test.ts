import { describe, expect, it } from 'vitest'
import { questionService } from '../src/services/questionService'
import { subjectService } from '../src/services/subjectService'
import { unitService } from '../src/services/unitService'

describe('بنك الأسئلة (Phase 3 Questions Service)', () => {
  it('يرفض إنشاء سؤال اختيار من متعدد بخيارات فارغة أو أقل من خيارين', async () => {
    const subj = await subjectService.create({ name: 'مقدمة في البرمجة' })

    // Empty text
    await expect(
      questionService.create({
        subjectId: subj.id,
        type: 'multiple_choice',
        text: '',
        options: ['أ', 'ب'],
        correctAnswer: 'أ',
        difficulty: 'easy',
      })
    ).rejects.toThrow(/نص السؤال/)

    // Less than 2 options
    await expect(
      questionService.create({
        subjectId: subj.id,
        type: 'multiple_choice',
        text: 'ما هو المتغير؟',
        options: ['خيار واحد فقط'],
        correctAnswer: 'خيار واحد فقط',
        difficulty: 'easy',
      })
    ).rejects.toThrow(/خيارين على الأقل/)

    // Empty option in list
    await expect(
      questionService.create({
        subjectId: subj.id,
        type: 'multiple_choice',
        text: 'ما هو الثابت؟',
        options: ['قيمة متغيرة', ' '],
        correctAnswer: 'قيمة متغيرة',
        difficulty: 'easy',
      })
    ).rejects.toThrow(/خيارات فارغة/)

    // Correct answer not matching options
    await expect(
      questionService.create({
        subjectId: subj.id,
        type: 'multiple_choice',
        text: 'ما هي لغة بايثون؟',
        options: ['لغة برمجة', 'نظام تشغيل'],
        correctAnswer: 'قاعدة بيانات',
        difficulty: 'easy',
      })
    ).rejects.toThrow(/يجب أن تطابق أحد الخيارات/)
  })

  it('ينشئ سؤال اختيار من متعدد وسؤال صح أو خطأ بنجاح ويسترجع الإحصائيات', async () => {
    const subj = await subjectService.create({ name: 'هندسة البرمجيات' })
    const unit = await unitService.create({ subjectId: subj.id, name: 'دورة حياة البرمجيات' })

    // 1. Create Multiple Choice
    const q1 = await questionService.create({
      subjectId: subj.id,
      unitId: unit.id,
      type: 'multiple_choice',
      text: 'ما هو نموذج الشلال في هندسة البرمجيات؟',
      options: ['نموذج تتابعي خطي', 'نموذج تكراري', 'نموذج عشوائي'],
      correctAnswer: 'نموذج تتابعي خطي',
      explanation: 'الشلال هو أول نموذج تتابعي يمر بمراحل التحليل والتصميم والتنفيذ والاختبار.',
      difficulty: 'medium',
    })

    expect(q1.id).toBeDefined()
    expect(q1.correctAnswer).toBe('نموذج تتابعي خطي')
    expect(q1.options?.length).toBe(3)

    // 2. Create True/False
    const q2 = await questionService.create({
      subjectId: subj.id,
      unitId: unit.id,
      type: 'true_false',
      text: 'إدارة المتطلبات تتم فقط في نهاية دورة تطوير البرنامج.',
      correctAnswer: false,
      explanation: 'إدارة المتطلبات تتم في المراحل المبكرة وتستمر طوال دورة التطوير.',
      difficulty: 'easy',
    })

    expect(q2.id).toBeDefined()
    expect(q2.correctAnswer).toBe(false)

    // 3. Stats
    const stats = await questionService.getStats(subj.id)
    expect(stats.total).toBe(2)
    expect(stats.multipleChoiceCount).toBe(1)
    expect(stats.trueFalseCount).toBe(1)
    expect(stats.easyCount).toBe(1)
    expect(stats.mediumCount).toBe(1)

    // 4. Filtering by type
    const mcOnly = await questionService.getAll({
      subjectId: subj.id,
      type: 'multiple_choice',
    })
    expect(mcOnly.length).toBe(1)
    expect(mcOnly[0].id).toBe(q1.id)

    // 5. Search query
    const searched = await questionService.getAll({
      searchQuery: 'الشلال',
    })
    expect(searched.length).toBe(1)
    expect(searched[0].id).toBe(q1.id)

    // 6. Update
    const updated = await questionService.update(q1.id, {
      difficulty: 'hard',
      explanation: 'تفسير محدث للمسألة',
    })
    expect(updated.difficulty).toBe('hard')
    expect(updated.explanation).toBe('تفسير محدث للمسألة')

    // 7. Delete
    await questionService.delete(q2.id)
    const afterDelete = await questionService.getAll({ subjectId: subj.id })
    expect(afterDelete.length).toBe(1)
    expect(afterDelete[0].id).toBe(q1.id)
  })
})
