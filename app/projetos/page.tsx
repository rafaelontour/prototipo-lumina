"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  BookCheck,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileWarning,
  FilePlus2,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
  UploadCloud
} from "lucide-react";
import { apiBaseUrl, apiUrl } from "@/lib/api";
import { readApiError, signInWithFixedCredentials } from "@/lib/auth";
import { fetchTemplateOptions, sendAbntCompliance, sendTemplateCompliance } from "@/lib/compliance";
import type { PublicDocumentRecord } from "@/lib/types";

type ProjectKind = string;
type ProjectFilter = "Todos" | ProjectKind;
type ComponentKey = string;
type ReviewStatus = "pending" | "needs_review" | "ok";

type ApiUser = {
  id: string;
  username: string;
  email: string;
};

type Typification = {
  id: string;
  name: string;
  document_group_id: string | null;
  document_group_item_id: string | null;
};

type TypificationResponse = {
  typifications: Typification[];
};

type ExternalDocument = {
  id: string;
  name: string;
};

type ExternalRelease = {
  id: string;
  file_path: string;
  check_tree?: unknown[];
};

type ExternalReleaseResponse = {
  releases: ExternalRelease[];
};

type DocumentGroupItem = {
  name: string;
  icon_path: string | null;
  id: string;
  group_id: string;
  created_at: string;
  updated_at: string | null;
};

type DocumentGroup = {
  name: string;
  id: string;
  items: DocumentGroupItem[];
  created_at: string;
  updated_at: string | null;
};

type DocumentGroupsResponse = {
  groups: DocumentGroup[];
};

type ProjectVersion = {
  id: string;
  documentId: string;
  externalDocumentId?: string;
  externalReleaseId?: string;
  analysisStatus?: "pending" | "ready";
  analysisCheckedAt?: string;
  fileName: string;
  uploadedAt: string;
  pageCount: number;
  feedbackCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  status: Exclude<ReviewStatus, "pending">;
};

type ProjectComponent = {
  key: ComponentKey;
  label: string;
  description: string;
  itemId?: string;
  groupId?: string;
  iconPath?: string | null;
  versions: ProjectVersion[];
};

type Project = {
  id: string;
  title: string;
  kind: ProjectKind;
  groupId?: string;
  createdAt: string;
  components: ProjectComponent[];
};

const documentGroupsUrl = apiUrl("/document-group");
const storageKey = "lumina-projects-v1";
const pendingAnalysisStorageKey = "lumina-pending-analysis-v1";
const indexedDbName = "lumina-projects-db";
const indexedDbStore = "project-state";
const indexedDbProjectsKey = "projects";

function createProject(title: string, group: DocumentGroup): Project {
  return {
    id: crypto.randomUUID(),
    title,
    kind: group.name,
    groupId: group.id,
    createdAt: new Date().toISOString(),
    components: group.items.map((item) => ({
      key: item.id,
      itemId: item.id,
      groupId: item.group_id,
      iconPath: item.icon_path,
      label: item.name,
      description: `Envie o arquivo correspondente à seção ${item.name}.`,
      versions: []
    }))
  };
}

function groupSummary(group: DocumentGroup) {
  if (group.items.length === 0) return "Nenhuma seção cadastrada.";
  return group.items.map((item) => item.name).join(", ");
}

function latestVersion(component: ProjectComponent) {
  return component.versions[0];
}

function componentStatus(component: ProjectComponent): ReviewStatus {
  const latest = latestVersion(component);
  if (!latest) return "pending";
  return latest.status;
}

function isProjectComplete(project: Project) {
  return project.components.every((component) => componentStatus(component) === "ok");
}

// A conformidade com template/ABNT (docs/integracao-abnt-template.md) só se aplica à
// seção "Artigo" da submissão -- não à Cover Letter.
function isArticleComponent(component: ProjectComponent) {
  return component.label.trim().toLowerCase().includes("artigo");
}

