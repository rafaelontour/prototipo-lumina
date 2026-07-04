import path from "path";
import { pathToFileURL } from "url";

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

async function loadPdfJs(): Promise<PdfJsModule> {
  const globals = globalThis as Record<string, unknown>;
  globals.DOMMatrix ??= class DOMMatrix {};
  globals.ImageData ??= class ImageData {};
  globals.Path2D ??= class Path2D {};

  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

export async function extractPdfPages(buffer: Buffer): Promise<string[]> {
  const pdfjs = await loadPdfJs();
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
  ).href;

  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false
  }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: unknown) => {
        if (typeof item === "object" && item && "str" in item) {
          return String((item as { str: string }).str);
        }
        return "";
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(pageText);
  }

  return pages.length > 0 ? pages : [""];
}
