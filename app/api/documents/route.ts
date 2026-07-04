import { NextResponse } from "next/server";
import { extractPdfPages } from "@/lib/pdf";
import { analyzeDocument, initialAssistantMessage } from "@/lib/reviewer";
import { saveDocument, savePdf, toPublicDocument } from "@/lib/storage";
import type { DocumentRecord } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie um arquivo PDF." }, { status: 400 });
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Formato nao suportado. Envie um PDF." }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const id = crypto.randomUUID();
  const pages = await extractPdfPages(buffer);
  const analysis = analyzeDocument(pages);

  const baseRecord = {
    id,
    name: file.name,
    createdAt: new Date().toISOString(),
    pages,
    pageCount: pages.length,
    feedbacks: analysis.feedbacks,
    summary: analysis.summary
  };

  const record: DocumentRecord = {
    ...baseRecord,
    messages: [initialAssistantMessage(baseRecord)]
  };

  await savePdf(id, buffer);
  await saveDocument(record);

  return NextResponse.json({ document: toPublicDocument(record) });
}
