import { describe, it, expect } from 'vitest'
import { db } from '../src/db/db'
import { examService, toBool } from '../src/services/examService'

const q = (id: string, type: any, correctAnswer: any) =>
  ({ id, subjectId: 's1', type, text: id, correctAnswer, difficulty: 'easy', createdAt: 1 }) as any

async function setup() {
  const exam = { id: 'e1', subjectId: 's1', title: 't', durationMinutes: 10, questionIds: [], createdAt: 1 } as any
  await db.exams.put(exam)
  const attempt = await examService.startAttempt(exam, [q('a', 'true_false', false), q('b', 'multiple_choice', 'x')])
  return { exam, attempt }
}

describe('exam engine', () => {
  it('computes remaining time from start time', () => {
    expect(examService.remainingSeconds(0, 10, 60_000)).toBe(540)
    expect(examService.remainingSeconds(0, 10, 10 * 60_000 + 5000)).toBe(0)
  })

  it('grades boolean false correctly (false is a real answer)', async () => {
    const { attempt } = await setup()
    const r = await examService.submitAttempt({ attemptId: attempt.id, answers: { a: false, b: 'x' }, elapsedTimeSeconds: 5 })
    expect(r.correctCount).toBe(2)
    expect(toBool('false')).toBe(false)
  })

  it('second submit does not re-grade or overwrite', async () => {
    const { attempt } = await setup()
    await examService.submitAttempt({ attemptId: attempt.id, answers: { a: false, b: 'x' }, elapsedTimeSeconds: 5 })
    const again = await examService.submitAttempt({ attemptId: attempt.id, answers: {}, elapsedTimeSeconds: 99 })
    expect(again.correctCount).toBe(2)
  })

  it('resumes an unfinished attempt with saved answers', async () => {
    const { attempt } = await setup()
    await examService.saveProgress(attempt.id, { a: true }, 3)
    const found = await examService.getResumableAttempt()
    expect(found?.attempt.answers).toEqual({ a: true })
  })
})
