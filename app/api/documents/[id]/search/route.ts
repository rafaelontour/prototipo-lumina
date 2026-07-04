import { NextResponse } from "next/server";
import { loadDocument } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  try {
    const { id } = await params;
    const record = await loadDocument(id);
    const normalized = query.toLowerCase();
    const results = record.pages
      .map((pageText, index) => {
        const position = pageText.toLowerCase().indexOf(normalized);
        if (position < 0) return null;
        const start = Math.max(0, position - 90);
        return {
          page: index + 1,
          excerpt: pageText.slice(start, start + 220).trim()
        };
      })
      .filter((result): result is { page: number; excerpt: string } => Boolean(result));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Documento nao encontrado." }, { status: 404 });
  }
}
