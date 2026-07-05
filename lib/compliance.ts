// Integração com os endpoints de Conformidade com Template e Normas ABNT
// (feature nova, ver docs/integracao-abnt-template.md). Usado pela tela de
// Documentos (para disparar as análises) e pelas novas seções do menu lateral
// (para consultar e exibir os resultados).

import { apiBaseUrl } from "@/lib/api";
import { readApiError } from "@/lib/auth";

export type ComplianceProcessingStatus = "processing" | "completed" | "error";

export type ComplianceResult = {
  doc_id: string;
  status: ComplianceProcessingStatus;
  updated_at: string;
  report: Record<string, unknown> | null;
  error: string | null;
};

// Mesmas chaves de armazenamento local usadas em app/projetos/page.tsx --
// lidas aqui apenas para listar os artigos já enviados (sem duplicar a
// lógica de escrita/edição de projetos, que continua exclusiva daquela tela).
const indexedDbName = "lumina-projects-db";
const indexedDbStore = "project-state";
const indexedDbProjectsKey = "projects";
const storageKey = "lumina-projects-v1";

type StoredVersion = {
  id: string;
  fileName: string;
  uploadedAt: string;
  externalDocumentId?: string;
};

type StoredComponent = {
  key: string;
  label: string;
  versions: StoredVersion[];
};

type StoredProject = {
  id: string;
  title: string;
  components: StoredComponent[];
};

export type ArticleEntry = {
  projectId: string;
  projectTitle: string;
  componentKey: string;
  versionId: string;
  fileName: string;
  uploadedAt: string;
  externalDocumentId: string;
};

function isArticleLabel(label: string) {
  return label.trim().toLowerCase().includes("artigo");
}

function loadProjectsFromIndexedDb(): Promise<StoredProject[] | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(indexedDbName, 1);
    request.onerror = () => resolve(null);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(indexedDbStore)) {
        database.createObjectStore(indexedDbStore);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      try {
        const transaction = database.transaction(indexedDbStore, "readonly");
        const store = transaction.objectStore(indexedDbStore);
        const getRequest = store.get(indexedDbProjectsKey);
        getRequest.onerror = () => resolve(null);
        getRequest.onsuccess = () => resolve((getRequest.result as StoredProject[] | undefined) ?? null);
        transaction.oncomplete = () => database.close();
      } catch {
        resolve(null);
      }
    };
  });
}

// Lista todas as versões da seção "Artigo" que já possuem um documento
// criado na API (pré-requisito para consultar/disparar as análises, já que
// o doc_id do backend é usado como chave dos resultados em JSON).
export async function listArticleEntries(): Promise<ArticleEntry[]> {
  let projects = await loadProjectsFromIndexedDb();

  if (!projects && typeof window !== "undefined") {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      try {
        projects = JSON.parse(stored) as StoredProject[];
      } catch {
        projects = null;
      }
    }
  }

  if (!projects) return [];

  const entries: ArticleEntry[] = [];
  for (const project of projects) {
    for (const component of project.components) {
      if (!isArticleLabel(component.label)) continue;
      for (const version of component.versions) {
        if (!version.externalDocumentId) continue;
        entries.push({
          projectId: project.id,
          projectTitle: project.title,
          componentKey: component.key,
          versionId: version.id,
          fileName: version.fileName,
          uploadedAt: version.uploadedAt,
          externalDocumentId: version.externalDocumentId
        });
      }
    }
  }

  return entries.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}

export async function fetchTemplateOptions(): Promise<string[]> {
  const response = await fetch(`${apiBaseUrl}/template-abnt/templates`, {
    credentials: "include",
    cache: "no-store"
  });

  if (!response.ok) return [];

  const data = (await response.json()) as { templates?: string[] };
  return Array.isArray(data.templates) ? data.templates : [];
}

export async function sendTemplateCompliance(docId: string, file: File, templateName: string): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("template_name", templateName);

  await fetch(`${apiBaseUrl}/template-abnt/${encodeURIComponent(docId)}/template`, {
    method: "POST",
    credentials: "include",
    body: formData
  });
}

export async function sendAbntCompliance(docId: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);

  await fetch(`${apiBaseUrl}/template-abnt/${encodeURIComponent(docId)}/abnt`, {
    method: "POST",
    credentials: "include",
    body: formData
  });
}

async function fetchComplianceResult(kind: "template" | "abnt", docId: string): Promise<ComplianceResult | null> {
  const response = await fetch(`${apiBaseUrl}/template-abnt/${encodeURIComponent(docId)}/${kind}`, {
    credentials: "include",
    cache: "no-store"
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    const label = kind === "template" ? "conformidade com o template" : "conformidade ABNT";
    throw new Error(await readApiError(response, `Não foi possível consultar a ${label}.`));
  }

  return (await response.json()) as ComplianceResult;
}

export function fetchTemplateComplianceResult(docId: string) {
  return fetchComplianceResult("template", docId);
}

export function fetchAbntComplianceResult(docId: string) {
  return fetchComplianceResult("abnt", docId);
}
