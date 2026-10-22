import express from 'express'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import { GoogleGenAI, Type } from '@google/genai'

dotenv.config()

const app = express()
const PORT = parseInt(process.env.PORT || '3000', 10)
const isProduction = process.env.NODE_ENV === 'production'

app.use(express.json({ limit: '2mb' }))

// Minimal in-memory rate limit for AI routes (no extra dependency)
const AI_WINDOW_MS = 60_000
const AI_MAX_REQUESTS = 10
const aiHits = new Map<string, number[]>()
app.use('/api/ai', (req, res, next) => {
  const key = req.ip || 'unknown'
  const now = Date.now()
  const recent = (aiHits.get(key) || []).filter((t) => now - t < AI_WINDOW_MS)
  if (recent.length >= AI_MAX_REQUESTS) {
    return res.status(429).json({ error: 'عدد الطلبات كبير. حاول بعد دقيقة.' })
  }
  recent.push(now)
  aiHits.set(key, recent)
  next()
})

// Reject oversized text before it is sent to the external AI provider
app.use('/api/ai', (req, res, next) => {
  const text = req.body?.text
  if (typeof text === 'string' && text.length > 50000) {
    return res.status(413).json({ error: 'النص المرسل أكبر من الحد المسموح (50,000 حرف).' })
  }
  next()
})

// Initialize Gemini client (uses GEMINI_API_KEY from env)
const ai = new GoogleGenAI({})

/**
 * API: Extract structured questions & verified answers from text
 */
app.post('/api/ai/extract-questions', async (req, res) => {
  try {
    const { text, documentName } = req.body

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'يرجى إرسال محتوى نصي لاستخراج الأسئلة' })
    }

    const trimmedText = text.slice(0, 50000) // Safety boundary for single call

    const prompt = `أنت مساعد أكاديمي خبير في استخراج وتحليل بنوك الأسئلة الجامعية والامتحانات.
المطلوب منك فحص النص التالي المستخرج من ملف دراسي أو بنك أسئلة، واستخراج كافة الأسئلة المتوفرة بدقة متناهية مع خياراتها وإجاباتها الصحيحة والشرح إن وجد.

القواعد الصارمة:
1. استخرج أسئلة الاختيار من متعدد (multiple_choice) وأسئلة الصح والخطأ (true_false).
2. في أسئلة الاختيار من متعدد: ضع الخيارات في مصفوفة options، وحدد الإجابة الصحيحة بالضبط في correctAnswer لتطابق أحد الخيارات.
3. في أسئلة الصح والخطأ: حدد correctAnswer كـ true أو false.
4. ابحث عن نماذج الإجابات، ومفاتيح الحلول، أو علامات الإجابة (مثل [x]، أو *أ)*، أو "الإجابة: ب") لاستخراج الإجابة الصحيحة للتصحيح بدقة. إذا لم تكن الإجابة مذكورة صراحة، استنتج الإجابة الصحيحة علمياً واذكر ذلك في الشرح.
5. حدد مستوى الصعوبة: easy (سهل)، medium (متوسط)، hard (صعب).
6. حافظ على الصياغة العربية السليمة.

نص الملف [${documentName || 'مستند دراسي'}]:
${trimmedText}`

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING, description: 'نص السؤال' },
              type: {
                type: Type.STRING,
                enum: ['multiple_choice', 'true_false'],
                description: 'نوع السؤال',
              },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'خيارات السؤال إذا كان اختيار من متعدد',
              },
              correctAnswer: {
                type: Type.STRING,
                description: 'الإجابة الصحيحة (نص الخيار للمتعدد، أو "true"/"false" للصح والخطأ)',
              },
              explanation: { type: Type.STRING, description: 'شرح وتعليل الإجابة' },
              difficulty: {
                type: Type.STRING,
                enum: ['easy', 'medium', 'hard'],
                description: 'مستوى الصعوبة',
              },
            },
            required: ['text', 'type', 'correctAnswer', 'difficulty'],
          },
        },
      },
    })

    const rawOutput = response.text || '[]'
    const parsed = JSON.parse(rawOutput)

    // Normalize true_false answers to boolean
    const sanitized = parsed.map((item: any, idx: number) => {
      let ans: string | boolean = item.correctAnswer
      if (item.type === 'true_false') {
        const lower = String(ans).toLowerCase().trim()
        ans = lower === 'true' || lower === 'صح' || lower === 'صحيح'
      }
      return {
        tempId: `ai_${Date.now()}_${idx}`,
        type: item.type,
        text: item.text,
        options: item.type === 'multiple_choice' ? item.options || [] : undefined,
        correctAnswer: ans,
        explanation: item.explanation || '',
        difficulty: item.difficulty || 'medium',
        sourceReference: documentName ? `${documentName} (استخراج ذكي)` : undefined,
        selected: true,
      }
    })

    return res.json({ success: true, questions: sanitized })
  } catch (err: any) {
    console.error('Error in /api/ai/extract-questions:', err)
    return res.status(500).json({
      error: 'فشل استخراج الأسئلة بالذكاء الاصطناعي',
      details: err.message,
    })
  }
})

