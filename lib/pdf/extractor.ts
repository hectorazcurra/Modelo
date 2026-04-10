import { PDFParse } from 'pdf-parse'

export interface PDFExtractionResult {
  text: string
  numPages: number
}

export async function extractPDFText(buffer: Buffer): Promise<PDFExtractionResult> {
  const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const parser = new PDFParse({ data: uint8 })
  const [info, textResult] = await Promise.all([parser.getInfo(), parser.getText()])
  await parser.destroy()

  return {
    text: textResult.text,
    numPages: info.pages?.length ?? 0,
  }
}

export function getTextPreview(text: string, maxLength = 500): string {
  return text.slice(0, maxLength).trim() + (text.length > maxLength ? '...' : '')
}
