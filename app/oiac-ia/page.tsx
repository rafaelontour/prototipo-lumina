"use client";

import {
  ChevronLeft,
  ChevronRight,
  FileSearch,
  Loader2,
  Minus,
  Plus,
  Search,
  Send,
  UploadCloud
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode
} from "react";
import { apiUrl } from "@/lib/api";
import type { ChatMessage, Feedback, PublicDocumentRecord } from "@/lib/types";

type SearchResult = {
  page: number;
  excerpt: string;
};

type ExternalReleaseFeedback = {
  feedback: string;
  fulfilled: boolean;
  score: number;
};

type ExternalReleaseBranch = {
  title: string;
  description: string;
  evaluation: ExternalReleaseFeedback;
};

type ExternalReleaseTaxonomy = {
  title: string;
  description: string;
  branches: ExternalReleaseBranch[];
};

type ExternalReleaseTypification = {
  name: string;
  taxonomies: ExternalReleaseTaxonomy[];
};

type ExternalRelease = {
  id: string;
  description: string | null;
  check_tree: ExternalReleaseTypification[];
  created_at: string;
};

type ExternalReleaseResponse = {
  releases: ExternalRelease[];
};

type PdfJs = any;
type AnalysisContext = {
  project: string;
  component: string;
};

function formatMessage(content: string) {
  return content.split("\n").map((line, index) => {
    if (line.startsWith("## ")) {
      return <h3 key={index}>{line.replace("## ", "")}</h3>;
    }
    if (line.startsWith("- ")) {
      return <li key={index}>{line.replace("- ", "")}</li>;
    }
    if (!line.trim()) {
      return <br key={index} />;
    }
    return <p key={index}>{line}</p>;
  });
}

function removeLocalPriorities(content: string) {
  return content
    .split("\n")
    .reduce<{ lines: string[]; skipping: boolean }>(
      (acc, line) => {
        if (line.trim() === "## Prioridades") {
          return { ...acc, skipping: true };
        }

        if (acc.skipping && line.startsWith("## ")) {
          acc.lines.push(line);
          return { lines: acc.lines, skipping: false };
        }

        if (!acc.skipping) {
          acc.lines.push(line);
        }

        return acc;
      },
      { lines: [], skipping: false }
    )
    .lines.join("\n")
    .trim();
}

async function readApiError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (typeof data?.detail === "string") return data.detail;
  if (Array.isArray(data?.detail) && data.detail[0]?.msg) return String(data.detail[0].msg);
  if (typeof data?.message === "string") return data.message;
  if (typeof data?.error === "string") return data.error;
  return fallback;
}

function formatExternalAnalysis(release: ExternalRelease) {
  const lines = [
    "## Análise da IA",
    release.description ? `Documento analisado: ${release.description}` : "Resultado da análise retornada pela IA.",
    `Versão analisada em ${new Date(release.created_at).toLocaleString("pt-BR")}.`
  ];

  release.check_tree.forEach((typification) => {
    lines.push("", `## ${typification.name}`);
    sortByLeadingNumber(typification.taxonomies, (taxonomy) => taxonomy.title).forEach((taxonomy) => {
      lines.push(`- ${taxonomy.title}: ${taxonomy.description}`);
      sortByLeadingNumber(taxonomy.branches, (branch) => branch.title).forEach((branch) => {
        const status = branch.evaluation.fulfilled ? "Atendido" : "Requer atenção";
        lines.push(`- ${branch.title}: ${status}. Nota ${branch.evaluation.score}. ${branch.evaluation.feedback}`);
      });
    });
  });

  return lines.join("\n");
}

function externalAnalysisTopics(release: ExternalRelease) {
  return release.check_tree.flatMap((typification) =>
    sortByLeadingNumber(typification.taxonomies, (taxonomy) => taxonomy.title).map((taxonomy) => ({
      title: taxonomy.title,
      description: taxonomy.description,
      items: sortByLeadingNumber(taxonomy.branches, (branch) => branch.title).map((branch) => ({
        title: branch.title,
        status: branch.evaluation.fulfilled ? "Atendido" : "Requer atenção",
        score: branch.evaluation.score,
        feedback: branch.evaluation.feedback
      }))
    }))
  );
}

function leadingNumber(value: string) {
  const match = value.trim().match(/^(\d+(?:\.\d+)*)/);
  if (!match) return null;
  return match[1].split(".").map((part) => Number(part));
}

function compareNumberParts(left: number[] | null, right: number[] | null) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue !== rightValue) return leftValue - rightValue;
  }

  return 0;
}

