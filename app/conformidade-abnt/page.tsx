"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookCheck, FileWarning, Loader2 } from "lucide-react";
import { type ArticleEntry, type ComplianceResult, fetchAbntComplianceResult, listArticleEntries } from "@/lib/compliance";

type AbntCriterion = {
  criterio: string;
  norma: string;
  justificativa: string;
  match: boolean;
};

type AbntSummary = {
  is_compliant: boolean;
  criterios_total: number;
  criterios_passed: number;
  description: string;
};

type AbntMetadata = {
  approach: string;
  model: string;
  article_file: string;
};

type AbntReport = {
  metadata: AbntMetadata;
  summary: AbntSummary;
  criterios: AbntCriterion[];
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

export default function ConformidadeAbntPage() {
  const [entries, setEntries] = useState<ArticleEntry[]>([]);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [resultState, setResultState] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoadingEntries(true);
      const loaded = await listArticleEntries();
      if (cancelled) return;
      setEntries(loaded);
      setIsLoadingEntries(false);

      const params = new URLSearchParams(window.location.search);
      const documentId = params.get("documentId");
      if (documentId) {
        const match = loaded.find((entry) => entry.externalDocumentId === documentId);
        if (match) setSelectedVersionId(match.versionId);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.versionId === selectedVersionId) ?? null,
    [entries, selectedVersionId]
  );

  useEffect(() => {
    if (!selectedEntry) {
      setResult(null);
      setResultState("idle");
      return;
    }

    let cancelled = false;
    let interval: number | undefined;

    async function load() {
      setResultState("loading");
      setErrorMessage("");
      try {
        const data = await fetchAbntComplianceResult(selectedEntry!.externalDocumentId);
        if (cancelled) return;
        setResult(data);
        setResultState("idle");
        if (data?.status !== "processing" && interval) {
          window.clearInterval(interval);
          interval = undefined;
        }
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Não foi possível consultar a conformidade ABNT.");
        setResultState("error");
      }
    }

    void load();
    interval = window.setInterval(() => {
      void load();
    }, 5000);

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
    };
  }, [selectedEntry]);

  const report = result?.status === "completed" ? (result.report as unknown as AbntReport) : null;

  return (
    <section className="compliance-screen">
      <div className="compliance-header">
        <span className="projects-kicker">Conformidade ABNT</span>
        <h1>Conformidade com Normas ABNT</h1>
        <p>
          Selecione um artigo enviado na tela Documentos para visualizar a auditoria de conformidade com as normas
          ABNT (estrutura textual, citações e referências), feita via IA.
        </p>
      </div>

      <div className="compliance-layout">
        <aside className="compliance-article-list" aria-label="Artigos enviados">
          {isLoadingEntries && (
            <div className="compliance-state">
              <Loader2 className="spin" size={22} />
              <span>Carregando artigos...</span>
            </div>
          )}
          {!isLoadingEntries && entries.length === 0 && (
            <div className="compliance-state">
              <FileWarning size={22} />
              <span>Nenhum artigo enviado ainda. Envie um PDF na tela Documentos.</span>
            </div>
          )}
          {!isLoadingEntries &&
            entries.map((entry) => (
              <button
                className={`compliance-article-item ${entry.versionId === selectedVersionId ? "active" : ""}`}
                key={entry.versionId}
                type="button"
                onClick={() => setSelectedVersionId(entry.versionId)}
              >
                <strong>{entry.projectTitle}</strong>
                <span>{entry.fileName}</span>
                <small>{formatDate(entry.uploadedAt)}</small>
              </button>
            ))}
        </aside>

        <div className="compliance-detail">
          {!selectedEntry && (
            <div className="compliance-state">
              <BookCheck size={32} />
              <strong>Selecione um artigo</strong>
              <span>Escolha um artigo na lista ao lado para ver o resultado da verificação ABNT.</span>
            </div>
          )}

          {selectedEntry && resultState === "loading" && !result && (
            <div className="compliance-state">
              <Loader2 className="spin" size={28} />
              <span>Consultando a verificação ABNT...</span>
            </div>
          )}

          {selectedEntry && resultState === "error" && (
            <div className="compliance-state error">
              <AlertTriangle size={28} />
              <span>{errorMessage}</span>
            </div>
          )}

          {selectedEntry && resultState !== "error" && result === null && resultState !== "loading" && (
            <div className="compliance-state">
              <FileWarning size={28} />
              <strong>Nenhuma verificação encontrada</strong>
              <span>Envie novamente o PDF na tela Documentos para disparar a verificação ABNT.</span>
            </div>
          )}

          {selectedEntry && result?.status === "processing" && (
            <div className="compliance-state">
              <Loader2 className="spin" size={28} />
              <strong>Analisando o documento...</strong>
              <span>A verificação ABNT via IA pode levar alguns instantes.</span>
            </div>
          )}

          {selectedEntry && result?.status === "error" && (
            <div className="compliance-state error">
              <AlertTriangle size={28} />
              <strong>Falha na verificação</strong>
              <span>{result.error ?? "Ocorreu um erro ao processar o documento."}</span>
            </div>
          )}

          {report && (
            <>
              <div className="compliance-metrics">
                <div>
                  <strong>
                    {report.summary.criterios_passed}/{report.summary.criterios_total}
                  </strong>
                  <span>Critérios aprovados</span>
                </div>
              </div>

              <div className="compliance-criteria-grid">
                {report.criterios.map((criterion, index) => (
                  <article className="compliance-criterion-card" key={`${criterion.criterio}-${index}`}>
                    <div className="compliance-criterion-header">
                      <h4>{criterion.criterio}</h4>
                    </div>
                    <div>
                      <span className="compliance-tag">{criterion.norma}</span>{" "}
                      <span className={`compliance-badge ${criterion.match ? "ok" : "bad"}`}>
                        {criterion.match ? "Conforme" : "Divergência"}
                      </span>
                    </div>
                    <p>{criterion.justificativa}</p>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
