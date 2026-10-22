import { useSyncExternalStore } from 'react'

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

/** حالة الاتصال حسب المتصفح. ملاحظة: "متصل" لا يضمن وصول الإنترنت فعليًا. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
