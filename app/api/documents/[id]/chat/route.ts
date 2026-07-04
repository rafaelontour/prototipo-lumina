import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/reviewer";
import { loadDocument, saveDocument, toPublicDocument } from "@/lib/storage";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { message } = (await request.json()) as { message?: string };

    if (!message?.trim()) {
      return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
    }

    const record = await loadDocument(id);
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message.trim(),
      createdAt: new Date().toISOString()
    };
    const assistantMessage = answerQuestion(record, message.trim());

    record.messages.push(userMessage, assistantMessage);
    await saveDocument(record);

    return NextResponse.json({
      document: toPublicDocument(record),
      messages: [userMessage, assistantMessage]
    });
  } catch {
    return NextResponse.json({ error: "Nao foi possivel responder a conversa." }, { status: 500 });
  }
}