function sortByLeadingNumber<T>(items: T[], getLabel: (item: T) => string) {
  return items
    .map((item, index) => ({ item, index, numberParts: leadingNumber(getLabel(item)) }))
    .sort((left, right) => compareNumberParts(left.numberParts, right.numberParts) || left.index - right.index)
    .map(({ item }) => item);
}

function scoreExternalAnalysis(release: ExternalRelease) {
  const scores = release.check_tree.flatMap((typification) =>
    typification.taxonomies.flatMap((taxonomy) => taxonomy.branches.map((branch) => branch.evaluation.score))
  );

  if (scores.length === 0) return undefined;

  const average = scores.reduce((total, score) => total + score, 0) / scores.length;
  const max = scores.some((score) => score > 10) ? 100 : 10;
  const normalized = (average / max) * 100;
  const tone: "low" | "medium" | "high" = normalized >= 70 ? "high" : normalized >= 40 ? "medium" : "low";
  const value = max === 10 ? Number(average.toFixed(1)) : Math.round(average);

  return {
    value,
    max,
    label: `${value}/${max}`,
    tone
  };
}

async function fetchExternalAnalysisMessage(externalDocumentId: string, externalReleaseId?: string): Promise<ChatMessage | null> {
  const response = await fetch(apiUrl(`/doc/${encodeURIComponent(externalDocumentId)}/release`), {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Não foi possível carregar a análise da IA."));
  }

  const data = (await response.json()) as ExternalReleaseResponse;
  const release = data.releases?.find((item) => item.id === externalReleaseId) ?? data.releases?.[0];
  if (!release) return null;

  return {
    id: `external-analysis-${release.id}`,
    role: "assistant",
    content: formatExternalAnalysis(release),
    createdAt: release.created_at,
    analysisScore: scoreExternalAnalysis(release),
    analysisTopics: externalAnalysisTopics(release)
  };
}

export default function Home() {
  const [documentRecord, setDocumentRecord] = useState<PublicDocumentRecord | null>(null);
  const [analysisContext, setAnalysisContext] = useState<AnalysisContext | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [activePage, setActivePage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [splitPercent, setSplitPercent] = useState(62);
  const appViewRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const documentId = params.get("documentId");
    const externalDocumentId = params.get("externalDocumentId");
    const externalReleaseId = params.get("externalReleaseId") ?? undefined;
    const project = params.get("project");
    const component = params.get("component");

    if (!documentId) return;
    const localDocumentId = documentId;

    setAnalysisContext({
      project: project || "documento",
      component: component || "Documento"
    });
    setIsLoadingDocument(true);
    setStatus("Carregando documento do documento...");

    async function loadDocumentAndAnalysis() {
      try {
        const response = await fetch(`/api/documents/${encodeURIComponent(localDocumentId)}`, { credentials: "include" });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Documento não encontrado.");
        }

        let nextDocument = data.document as PublicDocumentRecord;
        if (externalDocumentId) {
          nextDocument = {
            ...nextDocument,
            messages: nextDocument.messages.map((message) => ({
              ...message,
              content: removeLocalPriorities(message.content),
              feedbacks: undefined
            }))
          };
          setStatus("Carregando análise da IA...");
          const externalMessage = await fetchExternalAnalysisMessage(externalDocumentId, externalReleaseId);
          if (externalMessage) {
            const alreadyAdded = nextDocument.messages.some((message) => message.id === externalMessage.id);
            nextDocument = {
              ...nextDocument,
              messages: alreadyAdded ? nextDocument.messages : [...nextDocument.messages, externalMessage]
            };
          }
        }

        setDocumentRecord(nextDocument);
        setActivePage(1);
        setSearchResults([]);
        setStatus("");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Não foi possível carregar o documento.");
      } finally {
        setIsLoadingDocument(false);
      }
    }

    void loadDocumentAndAnalysis();
  }, []);

  function updateSplitFromPointer(clientX: number) {
    const container = appViewRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const dividerWidth = 10;
    const availableWidth = Math.max(1, rect.width - dividerWidth);
    const minDocumentWidth = Math.min(520, availableWidth * 0.58);
    const minChatWidth = Math.min(360, availableWidth * 0.42);
    const minPercent = (minDocumentWidth / rect.width) * 100;
    const maxPercent = ((rect.width - dividerWidth - minChatWidth) / rect.width) * 100;
    const nextPercent = ((clientX - rect.left) / rect.width) * 100;

    setSplitPercent(Math.min(maxPercent, Math.max(minPercent, nextPercent)));
  }

  function startPanelResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    document.body.classList.add("resizing-split");
    updateSplitFromPointer(event.clientX);

    function handlePointerMove(pointerEvent: PointerEvent) {
      updateSplitFromPointer(pointerEvent.clientX);
    }

    function handlePointerUp() {
      document.body.classList.remove("resizing-split");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerUp, { once: true });
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setSplitPercent((current) => {
      const delta = event.key === "ArrowLeft" ? -2 : 2;
      return Math.min(70, Math.max(48, current + delta));
    });
  }

  async function uploadFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setStatus("Envie um arquivo PDF.");
      return;
    }

    setIsUploading(true);
    setStatus("Processando PDF e gerando diagnostico inicial...");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        credentials: "include",
        body: formData
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Nao foi possivel processar o arquivo.");
      }

      setDocumentRecord(data.document);
      setAnalysisContext(null);
      setActivePage(1);
      setSearchResults([]);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro inesperado no upload.");
    } finally {
      setIsUploading(false);
    }
  }

  if (!documentRecord) {
    return (
      <section className="upload-screen">
        <div className="upload-grid">
          <div className="brand-panel">
            <div className="brand-logos">
              <img className="brand-mark lumina-mark theme-logo-light" src="/fiocruz_logos/lumina_azul.png" alt="Lumina" />
              <img className="brand-mark lumina-mark theme-logo-dark" src="/fiocruz_logos/lumina_branco.png" alt="Lumina" />
            </div>
            <h1>Assistente de Revisao Cientifica</h1>
            <p>
              Envie um PDF academico para receber uma analise inicial automatica com pontos de
              ortografia, clareza, coesao, formatacao, figuras, tabelas e referencias.
            </p>
          </div>
          <div className="upload-panel">
            <label
              className={`dropzone ${isDragging ? "dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void uploadFile(file);
              }}
            >
              {isUploading ? <Loader2 className="spin" size={44} /> : <UploadCloud size={48} />}
              <strong>Arraste seu PDF aqui</strong>
              <span>ou selecione um arquivo do computador</span>
              <input
                className="hidden-input"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadFile(file);
                }}
              />
              <span>Formatos suportados agora: PDF. Em breve: DOCX e ODT.</span>
            </label>
            <div className="status-line">{isLoadingDocument ? "Carregando análise do documento..." : status}</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="analysis-workspace">
      {analysisContext && (
        <div className="analysis-context-bar">
          <div>
            <span>Análise vinculada ao documento</span>
            <strong>{analysisContext.project}</strong>
          </div>
          <div>
            <span>Etapa em análise</span>
            <strong>{analysisContext.component}</strong>
          </div>
        </div>
      )}
      <section className="app-view oiac-chat-view" ref={appViewRef} style={{ "--split-left": `${splitPercent}%` } as CSSProperties}>
        <DocumentPane
          activePage={activePage}
          documentRecord={documentRecord}
          query={query}
          searchResults={searchResults}
          setActivePage={setActivePage}
          setDocumentRecord={setDocumentRecord}
          setQuery={setQuery}
          setSearchResults={setSearchResults}
          setZoom={setZoom}
          zoom={zoom}
        />
        <div
          aria-label="Redimensionar documento e chat"
          aria-orientation="vertical"
          aria-valuemax={70}
          aria-valuemin={48}
          aria-valuenow={Math.round(splitPercent)}
          className="split-divider"
          onKeyDown={resizeWithKeyboard}
          onPointerDown={startPanelResize}
          role="separator"
          tabIndex={0}
          title="Arraste para redimensionar"
        >
          <span />
        </div>
        <ChatPane documentRecord={documentRecord} onDocumentUpdate={setDocumentRecord} onSelectFeedback={setActivePage} />
      </section>
    </section>
  );
}

function DocumentPane({
  activePage,
  documentRecord,
  query,
  searchResults,
  setActivePage,
  setDocumentRecord,
  setQuery,
  setSearchResults,
  setZoom,
  zoom
}: {
  activePage: number;
  documentRecord: PublicDocumentRecord;
  query: string;
  searchResults: SearchResult[];
  setActivePage: (page: number) => void;
  setDocumentRecord: (documentRecord: PublicDocumentRecord | null) => void;
  setQuery: (query: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setZoom: (value: number | ((value: number) => number)) => void;
  zoom: number;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const canvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const [pages, setPages] = useState<number[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState("");
  const resultIndex = useMemo(
    () => searchResults.findIndex((result) => result.page === activePage),
    [activePage, searchResults]
  );

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      setPages([]);
      setIsRendering(true);
      setRenderError("");
      canvasRefs.current = {};
      pageRefs.current = {};

      const pdfjs: PdfJs = await import("pdfjs-dist/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

      const response = await fetch(documentRecord.pdfUrl, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Não foi possível carregar o PDF.");
      }

      const pdfData = new Uint8Array(await response.arrayBuffer());
      const loadingTask = pdfjs.getDocument({
        data: pdfData,
        isEvalSupported: false
      });
      const pdf = await loadingTask.promise;
      const pageNumbers = Array.from({ length: pdf.numPages }, (_, index) => index + 1);
      setPages(pageNumbers);

      await new Promise((resolve) => requestAnimationFrame(resolve));

      for (const pageNumber of pageNumbers) {
        if (cancelled) return;
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: zoom * 1.18 });
        const canvas = canvasRefs.current[pageNumber];
        const context = canvas?.getContext("2d");
        if (!canvas || !context) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        await page.render({ canvasContext: context, viewport }).promise;
      }

      if (!cancelled) setIsRendering(false);
    }

    void renderPdf().catch((error) => {
      if (!cancelled) {
        setRenderError(error instanceof Error ? error.message : "Não foi possível renderizar o documento.");
        setIsRendering(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [documentRecord.pdfUrl, zoom]);

  useEffect(() => {
    pageRefs.current[activePage]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activePage]);

  async function runSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const response = await fetch(`/api/documents/${documentRecord.id}/search?q=${encodeURIComponent(query.trim())}`, {
      credentials: "include"
    });
    const data = await response.json();
    const results = data.results ?? [];
    setSearchResults(results);
    if (results[0]) setActivePage(results[0].page);
  }

  function navigate(delta: number) {
    const next = Math.min(documentRecord.pageCount, Math.max(1, activePage + delta));
    setActivePage(next);
  }

  return (
    <section className="document-pane">
      <header className="doc-toolbar">
        <button
          className="icon-button"
          title="Enviar outro documento"
          onClick={() => {
            setDocumentRecord(null);
          }}
        >
          <FileSearch size={18} />
        </button>
        <div className="doc-title">
          <strong>{documentRecord.name}</strong>
          <span>{documentRecord.pageCount} pagina(s) analisada(s)</span>
        </div>
      </header>
      <div className="pdf-scroll" ref={scrollRef}>
        {isRendering && <div className="status-line">Renderizando PDF...</div>}
        {pages.length === 0 && !isRendering ? (
          <div className="empty-pages">{renderError || "Não foi possível renderizar o documento."}</div>
        ) : (
          pages.map((pageNumber) => (
            <div
              className={`pdf-page ${activePage === pageNumber ? "active" : ""}`}
              key={pageNumber}
              ref={(node) => {
                pageRefs.current[pageNumber] = node;
              }}
            >
              <span className="page-badge">Pagina {pageNumber}</span>
              <canvas
                ref={(node) => {
                  canvasRefs.current[pageNumber] = node;
                }}
              />
              <div className="page-highlight" />
            </div>
          ))
        )}
      </div>
      <div className="pdf-floating-controls">
        <button className="icon-button" title="Reduzir zoom" onClick={() => setZoom((value) => Math.max(0.65, value - 0.12))}>
          <Minus size={18} />
        </button>
        <button className="icon-button" title="Aumentar zoom" onClick={() => setZoom((value) => Math.min(1.8, value + 0.12))}>
          <Plus size={18} />
        </button>
        <div className="page-control">
          <button className="icon-button" title="Pagina anterior" onClick={() => navigate(-1)}>
            <ChevronLeft size={18} />
          </button>
          <input
            min={1}
            max={documentRecord.pageCount}
            type="number"
            value={activePage}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setActivePage(Number(event.target.value))}
          />
          <span>de {documentRecord.pageCount}</span>
          <button className="icon-button" title="Proxima pagina" onClick={() => navigate(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
        <form className="search-box floating-search" onSubmit={runSearch}>
          <Search size={16} />
          <input value={query} placeholder="Buscar" onChange={(event) => setQuery(event.target.value)} />
        </form>
        <button className="icon-button" title="Busca anterior" disabled={!searchResults.length} onClick={() => navigateSearch(-1)}>
          <ChevronLeft size={18} />
        </button>
        <button className="icon-button" title="Proxima busca" disabled={!searchResults.length} onClick={() => navigateSearch(1)}>
          <ChevronRight size={18} />
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {searchResults.length
          ? `Resultado ${Math.max(resultIndex + 1, 1)} de ${searchResults.length}`
          : "Nenhuma busca ativa"}
      </span>
    </section>
  );

  function navigateSearch(delta: number) {
    if (!searchResults.length) return;
    const current = resultIndex >= 0 ? resultIndex : 0;
    const nextIndex = (current + delta + searchResults.length) % searchResults.length;
    setActivePage(searchResults[nextIndex].page);
  }
}

function ChatPane({
  documentRecord,
  onDocumentUpdate,
  onSelectFeedback
}: {
  documentRecord: PublicDocumentRecord;
  onDocumentUpdate: (record: PublicDocumentRecord) => void;
  onSelectFeedback: (page: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [documentRecord.messages.length]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || isSending) return;

    setIsSending(true);
    const message = draft.trim();
    setDraft("");

    try {
      const response = await fetch(`/api/documents/${documentRecord.id}/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      const data = await response.json();
      if (data.document) onDocumentUpdate(data.document);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <aside className="chat-pane">
      <header className="chat-header">
        <div className="chat-brand">
          <img className="theme-logo-light" src="/fiocruz_logos/lumina_azul.png" alt="Lumina" />
          <img className="theme-logo-dark" src="/fiocruz_logos/lumina_branco.png" alt="Lumina" />
        </div>
        <div>
          <strong>Revisor academico</strong>
          <span>Conversa deste PDF</span>
        </div>
      </header>
      <div className="messages">
        {documentRecord.messages.map((message) => (
          <ChatBubble key={message.id} message={message} onSelectFeedback={onSelectFeedback} />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form className="composer" onSubmit={sendMessage}>
        <div className="chat-input-bubble">
          <textarea
            rows={1}
            value={draft}
            placeholder="Pergunte sobre introducao, referencias, ABNT, clareza ou reescrita..."
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
        </div>
        <button className="send-button" title="Enviar mensagem" aria-label="Enviar mensagem" disabled={isSending || !draft.trim()}>
          {isSending ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
        </button>
      </form>
    </aside>
  );
}

function ChatBubble({ message, onSelectFeedback }: { message: ChatMessage; onSelectFeedback: (page: number) => void }) {
  const grouped = formatMessage(message.content);
  const bullets: ReactNode[] = [];
  const blocks: ReactNode[] = [];

  grouped.forEach((node, index) => {
    if (node.type === "li") {
      bullets.push(node);
      return;
    }

    if (bullets.length > 0) {
      blocks.push(<ul key={`ul-${index}`}>{bullets.splice(0)}</ul>);
    }
    blocks.push(node);
  });

  if (bullets.length > 0) {
    blocks.push(<ul key="ul-last">{bullets}</ul>);
  }

  const isAnalysisMessage = Boolean(message.analysisTopics);

  return (
    <article className={`message ${message.role}${isAnalysisMessage ? " analysis-message" : ""}`}>
      {message.analysisScore && (
        <div className={`analysis-score ${message.analysisScore.tone}`}>
          <span>Nota do PDF</span>
          <strong>{message.analysisScore.label}</strong>
        </div>
      )}
      {message.analysisTopics ? (
        <AnalysisTopicCards topics={message.analysisTopics} />
      ) : (
        blocks
      )}
      {message.feedbacks && message.feedbacks.length > 0 && (
        <div className="feedback-list">
          {message.feedbacks.map((feedback) => (
            <FeedbackButton feedback={feedback} key={feedback.id} onSelect={onSelectFeedback} />
          ))}
        </div>
      )}
    </article>
  );
}

function AnalysisTopicCards({
  topics
}: {
  topics: NonNullable<ChatMessage["analysisTopics"]>;
}) {
  return (
    <div className="analysis-topic-list">
      {topics.map((topic) => (
        <section className="analysis-topic-card" key={topic.title}>
          <h3>{topic.title}</h3>
          <p>{topic.description}</p>
          <div className="analysis-branch-list">
            {topic.items.map((item) => (
              <article className={`analysis-branch-card ${item.status === "Atendido" ? "fulfilled" : "attention"}`} key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.status}</span>
                </div>
                <p>{item.feedback}</p>
                <small>Nota {item.score}</small>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FeedbackButton({ feedback, onSelect }: { feedback: Feedback; onSelect: (page: number) => void }) {
  return (
    <button className={`feedback-card ${feedback.severity}`} onClick={() => onSelect(feedback.page)}>
      <span>
        Pagina {feedback.page} · {feedback.category} · {feedback.severity}
      </span>
      {feedback.text}
    </button>
  );
}
