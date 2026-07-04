import { apiUrl } from "@/lib/api";

export const loginCredentials = {
  username: "rafael@gmail.com",
  password: "12345"
};

export async function readApiError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (typeof data?.detail === "string") return data.detail;
  if (Array.isArray(data?.detail) && data.detail[0]?.msg) return String(data.detail[0].msg);
  if (typeof data?.message === "string") return data.message;
  if (typeof data?.error === "string") return data.error;
  return fallback;
}

export async function signInWithFixedCredentials() {
  const response = await fetch(apiUrl("/auth/sign-in"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(loginCredentials)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Não foi possível fazer login."));
  }
}
