export interface PDFExtractionResult {
  text: string
  numPages: number
}

export async function extractPDFText(buffer: Buffer): Promise<PDFExtractionResult> {
  const { default: pdfParse } = await import('pdf-parse')
  const data = await pdfParse(buffer)
  return {
    text: data.text,
    numPages: data.numpages,
  }
}

export function getTextPreview(text: string, maxLength = 500): string {
  return text.slice(0, maxLength).trim() + (text.length > maxLength ? '...' : '')
}
