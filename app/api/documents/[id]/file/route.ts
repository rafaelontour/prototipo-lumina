import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { pdfPathFor } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const file = await readFile(pdfPathFor(id));
    return new NextResponse(file, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ error: "Arquivo nao encontrado." }, { status: 404 });
  }
}
