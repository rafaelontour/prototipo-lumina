const fallbackApiBaseUrl = "https://api.lumina.acerola.dev.br";

export const externalApiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackApiBaseUrl).replace(/\/$/, "");
export const apiBaseUrl = "/api/backend";

export function apiUrl(path: string) {
  return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
