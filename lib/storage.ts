import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { DocumentRecord, PublicDocumentRecord } from "./types";

const dataDir = path.join(process.cwd(), ".data");
const docsDir = path.join(dataDir, "documents");
const filesDir = path.join(dataDir, "files");

export async function ensureStorage() {
  await mkdir(docsDir, { recursive: true });
  await mkdir(filesDir, { recursive: true });
}

export function pdfPathFor(id: string) {
  return path.join(filesDir, `${id}.pdf`);
}

export function recordPathFor(id: string) {
  return path.join(docsDir, `${id}.json`);
}

export async function savePdf(id: string, data: Buffer) {
  await ensureStorage();
  await writeFile(pdfPathFor(id), data);
}

export async function saveDocument(record: DocumentRecord) {
  await ensureStorage();
  await writeFile(recordPathFor(record.id), JSON.stringify(record, null, 2));
}

export async function loadDocument(id: string): Promise<DocumentRecord> {
  const data = await readFile(recordPathFor(id), "utf8");
  return JSON.parse(data) as DocumentRecord;
}

export function toPublicDocument(record: DocumentRecord): PublicDocumentRecord {
  const { pages: _pages, ...publicRecord } = record;
  return {
    ...publicRecord,
    pdfUrl: `/api/documents/${record.id}/file`
  };
}