/**
 * API: Clean and format lecture text into readable structured content
 */
app.post('/api/ai/clean-text', async (req, res) => {
  try {
    const { text, title } = req.body
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'المحتوى فارغ' })
    }

    const prompt = `قم بإعادة صياغة وتنظيم النص التالي المأخوذ من محاضرة جامعية "${title || 'المحاضرة'}".
رتّب الأفكار في فقرات واضحة مع عناوين رئيسية وفرعية ونقاط محددة بأسلوب عربي أكاديمي سلس ومريح للقراءة والمذاكرة، دون حذف أي معلومة مهمة.

النص الأصلي:
${text.slice(0, 40000)}`

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: prompt,
    })

    return res.json({
      success: true,
      formattedText: response.text || text,
    })
  } catch (err: any) {
    console.error('Error in /api/ai/clean-text:', err)
    return res.status(500).json({ error: err.message })
  }
})

/**
 * API: Extract full structured curriculum (Units, Lessons, Summaries, Key terms, Questions)
 */
app.post('/api/ai/extract-curriculum', async (req, res) => {
  try {
    const { text, documentName, importType } = req.body

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'يرجى إرسال محتوى نصي لاستخراج المنهج' })
    }

    const trimmed = text.slice(0, 45000)

    const prompt = `أنت أستاذ ومصمم مناهج جامعية خبير في تحويل المذكرات والكتب إلى مناهج تفاعلية منظمة.
حلل النص المأخوذ من الملف الجامعي [${documentName || 'مقرر دراسي'}] وقم بهيكلته بدقة:

1. الوحدات والفصول (units):
   - اسم الوحدة وترتيبها.
   - الدروس والموضوعات المنبثقة عنها (lessons):
     * عنوان الدرس.
     * محتوى الشرح بتنسيق عربي أكاديمي واضح (عناوين، فقرات، نقاط).
     * ملخص الدرس (summary) في 2-4 أسطر.
     * التعريفات والمصطلحات الأساسية (keyTerms) مع تعريف كل مصطلح.

2. بنك الأسئلة (questions):
   - استخرج أسئلة الاختيار من متعدد (multiple_choice) والصح والخطأ (true_false).
   - إذا كانت الإجابة مذكورة صراحة في النص أو نموذج الإجابات، ضعها واجعل verificationStatus = "verified".
   - إذا لم تكن الإجابة مذكورة صراحة أو كان هناك شك، ضع الإجابة الأكثر ترجيحاً أو اتركها واجعل verificationStatus = "needs_review".
   - الصعوبة: easy, medium, hard.

نوع الاستيراد المطلوب: ${importType || 'hybrid'}.

نص المحتوى:
${trimmed}`

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            units: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: 'اسم الوحدة أو الفصل' },
                  order: { type: Type.INTEGER, description: 'ترتيب الوحدة' },
                  description: { type: Type.STRING },
                  lessons: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING, description: 'عنوان الدرس' },
                        content: { type: Type.STRING, description: 'محتوى الدرس المفصل' },
                        summary: { type: Type.STRING, description: 'ملخص الدرس' },
                        keyTerms: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              term: { type: Type.STRING },
                              definition: { type: Type.STRING },
                            },
                            required: ['term', 'definition'],
                          },
                        },
                      },
                      required: ['title', 'content'],
                    },
                  },
                },
                required: ['name', 'order', 'lessons'],
              },
            },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ['multiple_choice', 'true_false'] },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctAnswer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  difficulty: { type: Type.STRING, enum: ['easy', 'medium', 'hard'] },
                  verificationStatus: {
                    type: Type.STRING,
                    enum: ['verified', 'needs_review'],
                  },
                },
                required: ['text', 'type', 'difficulty', 'verificationStatus'],
              },
            },
          },
          required: ['units', 'questions'],
        },
      },
    })

    const parsed = JSON.parse(response.text || '{"units":[],"questions":[]}')

    return res.json({
      success: true,
      units: parsed.units || [],
      questions: parsed.questions || [],
    })
  } catch (err: any) {
    console.error('Error in /api/ai/extract-curriculum:', err)
    return res.status(500).json({ error: 'فشل استخراج المنهج بالذكاء الاصطناعي: ' + err.message })
  }
})

// Setup Vite middleware in dev, or serve static dist in prod
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    })
    app.use(vite.middlewares)
  } else {
    const distPath = path.resolve(import.meta.dirname, 'dist')
    app.use(express.static(distPath))
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'))
    })
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UniStudy AI server running at http://localhost:${PORT}`)
  })
}

startServer()
