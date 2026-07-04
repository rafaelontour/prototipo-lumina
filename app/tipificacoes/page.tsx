"use client";

import { AlertCircle, GitBranch, Layers3, Loader2, Search, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api";

type Branch = {
  id: string;
  title: string;
  description: string;
};

type Taxonomy = {
  id: string;
  title: string;
  description: string;
  branches: Branch[];
};

type Typification = {
  id: string;
  name: string;
  document_group_id: string | null;
  document_group_item_id: string | null;
  taxonomies: Taxonomy[];
};

type TypificationResponse = {
  typifications: Typification[];
};

async function readApiError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (typeof data?.detail === "string") return data.detail;
  if (Array.isArray(data?.detail) && data.detail[0]?.msg) return String(data.detail[0].msg);
  if (typeof data?.message === "string") return data.message;
  if (typeof data?.error === "string") return data.error;
  return fallback;
}

export default function TipificacoesPage() {
  const [typifications, setTypifications] = useState<Typification[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTaxonomy, setSelectedTaxonomy] = useState<Taxonomy | null>(null);

  useEffect(() => {
    async function loadTypifications() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(apiUrl("/typification?limit=100"), {
          credentials: "include",
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error(await readApiError(response, "Não foi possível carregar as tipificações."));
        }

        const data = (await response.json()) as TypificationResponse;
        setTypifications(Array.isArray(data.typifications) ? data.typifications : []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar as tipificações.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadTypifications();
  }, []);

  useEffect(() => {
    if (!selectedTaxonomy) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedTaxonomy(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTaxonomy]);

  const filteredTypifications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return typifications;

    return typifications.filter((typification) => {
      if (typification.name.toLowerCase().includes(normalizedQuery)) return true;
      return typification.taxonomies.some(
        (taxonomy) =>
          taxonomy.title.toLowerCase().includes(normalizedQuery) ||
          taxonomy.branches.some((branch) => branch.title.toLowerCase().includes(normalizedQuery))
      );
    });
  }, [query, typifications]);

  const totals = useMemo(() => {
    const taxonomyCount = typifications.reduce((count, typification) => count + typification.taxonomies.length, 0);
    const branchCount = typifications.reduce(
      (count, typification) =>
        count + typification.taxonomies.reduce((branchTotal, taxonomy) => branchTotal + taxonomy.branches.length, 0),
      0
    );

    return {
      typificationCount: typifications.length,
      taxonomyCount,
      branchCount
    };
  }, [typifications]);

  return (
    <section className="typifications-screen">
      <div className="projects-header">
        <div>
          <span className="projects-kicker">Tipificações</span>
          <h1>Árvore de verificação</h1>
          <p>Visualize as tipificações cadastradas, suas taxonomias e os ramos usados na análise dos documentos.</p>
        </div>
      </div>

      <div className="project-stats" aria-label="Resumo das tipificações">
        <div>
          <strong>{totals.typificationCount}</strong>
          <span>Tipificações</span>
        </div>
        <div>
          <strong>{totals.taxonomyCount}</strong>
          <span>Taxonomias</span>
        </div>
        <div>
          <strong>{totals.branchCount}</strong>
          <span>Ramos</span>
        </div>
        <div>
          <strong>{filteredTypifications.length}</strong>
          <span>Exibidas</span>
        </div>
      </div>

      <label className="typification-search">
        <Search size={18} />
        <input
          aria-label="Pesquisar tipificações"
          value={query}
          placeholder="Pesquisar por tipificação, taxonomia ou ramo"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {isLoading ? (
        <div className="projects-empty">
          <Loader2 className="spin" size={42} />
          <strong>Carregando tipificações</strong>
          <span>Aguarde enquanto os dados são buscados na API.</span>
        </div>
      ) : error ? (
        <div className="projects-empty">
          <AlertCircle size={42} />
          <strong>Não foi possível carregar</strong>
          <span>{error}</span>
        </div>
      ) : filteredTypifications.length === 0 ? (
        <div className="projects-empty">
          <Search size={42} />
          <strong>Nenhuma tipificação encontrada</strong>
          <span>Ajuste a pesquisa para visualizar outros itens.</span>
        </div>
      ) : (
        <div className="typification-list">
          {filteredTypifications.map((typification) => (
            <article className="typification-card" key={typification.id}>
              <header className="typification-card-header">
                <div>
                  <span className="projects-kicker">Tipificação</span>
                  <h2>{typification.name}</h2>
                </div>
                <div className="typification-meta">
                  <span>
                    <Layers3 size={16} />
                    {typification.taxonomies.length} taxonomia(s)
                  </span>
                  <span>
                    <GitBranch size={16} />
                    {typification.taxonomies.reduce((count, taxonomy) => count + taxonomy.branches.length, 0)} ramo(s)
                  </span>
                </div>
              </header>

              <div className="taxonomy-grid">
                {typification.taxonomies.map((taxonomy) => (
                  <button
                    className="taxonomy-card"
                    key={taxonomy.id}
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setSelectedTaxonomy(taxonomy)}
                  >
                    <div className="taxonomy-card-header">
                      <ShieldCheck size={20} />
                      <div>
                        <span className="taxonomy-card-kicker">Taxonomia</span>
                        <h3>{taxonomy.title}</h3>
                        <p>{taxonomy.description}</p>
                      </div>
                    </div>

                    <span className="taxonomy-card-action">
                      <GitBranch size={16} />
                      Ver {taxonomy.branches.length} ramo(s)
                    </span>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {selectedTaxonomy && (
        <div
          className="taxonomy-modal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedTaxonomy(null);
            }
          }}
        >
          <div className="taxonomy-modal" role="dialog" aria-modal="true" aria-labelledby="taxonomy-modal-title">
            <header className="taxonomy-modal-header">
              <div>
                <span className="projects-kicker">Ramos da taxonomia</span>
                <h2 id="taxonomy-modal-title">{selectedTaxonomy.title}</h2>
                <p>{selectedTaxonomy.description}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setSelectedTaxonomy(null)} aria-label="Fechar">
                <X size={18} />
              </button>
            </header>

            <div className="branch-list taxonomy-modal-branches">
              {selectedTaxonomy.branches.length === 0 ? (
                <span className="branch-empty">Nenhum ramo cadastrado.</span>
              ) : (
                selectedTaxonomy.branches.map((branch) => (
                  <article className="branch-card" key={branch.id}>
                    <strong>{branch.title}</strong>
                    <p>{branch.description}</p>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