function buildVersion(
  documentRecord: PublicDocumentRecord,
  externalDocument?: ExternalDocument,
  externalRelease?: ExternalRelease
): ProjectVersion {
  const highCount = documentRecord.feedbacks.filter((feedback) => feedback.severity === "high").length;
  const mediumCount = documentRecord.feedbacks.filter((feedback) => feedback.severity === "medium").length;
  const lowCount = documentRecord.feedbacks.filter((feedback) => feedback.severity === "low").length;
  const status = highCount === 0 && mediumCount === 0 ? "ok" : "needs_review";

  return {
    id: crypto.randomUUID(),
    documentId: documentRecord.id,
    externalDocumentId: externalDocument?.id,
    externalReleaseId: externalRelease?.id,
    analysisStatus: externalRelease ? (hasAiGeneratedContent(externalRelease) ? "ready" : "pending") : undefined,
    analysisCheckedAt: externalRelease ? new Date().toISOString() : undefined,
    fileName: documentRecord.name,
    uploadedAt: new Date().toISOString(),
    pageCount: documentRecord.pageCount,
    feedbackCount: documentRecord.feedbacks.length,
    highCount,
    mediumCount,
    lowCount,
    status
  };
}

function hasAiGeneratedContent(release?: ExternalRelease) {
  return Array.isArray(release?.check_tree) && release.check_tree.length > 0;
}

function selectAnalyzedRelease(releases: ExternalRelease[], preferredReleaseId?: string) {
  const preferredRelease = releases.find((release) => release.id === preferredReleaseId);
  if (hasAiGeneratedContent(preferredRelease)) return preferredRelease;
  return releases.find(hasAiGeneratedContent);
}

async function fetchCurrentUser() {
  const response = await fetch(`${apiBaseUrl}/user/my`, {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Faça login antes de enviar o documento."));
  }

  return (await response.json()) as ApiUser;
}

async function fetchCurrentUserWithAutoLogin() {
  const response = await fetch(`${apiBaseUrl}/user/my`, {
    credentials: "include"
  });

  if (response.ok) {
    return (await response.json()) as ApiUser;
  }

  if (response.status !== 401) {
    throw new Error(await readApiError(response, "Não foi possível identificar o usuário atual."));
  }

  await signInWithFixedCredentials();
  return fetchCurrentUser();
}

async function fetchTypifications() {
  const response = await fetch(`${apiBaseUrl}/typification?limit=100`, {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Não foi possível buscar as tipificações."));
  }

  const data = (await response.json()) as TypificationResponse;
  return Array.isArray(data.typifications) ? data.typifications : [];
}

function selectTypificationId(project: Project, component: ProjectComponent, typifications: Typification[]) {
  const byItem = typifications.find((typification) => typification.document_group_item_id === component.itemId);
  if (byItem) return byItem.id;

  const byGroup = typifications.find((typification) => typification.document_group_id === project.groupId);
  if (byGroup) return byGroup.id;

  return typifications[0]?.id;
}

async function createExternalDocument({
  project,
  component,
  file,
  editorId,
  typificationId
}: {
  project: Project;
  component: ProjectComponent;
  file: File;
  editorId: string;
  typificationId: string;
}) {
  const createdAt = new Date().toISOString();
  const response = await fetch(`${apiBaseUrl}/doc`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: `${project.title} - ${component.label} - ${createdAt}`,
      identifier: crypto.randomUUID(),
      description: `Documento enviado para análise da seção ${component.label}. Arquivo original: ${file.name}.`,
      typification_ids: [typificationId],
      editors_ids: [editorId]
    })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Não foi possível criar o documento na API."));
  }

  return (await response.json()) as ExternalDocument;
}

