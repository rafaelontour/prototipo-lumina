import { NextResponse } from "next/server";
import { externalApiBaseUrl } from "@/lib/api";

export const runtime = "nodejs";

const hopByHopHeaders = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

function proxyCookie(cookie: string, isHttpsRequest: boolean) {
  let nextCookie = cookie.replace(/;\s*Domain=[^;]*/i, "");

  if (!isHttpsRequest) {
    nextCookie = nextCookie.replace(/;\s*Secure/i, "").replace(/;\s*SameSite=None/i, "; SameSite=Lax");
  }

  return nextCookie;
}

async function handler(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const requestUrl = new URL(request.url);
  const upstreamUrl = `${externalApiBaseUrl}/${path.map(encodeURIComponent).join("/")}${requestUrl.search}`;
  const requestHeaders = new Headers(request.headers);

  for (const header of hopByHopHeaders) {
    requestHeaders.delete(header);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers: requestHeaders,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual"
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  for (const header of hopByHopHeaders) {
    responseHeaders.delete(header);
  }

  responseHeaders.delete("set-cookie");

  const getSetCookie = (upstreamResponse.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = getSetCookie ? getSetCookie.call(upstreamResponse.headers) : [];
  const fallbackCookie = cookies.length === 0 ? upstreamResponse.headers.get("set-cookie") : null;
  if (fallbackCookie) cookies.push(fallbackCookie);
  const isHttpsRequest = requestUrl.protocol === "https:";

  for (const cookie of cookies) {
    responseHeaders.append("Set-Cookie", proxyCookie(cookie, isHttpsRequest));
  }

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
