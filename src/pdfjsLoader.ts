/**
 * Single place that loads pdfjs-dist and configures its Worker.
 * The worker is bundled by Vite (?url) instead of loaded from a CDN, so it
 * always matches the installed library version and works offline.
 */
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

type PdfJs = typeof import('pdfjs-dist')
let cached: Promise<PdfJs> | null = null

export function loadPdfJs(): Promise<PdfJs> {
  if (!cached) {
    cached = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      return pdfjs
    })
  }
  return cached
}

/** Optional CMap/font assets (improve Arabic rendering). Used only when online. */
export function pdfAssetOptions(version: string): Record<string, unknown> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return {}
  return {
    cMapUrl: `https://unpkg.com/pdfjs-dist@${version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${version}/standard_fonts/`,
  }
}

/** true when the browser can show a PDF inside an <iframe> (desktop browsers) */
export function canEmbedPdfNatively(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { pdfViewerEnabled?: boolean }
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  return nav.pdfViewerEnabled === true && !mobile
}