async function sendExternalRelease(documentId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${apiBaseUrl}/doc/${documentId}/release`, {
    method: "POST",
    credentials: "include",
    body: formData
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Não foi possível enviar o arquivo para a API."));
  }

  return (await response.json()) as ExternalRelease;
}

async function fetchExternalReleases(documentId: string) {
  let response = await fetch(`${apiBaseUrl}/doc/${documentId}/release`, {
    credentials: "include",
    cache: "no-store"
  });

  if (response.status === 401) {
    await signInWithFixedCredentials();
    response = await fetch(`${apiBaseUrl}/doc/${documentId}/release`, {
      credentials: "include",
      cache: "no-store"
    });
  }

  if (!response.ok) {
    throw new Error(await readApiError(response, "Não foi possível verificar a análise da IA."));
  }

  return (await response.json()) as ExternalReleaseResponse;
}

function openProjectsDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(indexedDbName, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(indexedDbStore)) {
        database.createObjectStore(indexedDbStore);
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function loadProjectsFromIndexedDb() {
  if (typeof window.indexedDB === "undefined") return null;

  const database = await openProjectsDatabase();
  return new Promise<Project[] | null>((resolve, reject) => {
    const transaction = database.transaction(indexedDbStore, "readonly");
    const store = transaction.objectStore(indexedDbStore);
    const request = store.get(indexedDbProjectsKey);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as Project[] | undefined) ?? null);
    transaction.oncomplete = () => database.close();
  });
}

async function saveProjectsToIndexedDb(projects: Project[]) {
  if (typeof window.indexedDB === "undefined") {
    window.localStorage.setItem(storageKey, JSON.stringify(projects));
    return;
  }

  const database = await openProjectsDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(indexedDbStore, "readwrite");
    const store = transaction.objectStore(indexedDbStore);
    const request = store.put(projects, indexedDbProjectsKey);

    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
  });

  window.localStorage.setItem(storageKey, JSON.stringify(projects));
}

export default function DocumentosPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectTitle, setProjectTitle] = useState("");
  const [documentGroups, setDocumentGroups] = useState<DocumentGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("Todos");
  const [projectSearch, setProjectSearch] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const [groupLoadError, setGroupLoadError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [templateOptions, setTemplateOptions] = useState<string[]>([]);
  const [selectedTemplateByComponent, setSelectedTemplateByComponent] = useState<Record<string, string>>({});

  useEffect(() => {
    void fetchTemplateOptions().then(setTemplateOptions);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateProjects() {
      try {
        const indexedDbProjects = await loadProjectsFromIndexedDb();
        if (cancelled) return;

        if (indexedDbProjects) {
          setProjects(indexedDbProjects);
          setIsStorageReady(true);
          return;
        }

        const storedProjects = window.localStorage.getItem(storageKey);
        if (storedProjects) {
          const parsedProjects = JSON.parse(storedProjects) as Project[];
          setProjects(parsedProjects);
          await saveProjectsToIndexedDb(parsedProjects);
        }
      } catch {
        const storedProjects = window.localStorage.getItem(storageKey);
        if (storedProjects && !cancelled) {
          setProjects(JSON.parse(storedProjects) as Project[]);
        }
      } finally {
        if (!cancelled) setIsStorageReady(true);
      }
    }

    void hydrateProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isStorageReady) return;
    void saveProjectsToIndexedDb(projects);
  }, [isStorageReady, projects]);

  const pendingAnalysisItems = useMemo(
    () =>
      projects.flatMap((project) =>
        project.components.flatMap((component) => {
          const latest = latestVersion(component);
          if (!latest?.externalDocumentId || latest.analysisStatus !== "pending") return [];
          return [
            {
              projectId: project.id,
              componentKey: component.key,
              versionId: latest.id,
              externalDocumentId: latest.externalDocumentId,
              externalReleaseId: latest.externalReleaseId
            }
          ];
        })
      ),
    [projects]
  );

  useEffect(() => {
    if (!isStorageReady) return;

    window.localStorage.setItem(
      pendingAnalysisStorageKey,
      JSON.stringify(
        pendingAnalysisItems.map((item) => ({
          documentId: item.externalDocumentId,
          releaseId: item.externalReleaseId
        }))
      )
    );
  }, [isStorageReady, pendingAnalysisItems]);

  useEffect(() => {
    if (!isStorageReady || pendingAnalysisItems.length === 0) return;

    let cancelled = false;

    async function checkPendingAnalyses() {
      await Promise.allSettled(
        pendingAnalysisItems.map(async (item) => {
          const data = await fetchExternalReleases(item.externalDocumentId);
          const analyzedRelease = selectAnalyzedRelease(data.releases ?? [], item.externalReleaseId);
          if (!analyzedRelease || cancelled) return;

          setProjects((currentProjects) =>
            currentProjects.map((project) => {
              if (project.id !== item.projectId) return project;

              return {
                ...project,
                components: project.components.map((component) => {
                  if (component.key !== item.componentKey) return component;

                  return {
                    ...component,
                    versions: component.versions.map((version) => {
                      if (version.id !== item.versionId) return version;
                      return {
                        ...version,
                        externalReleaseId: analyzedRelease.id,
                        analysisStatus: "ready",
                        analysisCheckedAt: new Date().toISOString()
                      };
                    })
                  };
                })
              };
            })
          );
        })
      );
    }

    void checkPendingAnalyses();
    const interval = window.setInterval(() => {
      void checkPendingAnalyses();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isStorageReady, pendingAnalysisItems]);

  const totals = useMemo(() => {
    const complete = projects.filter(isProjectComplete).length;
    return {
      complete,
      inReview: projects.length - complete
    };
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const normalizedSearch = projectSearch.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesKind = projectFilter === "Todos" || project.kind === projectFilter;
      if (!matchesKind) return false;

      if (!normalizedSearch) return true;

      return project.title.toLowerCase().includes(normalizedSearch);
    });
  }, [projectFilter, projectSearch, projects]);

  const projectFilters = useMemo<ProjectFilter[]>(() => {
    const dynamicFilters = documentGroups.map((group) => group.name);
    const storedFilters = projects.map((project) => project.kind);
    return ["Todos", ...Array.from(new Set([...dynamicFilters, ...storedFilters]))];
  }, [documentGroups, projects]);

  const selectedGroup = useMemo(
    () => documentGroups.find((group) => group.id === selectedGroupId) ?? null,
    [documentGroups, selectedGroupId]
  );

  async function loadDocumentGroups() {
    setIsLoadingGroups(true);
    setGroupLoadError("");

    try {
      const response = await fetch(documentGroupsUrl, {
        credentials: "include",
        cache: "no-store"
      });
      const data = (await response.json()) as DocumentGroupsResponse;

      if (!response.ok) {
        throw new Error("Não foi possível carregar os tipos de documento.");
      }

      const groups = Array.isArray(data.groups) ? data.groups : [];
      setDocumentGroups(groups);
      setSelectedGroupId("");
      if (groups.length === 0) {
        setGroupLoadError("Não há tipos de documentos criados.");
      }
    } catch (error) {
      setDocumentGroups([]);
      setSelectedGroupId("");
      setGroupLoadError(error instanceof Error ? error.message : "Não foi possível carregar os tipos de documento.");
    } finally {
      setIsLoadingGroups(false);
    }
  }

  function openCreateProject() {
    setProjectTitle("");
    setSelectedGroupId("");
    setIsCreatingProject(true);
    void loadDocumentGroups();
  }

  function addProject() {
    const title = projectTitle.trim();
    if (!title) {
      setStatusMessage("Informe um nome para salvar o documento.");
      return;
    }

    if (!selectedGroup) {
      setStatusMessage("Selecione um tipo de documento antes de nomear o documento.");
      return;
    }

    if (selectedGroup.items.length === 0) {
      setStatusMessage("O tipo selecionado não possui seções para envio.");
      return;
    }

    setProjects((currentProjects) => [createProject(title, selectedGroup), ...currentProjects]);
    setProjectTitle("");
    setSelectedGroupId("");
    setIsCreatingProject(false);
    setStatusMessage(`${selectedGroup.name} adicionado.`);
  }

  async function uploadComponent(projectId: string, componentKey: ComponentKey, file: File) {
    const target = `${projectId}:${componentKey}`;
    let placeholderVersionId: string | null = null;
    setUploadingTarget(target);
    setStatusMessage("Criando documento na API...");

    try {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("Envie um arquivo PDF.");
      }

      const project = projects.find((item) => item.id === projectId);
      const component = project?.components.find((item) => item.key === componentKey);

      if (!project || !component) {
        throw new Error("Não foi possível localizar a seção do documento.");
      }

      placeholderVersionId = crypto.randomUUID();
      const pendingVersion: ProjectVersion = {
        id: placeholderVersionId,
        documentId: "",
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        pageCount: 0,
        feedbackCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        status: "needs_review",
        analysisStatus: "pending",
        analysisCheckedAt: new Date().toISOString()
      };

      setProjects((currentProjects) =>
        currentProjects.map((project) => {
          if (project.id !== projectId) return project;

          return {
            ...project,
            components: project.components.map((component) => {
              if (component.key !== componentKey) return component;
              return {
                ...component,
                versions: [pendingVersion, ...component.versions]
              };
            })
          };
        })
      );

      const [currentUser, typifications] = await Promise.all([fetchCurrentUserWithAutoLogin(), fetchTypifications()]);
      const typificationId = selectTypificationId(project, component, typifications);

      if (!typificationId) {
        throw new Error("Nenhuma tipificação foi encontrada para criar o documento.");
      }

      const externalDocument = await createExternalDocument({
        project,
        component,
        file,
        editorId: currentUser.id,
        typificationId
      });

      setStatusMessage("Enviando arquivo para a API...");
      const externalRelease = await sendExternalRelease(externalDocument.id, file);

      // Conformidade com template e ABNT (docs/integracao-abnt-template.md): disparadas em
      // paralelo apenas para a seção "Artigo", sem bloquear o fluxo principal de release.
      if (isArticleComponent(component)) {
        const templateName = selectedTemplateByComponent[componentKey] ?? templateOptions[0];
        void Promise.allSettled([
          templateName ? sendTemplateCompliance(externalDocument.id, file, templateName) : Promise.resolve(),
          sendAbntCompliance(externalDocument.id, file)
        ]);
      }

      setStatusMessage("Processando PDF e gerando diagnóstico local...");
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/documents", {
        method: "POST",
        credentials: "include",
        body: formData
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível analisar o arquivo.");
      }

      const version = buildVersion(data.document as PublicDocumentRecord, externalDocument, externalRelease);
      setProjects((currentProjects) =>
        currentProjects.map((project) => {
          if (project.id !== projectId) return project;

          return {
            ...project,
            components: project.components.map((component) => {
              if (component.key !== componentKey) return component;
              const hasPlaceholderVersion = component.versions.some((currentVersion) => currentVersion.id === placeholderVersionId);
              return {
                ...component,
                versions: hasPlaceholderVersion
                  ? component.versions.map((currentVersion) =>
                      currentVersion.id === placeholderVersionId ? version : currentVersion
                    )
                  : [version, ...component.versions]
              };
            })
          };
        })
      );
      if (version.analysisStatus === "pending") {
        setStatusMessage("Documento enviado. Aguardando a análise da IA ficar disponível.");
      } else {
        setStatusMessage(version.status === "ok" ? "Versão aprovada pela análise da IA." : "A IA encontrou ajustes. Envie uma nova versão após revisar.");
      }
    } catch (error) {
      if (placeholderVersionId) {
        setProjects((currentProjects) =>
          currentProjects.map((project) => {
            if (project.id !== projectId) return project;

            return {
              ...project,
              components: project.components.map((component) => {
                if (component.key !== componentKey) return component;
                return {
                  ...component,
                  versions: component.versions.filter((version) => version.id !== placeholderVersionId)
                };
              })
            };
          })
        );
      }
      setStatusMessage(error instanceof Error ? error.message : "Erro inesperado no envio.");
    } finally {
      setUploadingTarget(null);
    }
  }

  function deleteProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;

    const confirmed = window.confirm(`Apagar o documento "${project.title}"? Esta ação remove o documento da lista e do IndexedDB.`);
    if (!confirmed) return;

    setProjects((currentProjects) => currentProjects.filter((item) => item.id !== projectId));
    setStatusMessage("documento apagado.");
  }

  return (
    <section className="projects-screen">
      <div className="projects-header">
        <div>
          <span className="projects-kicker">Documentos</span>
          <h1>Acompanhamento de Documentos</h1>
          <p>Escolha um tipo de documento, salve com um nome e envie as seções exigidas para análise da IA.</p>
        </div>
        <button className="primary-button project-open-create" type="button" onClick={openCreateProject}>
          <Plus size={18} />
          Adicionar documento
        </button>
      </div>

      {isCreatingProject && (
        <div className="project-create-overlay" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
          <div className="project-create-modal">
            <header className="project-create-modal-header">
              <div>
                <span className="projects-kicker">Novo documento</span>
                <h2 id="new-project-title">Escolha o tipo e informe um nome</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsCreatingProject(false)} aria-label="Fechar">
                <X size={18} />
              </button>
            </header>

            <div className="project-kind-picker" role="radiogroup" aria-label="Tipo de documento">
              {isLoadingGroups && (
                <div className="project-kind-state">
                  <Loader2 className="spin" size={20} />
                  <span>Carregando tipos de documento...</span>
                </div>
              )}
              {!isLoadingGroups && groupLoadError && (
                <div className="project-kind-state error">
                  <FileWarning size={20} />
                  <span>{groupLoadError}</span>
                  <button className="secondary-button" type="button" onClick={() => void loadDocumentGroups()}>
                    Tentar novamente
                  </button>
                </div>
              )}
              {!isLoadingGroups &&
                !groupLoadError &&
                documentGroups.map((group) => (
                  <button
                    className={`project-kind-option ${selectedGroupId === group.id ? "active" : ""}`}
                    key={group.id}
                    type="button"
                    onClick={() => {
                      setSelectedGroupId(group.id);
                      setProjectTitle("");
                    }}
                    role="radio"
                    aria-checked={selectedGroupId === group.id}
                  >
                    <strong>{group.name}</strong>
                    <span>{groupSummary(group)}</span>
                  </button>
                ))}
            </div>

            <label className="project-name-field">
              <span>Nome do documento</span>
              <input
                disabled={!selectedGroup}
                value={projectTitle}
                aria-label="Nome do documento"
                placeholder={selectedGroup ? `Ex.: ${selectedGroup.name} para revisão` : "Selecione um tipo de documento primeiro"}
                onChange={(event) => setProjectTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && projectTitle.trim() && selectedGroup) addProject();
                }}
              />
            </label>

            <div className="project-create-actions">
              <button className="secondary-button" type="button" onClick={() => setIsCreatingProject(false)}>
                Cancelar
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={!projectTitle.trim() || !selectedGroup || selectedGroup.items.length === 0}
                onClick={addProject}
              >
                Salvar documento
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="project-stats" aria-label="Resumo dos Documentos">
        <div>
          <strong>{projects.length}</strong>
          <span>Documentos cadastrados</span>
        </div>
        <div>
          <strong>{totals.complete}</strong>
          <span>Completos</span>
        </div>
        <div>
          <strong>{totals.inReview}</strong>
          <span>Em revisão</span>
        </div>
        <div>
          <strong>{filteredProjects.length}</strong>
          <span>Exibidos</span>
        </div>
      </div>

      <div className="project-filters">
        <div className="project-filter-group" aria-label="Filtrar por tipo de documento">
          {projectFilters.map((filter) => (
            <button
              className={projectFilter === filter ? "active" : ""}
              key={filter}
              type="button"
              onClick={() => setProjectFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
        <label className="project-search">
          <Search size={18} />
          <input
            aria-label="Pesquisar Documentos"
            value={projectSearch}
            placeholder="Pesquisar por nome do documento"
            onChange={(event) => setProjectSearch(event.target.value)}
          />
        </label>
      </div>

      <div className="status-line">{statusMessage}</div>

      {projects.length === 0 ? (
        <div className="projects-empty">
          <ClipboardCheck size={42} />
          <strong>Nenhum documento cadastrado</strong>
          <span>Adicione um documento, escolha o tipo e salve um nome para liberar os campos de envio.</span>
        </div>
      ) : (
        <div className="projects-list">
          {filteredProjects.length === 0 ? (
            <div className="projects-empty">
              <Search size={42} />
              <strong>Nenhum documento encontrado</strong>
              <span>Ajuste o tipo selecionado ou pesquise por outro termo.</span>
            </div>
          ) : (
            filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={deleteProject}
                uploadingTarget={uploadingTarget}
                onUpload={uploadComponent}
                templateOptions={templateOptions}
                selectedTemplateByComponent={selectedTemplateByComponent}
                onSelectTemplate={(componentKey, templateName) =>
                  setSelectedTemplateByComponent((current) => ({ ...current, [componentKey]: templateName }))
                }
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

function ProjectCard({
  project,
  onDelete,
  uploadingTarget,
  onUpload,
  templateOptions,
  selectedTemplateByComponent,
  onSelectTemplate
}: {
  project: Project;
  onDelete: (projectId: string) => void;
  uploadingTarget: string | null;
  onUpload: (projectId: string, componentKey: ComponentKey, file: File) => void;
  templateOptions: string[];
  selectedTemplateByComponent: Record<string, string>;
  onSelectTemplate: (componentKey: ComponentKey, templateName: string) => void;
}) {
  const complete = isProjectComplete(project);
  const okCount = project.components.filter((component) => componentStatus(component) === "ok").length;
  const componentTotal = project.components.length;

  return (
    <article className="project-card">
      <header className="project-card-header">
        <div>
          <span className="project-kind">{project.kind}</span>
          <h2>{project.title}</h2>
          <p>{okCount} de {componentTotal} partes aprovadas pela IA</p>
        </div>
        <div className="project-card-actions">
          <span className={`project-status ${complete ? "ok" : "needs_review"}`}>
            {complete ? <CheckCircle2 size={17} /> : <RotateCcw size={17} />}
            {complete ? "Completo" : "Em revisão"}
          </span>
          <button className="project-delete-button" type="button" onClick={() => onDelete(project.id)}>
            <Trash2 size={17} />
            Apagar
          </button>
        </div>
      </header>

      <div className="component-grid">
        {project.components.map((component) => {
          const latest = latestVersion(component);
          const status = componentStatus(component);
          const target = `${project.id}:${component.key}`;
          const isUploading = uploadingTarget === target;
          const isAnalysisPending = latest?.analysisStatus === "pending";
          const canUploadFile = !isUploading && !isAnalysisPending;
          const canAnalyzeWithAi = latest && !isUploading && !isAnalysisPending;
          const isArticle = isArticleComponent(component);
          const showComplianceLinks = isArticle && Boolean(latest?.externalDocumentId);
          const actionsCount = 1 + (canAnalyzeWithAi ? 1 : 0) + (showComplianceLinks ? 2 : 0);

          return (
            <section className="component-card" key={component.key}>
              <div className="component-card-top">
                <FileText size={22} />
                <span className={`component-status ${status}`}>
                  {status === "pending" ? "Pendente" : status === "ok" ? "OK da IA" : "Ajustes"}
                </span>
              </div>

              {isArticle && templateOptions.length > 0 && (
                <label className="project-artigo-template">
                  <span>Template</span>
                  <select
                    className="project-template-select"
                    value={selectedTemplateByComponent[component.key] ?? templateOptions[0]}
                    onChange={(event) => onSelectTemplate(component.key, event.target.value)}
                  >
                    {templateOptions.map((templateName) => (
                      <option key={templateName} value={templateName}>
                        {templateName}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <h3>{component.label}</h3>
              <p>{component.description}</p>

              {latest ? (
                <div className="version-summary">
                  <strong>{latest.fileName}</strong>
                  <span>
                    v{component.versions.length} · {latest.pageCount || "..."} pág. · {latest.feedbackCount} observação(ões)
                  </span>
                  <small>
                    Alta: {latest.highCount} · Média: {latest.mediumCount} · Baixa: {latest.lowCount}
                  </small>
                  {isAnalysisPending && (
                    <em className="analysis-waiting">
                      <Loader2 className="spin" size={14} />
                      Aguardando resposta da IA
                    </em>
                  )}
                </div>
              ) : (
                <div className="version-summary muted">
                  <strong>Nenhum arquivo enviado</strong>
                  <span>Envie a primeira versão em PDF para iniciar a análise.</span>
                </div>
              )}

              <div className={`project-component-actions ${actionsCount > 1 ? "" : "single-action"}`}>
                <label className={`project-upload-button ${canUploadFile ? "" : "disabled"}`} aria-disabled={!canUploadFile}>
                  {isUploading ? <Loader2 className="spin" size={18} /> : latest ? <FilePlus2 size={18} /> : <UploadCloud size={18} />}
                  {isUploading || isAnalysisPending ? "Analisando..." : latest ? "Enviar nova versão" : "Enviar PDF"}
                  <input
                    className="hidden-input"
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={!canUploadFile}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void onUpload(project.id, component.key, file);
                    }}
                  />
                </label>
                {canAnalyzeWithAi && (
                  <Link
                    className="project-ai-link"
                    href={`/oiac-ia?documentId=${encodeURIComponent(latest.documentId)}&project=${encodeURIComponent(project.title)}&component=${encodeURIComponent(component.label)}${latest.externalDocumentId ? `&externalDocumentId=${encodeURIComponent(latest.externalDocumentId)}` : ""}${latest.externalReleaseId ? `&externalReleaseId=${encodeURIComponent(latest.externalReleaseId)}` : ""}`}
                  >
                    <Bot size={18} />
                    Analisar com IA
                  </Link>
                )}
                {showComplianceLinks && (
                  <Link
                    className="project-ai-link"
                    href={`/conformidade-template?documentId=${encodeURIComponent(latest!.externalDocumentId!)}`}
                  >
                    <FileCheck2 size={18} />
                    Conformidade com template
                  </Link>
                )}
                {showComplianceLinks && (
                  <Link
                    className="project-ai-link"
                    href={`/conformidade-abnt?documentId=${encodeURIComponent(latest!.externalDocumentId!)}`}
                  >
                    <BookCheck size={18} />
                    Conformidade com ABNT
                  </Link>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}
