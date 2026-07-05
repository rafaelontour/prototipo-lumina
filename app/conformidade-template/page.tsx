"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, FileCheck2, FileWarning, Loader2 } from "lucide-react";
import { type ArticleEntry, type ComplianceResult, fetchTemplateComplianceResult, listArticleEntries } from "@/lib/compliance";

type Check = {
  field: string;
  template_value: string;
  article_value: string;
  match: boolean;
};

type VisualCriterionItem = {
  criterio: string;
  justificativa: string;
};

type Criterion = {
  id: string;
  title: string;
  match: boolean;
  is_visual: boolean;
  checks: Check[];
  criterios: VisualCriterionItem[];
};

type SectionResult = {
  id: string;
  title: string;
  template_pages: number[];
  article_pages: number[];
  match: boolean;
  criteria: Criterion[];
};

type HybridSummary = {
  is_compliant: boolean;
  secoes_total: number;
  secoes_passed: number;
  description: string;
};

type HybridMetadata = {
  approach: string;
  model: string;
  template_file: string;
  article_file: string;
};

type HybridReport = {
  metadata: HybridMetadata;
  summary: HybridSummary;
  secoes: SectionResult[];
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function CriterionCard({ criterion }: { criterion: Criterion }) {
  return (
    <article className={`compliance-criterion-card ${criterion.is_visual ? "compliance-criterion-card--visual" : ""}`}>
      <div className="compliance-criterion-header">
        <h4>{criterion.title}</h4>
      </div>
      <div>
        <span className="compliance-tag">{criterion.is_visual ? "Verificação visual (IA)" : "Verificação determinística"}</span>{" "}
        <span className={`compliance-badge ${criterion.match ? "ok" : "bad"}`}>
          {criterion.match ? "Compatível" : "Divergência"}
        </span>
      </div>

      {criterion.is_visual && criterion.criterios.length > 0 && (
        <div className="compliance-visual-points">
          {criterion.criterios.map((item, index) => (
            <div className="compliance-visual-point" key={`${item.criterio}-${index}`}>
              <strong>{item.criterio}</strong>
              <p>{item.justificativa}</p>
            </div>
          ))}
        </div>
      )}

      {!criterion.is_visual && criterion.checks.length > 0 && (
        <table className="compliance-check-table">
          <thead>
            <tr>
              <th>Campo</th>
              <th>Template</th>
              <th>Artigo</th>
            </tr>
          </thead>
          <tbody>
            {criterion.checks.map((check) => (
              <tr className={check.match ? "ok" : "bad"} key={check.field}>
                <td className="compliance-check-field">{check.field}</td>
                <td>{check.template_value}</td>
                <td>{check.article_value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

function SectionCard({ section }: { section: SectionResult }) {
  // Estado local: aberto por padrão só quando divergente (como o expander do
  // dashboard). Guardado aqui (e não recalculado a partir de `section.match`
  // a cada render) para não fechar/reabrir a seção sozinha a cada atualização
  // do polling enquanto o usuário está lendo ou rolando o conteúdo.
  const [isOpen, setIsOpen] = useState(!section.match);

  return (
    <details
      className={`compliance-section-card compliance-section-toggle ${section.match ? "ok" : "bad"}`}
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="compliance-section-summary">
        <span className="compliance-section-summary-main">
          <span className={`compliance-status-dot ${section.match ? "ok" : "bad"}`} />
          <h3>{section.title}</h3>
          <span className={`compliance-badge ${section.match ? "ok" : "bad"}`}>
            {section.match ? "Compatível" : "Divergência"}
          </span>
        </span>
        <ChevronDown className="compliance-section-chevron" size={18} />
      </summary>
      <div className="compliance-section-body">
        <div className="compliance-criteria-grid">
          {section.criteria.map((criterion) => (
            <CriterionCard criterion={criterion} key={criterion.id} />
          ))}
        </div>
      </div>
    </details>
  );
}

export default function ConformidadeTemplatePage() {
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
        const data = await fetchTemplateComplianceResult(selectedEntry!.externalDocumentId);
        if (cancelled) return;
        setResult(data);
        setResultState("idle");
        if (data?.status !== "processing" && interval) {
          window.clearInterval(interval);
          interval = undefined;
        }
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Não foi possível consultar a conformidade com o template."
        );
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

  const report = result?.status === "completed" ? (result.report as unknown as HybridReport) : null;

  return (
    <section className="compliance-screen">
      <div className="compliance-header">
        <span className="projects-kicker">Conformidade com Template</span>
        <h1>Conformidade com Template</h1>
        <p>
          Selecione um artigo enviado na tela Documentos para visualizar a comparação com o template escolhido
          (elementos pré-textuais, textuais e pós-textuais), feita via IA e verificação determinística.
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
              <FileCheck2 size={32} />
              <strong>Selecione um artigo</strong>
              <span>Escolha um artigo na lista ao lado para ver o resultado da comparação com o template.</span>
            </div>
          )}

          {selectedEntry && resultState === "loading" && !result && (
            <div className="compliance-state">
              <Loader2 className="spin" size={28} />
              <span>Consultando a conformidade com o template...</span>
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
              <span>Envie novamente o PDF na tela Documentos para disparar a comparação com o template.</span>
            </div>
          )}

          {selectedEntry && result?.status === "processing" && (
            <div className="compliance-state">
              <Loader2 className="spin" size={28} />
              <strong>Comparando com o template...</strong>
              <span>A verificação visual e determinística por seção pode levar alguns instantes.</span>
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
                    {report.summary.secoes_passed}/{report.summary.secoes_total}
                  </strong>
                  <span>Seções compatíveis</span>
                </div>
              </div>

              {report.secoes.map((section) => (
                <SectionCard key={section.id} section={section} />
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
