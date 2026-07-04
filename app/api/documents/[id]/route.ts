import { NextResponse } from "next/server";
import { loadDocument, toPublicDocument } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const record = await loadDocument(id);
    return NextResponse.json({ document: toPublicDocument(record) });
  } catch {
    return NextResponse.json({ error: "Documento nao encontrado." }, { status: 404 });
  }
}
