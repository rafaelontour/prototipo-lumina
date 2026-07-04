import type { ChatMessage, DocumentRecord, Feedback, Severity } from "./types";

const informalTerms = [
  "coisa",
  "negocio",
  "negócio",
  "muito bom",
  "legal",
  "a gente",
  "tipo"
];

const typoMap: Array<[RegExp, string, string]> = [
  [/\banalize\b/gi, "analize", "análise"],
  [/\bpesquiza\b/gi, "pesquiza", "pesquisa"],
  [/\bmetodologia foi aplicado\b/gi, "metodologia foi aplicado", "metodologia foi aplicada"],
  [/\bconcerteza\b/gi, "concerteza", "com certeza"],
  [/\batravez\b/gi, "atravez", "através"]
];

function idFor(index: number) {
  return `feedback-${String(index + 1).padStart(3, "0")}`;
}

function excerpt(text: string, pattern?: RegExp) {
  if (!text) return "";
  if (!pattern) return text.slice(0, 220);
  const match = text.match(pattern);
  if (!match?.index) return text.slice(0, 220);
  const start = Math.max(0, match.index - 90);
  return text.slice(start, start + 220).trim();
}

function pushFeedback(
  feedbacks: Feedback[],
  page: number,
  category: string,
  text: string,
  severity: Severity,
  pageText: string,
  pattern?: RegExp
) {
  feedbacks.push({
    id: idFor(feedbacks.length),
    page,
    text,
    severity,
    category,
    excerpt: excerpt(pageText, pattern)
  });
}

function scoreLongSentences(pageText: string) {
  return pageText
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim().split(/\s+/).filter(Boolean).length)
    .filter((count) => count > 38).length;
}

function repeatedTerms(pageText: string) {
  const words = pageText
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/\b[a-z]{5,}\b/g);
  if (!words) return [];

  const ignored = new Set([
    "sobre",
    "entre",
    "foram",
    "assim",
    "desta",
    "deste",
    "dessa",
    "desse",
    "como",
    "para",
    "pelos",
    "pelas",
    "trabalho",
    "estudo"
  ]);

  const counts = new Map<string, number>();
  for (const word of words) {
    if (!ignored.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 8)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
}

function detectReferences(pages: string[], feedbacks: Feedback[]) {
  const fullText = pages.join("\n");
  const hasReferenceSection = /refer[eê]ncias|bibliografia/i.test(fullText);
  const citationMatches = fullText.match(/\([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ-]+,\s*\d{4}/g) ?? [];

  if (citationMatches.length > 0 && !hasReferenceSection) {
    pushFeedback(
      feedbacks,
      pages.length,
      "Referencias",
      "Ha citacoes no texto, mas nao localizei uma secao de referencias bibliograficas.",
      "high",
      pages[pages.length - 1] ?? ""
    );
  }

  const referencePageIndex = pages.findIndex((page) => /refer[eê]ncias|bibliografia/i.test(page));
  if (referencePageIndex >= 0) {
    const referencePage = pages[referencePageIndex];
    const suspiciousLines = referencePage
      .split(/(?<=\.)\s+/)
      .filter((line) => line.length > 35 && !/\d{4}/.test(line));

    if (suspiciousLines.length > 1) {
      pushFeedback(
        feedbacks,
        referencePageIndex + 1,
        "Referencias",
        "Algumas referencias parecem incompletas ou sem ano de publicacao.",
        "medium",
        referencePage
      );
    }
  }
}

function detectFiguresAndTables(pages: string[], feedbacks: Feedback[]) {
  pages.forEach((pageText, index) => {
    const page = index + 1;
    const figures = pageText.match(/\bfigura\s+\d+/gi) ?? [];
    const tables = pageText.match(/\btabela\s+\d+/gi) ?? [];

    if ((figures.length > 0 || tables.length > 0) && !/fonte:|elaborado|autoria|legenda/i.test(pageText)) {
      pushFeedback(
        feedbacks,
        page,
        "Figuras e tabelas",
        "Figura ou tabela identificada sem indicio claro de legenda ou fonte na mesma pagina.",
        "medium",
        pageText,
        /\b(figura|tabela)\s+\d+/i
      );
    }

    const labels = [...figures, ...tables].map((label) => label.toLowerCase());
    const duplicated = labels.find((label, labelIndex) => labels.indexOf(label) !== labelIndex);
    if (duplicated) {
      pushFeedback(
        feedbacks,
        page,
        "Figuras e tabelas",
        `Possivel numeracao duplicada em ${duplicated}.`,
        "medium",
        pageText,
        new RegExp(duplicated, "i")
      );
    }
  });
}

export function analyzeDocument(pages: string[]) {
  const feedbacks: Feedback[] = [];

  pages.forEach((pageText, index) => {
    const page = index + 1;

    typoMap.forEach(([pattern, found, suggestion]) => {
      if (pattern.test(pageText)) {
        pushFeedback(
          feedbacks,
          page,
          "Ortografia",
          `Possivel erro ortografico: substitua "${found}" por "${suggestion}".`,
          "high",
          pageText,
          pattern
        );
      }
      pattern.lastIndex = 0;
    });

    const longSentences = scoreLongSentences(pageText);
    if (longSentences > 0) {
      pushFeedback(
        feedbacks,
        page,
        "Clareza",
        `${longSentences} frase(s) longa(s) podem prejudicar a clareza academica.`,
        longSentences > 2 ? "high" : "medium",
        pageText
      );
    }

    informalTerms.forEach((term) => {
      const pattern = new RegExp(`\\b${term}\\b`, "i");
      if (pattern.test(pageText)) {
        pushFeedback(
          feedbacks,
          page,
          "Escrita academica",
          `Expressao informal encontrada: "${term}". Considere uma formulacao mais academica.`,
          "medium",
          pageText,
          pattern
        );
      }
    });

    repeatedTerms(pageText).forEach(([term, count]) => {
      pushFeedback(
        feedbacks,
        page,
        "Coesao textual",
        `O termo "${term}" aparece ${count} vezes nesta pagina. Avalie sinonimos ou reorganizacao do paragrafo.`,
        "low",
        pageText
      );
    });

    if (/\s{4,}/.test(pageText) || /-{3,}/.test(pageText)) {
      pushFeedback(
        feedbacks,
        page,
        "Formatacao",
        "Ha indicios de espacos, quebras ou separadores inconsistentes nesta pagina.",
        "low",
        pageText
      );
    }
  });

  detectFiguresAndTables(pages, feedbacks);
  detectReferences(pages, feedbacks);

  if (feedbacks.length === 0) {
    pushFeedback(
      feedbacks,
      1,
      "Resumo geral",
      "Nenhum problema evidente foi detectado na varredura automatica inicial. Ainda assim, uma revisao humana e recomendada.",
      "low",
      pages[0] ?? ""
    );
  }

  const byCategory = feedbacks.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1;
    return acc;
  }, {});

  const highCount = feedbacks.filter((item) => item.severity === "high").length;
  const mediumCount = feedbacks.filter((item) => item.severity === "medium").length;

  return {
    feedbacks,
    summary: {
      general: [
        `${feedbacks.length} observacao(oes) encontradas`,
        `${highCount} ponto(s) de alta prioridade`,
        `${mediumCount} ponto(s) de prioridade media`,
        `${Object.keys(byCategory).length} categoria(s) avaliadas`
      ],
      quality: [
        `Clareza: ${byCategory.Clareza ? "Requer revisao" : "Boa"}`,
        `Coesao: ${byCategory["Coesao textual"] ? "Media" : "Boa"}`,
        `Formalidade academica: ${byCategory["Escrita academica"] ? "Requer ajustes" : "Boa"}`
      ],
      priorities: feedbacks
        .slice()
        .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
        .slice(0, 4)
        .map((item) => `${item.category}: ${item.text}`)
    }
  };
}

