import { loadPdfJs, pdfAssetOptions } from './pdfjsLoader'
/**
 * Extracts plain text from a PDF Blob page by page using pdfjs-dist
 */
export async function extractTextFromPdf(blob: Blob): Promise<{
  text: string
  pageCount: number
  pages: { pageNumber: number; text: string }[]
}> {
  const pdfjs = await loadPdfJs()
  const arrayBuffer = await blob.arrayBuffer()
  const loadingTask = pdfjs.getDocument({
    data: arrayBuffer,
    ...pdfAssetOptions(pdfjs.version),
  })

  const pdf = await loadingTask.promise
  const pageCount = pdf.numPages
  const pages: { pageNumber: number; text: string }[] = []

  let fullText = ''

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()

    // Assemble text items into natural lines
    let lastY: number | null = null
    let pageText = ''

    for (const item of textContent.items as any[]) {
      if ('str' in item) {
        const str = item.str
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
          pageText += '\n'
        } else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
          pageText += ' '
        }
        pageText += str
        lastY = item.transform[5]
      }
    }

    const cleanedPageText = pageText.trim()
    pages.push({ pageNumber: i, text: cleanedPageText })
    if (cleanedPageText) {
      fullText += `\n\n--- صفحة ${i} ---\n\n` + cleanedPageText
    }
  }

  return {
    text: fullText.trim(),
    pageCount,
    pages,
  }
}
