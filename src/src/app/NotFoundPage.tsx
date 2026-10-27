import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">الصفحة غير موجودة</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">الرابط الذي فتحته غير صحيح.</p>
      <Link
        to="/"
        className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-4 text-white hover:bg-indigo-700"
      >
        العودة إلى لوحة التحكم
      </Link>
    </section>
  )
}