function severityWeight(severity: Severity) {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

export function initialAssistantMessage(record: Omit<DocumentRecord, "messages">): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    createdAt: new Date().toISOString(),
    feedbacks: record.feedbacks.slice(0, 8),
    content: [
      "Analisei seu documento e encontrei alguns pontos de melhoria.",
      "",
      "## Resumo Geral",
      ...record.summary.general.map((item) => `- ${item}`),
      "",
      "## Qualidade do Texto",
      ...record.summary.quality.map((item) => `- ${item}`),
      "",
      "## Prioridades",
      ...record.summary.priorities.map((item) => `- ${item}`)
    ].join("\n")
  };
}

export function answerQuestion(record: DocumentRecord, question: string): ChatMessage {
  const normalized = question.toLowerCase();
  const relevantFeedbacks = record.feedbacks.filter((item) => {
    const haystack = `${item.category} ${item.text}`.toLowerCase();
    return normalized
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .some((word) => haystack.includes(word));
  });

  const selected = relevantFeedbacks.length > 0 ? relevantFeedbacks.slice(0, 5) : record.feedbacks.slice(0, 5);
  const pageContext = selected
    .map((item) => `- Pagina ${item.page}: ${item.text}${item.excerpt ? ` Trecho: ${item.excerpt}` : ""}`)
    .join("\n");

  const intent = detectIntent(normalized);
  const content = [
    intent,
    "",
    pageContext || "Nao encontrei um trecho especifico ligado a essa pergunta, mas posso orientar a revisao geral do documento.",
    "",
    "Sugestao de acao: priorize os itens de maior severidade, revise o trecho indicado no documento e mantenha padrao academico consistente entre secoes."
  ].join("\n");

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    createdAt: new Date().toISOString(),
    content,
    feedbacks: selected
  };
}

function detectIntent(question: string) {
  if (question.includes("refer")) {
    return "Revisei os sinais ligados a citacoes e referencias no documento.";
  }
  if (question.includes("abnt")) {
    return "Fiz uma verificacao preliminar de consistencia com preocupacoes comuns da ABNT.";
  }
  if (question.includes("introdu")) {
    return "Separei os pontos mais relevantes para melhorar a introducao e sua progressao textual.";
  }
  if (question.includes("clareza") || question.includes("academ")) {
    return "Foquemos em clareza, formalidade e escrita academica.";
  }
  if (question.includes("plagio")) {
    return "Nao realizo deteccao conclusiva de plagio sem consulta a bases externas, mas posso apontar sinais textuais que merecem verificacao.";
  }
  return "Analisei sua pergunta usando o documento como contexto principal.";
}
