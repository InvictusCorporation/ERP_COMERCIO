import { AuthClientError } from "./auth-client";
export async function lotsRequest<T>(
  path: string,
  body?: unknown,
  csrf?: string,
): Promise<T> {
  let r: Response;
  try {
    r = await fetch("/api/v1/lots/" + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers:
        body === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              ...(csrf ? { "X-CSRF-Token": csrf } : {}),
            },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new AuthClientError(
      "Não foi possível conectar. Confira sua conexão e tente novamente.",
      0,
    );
  }
  const result = await r.json().catch(() => null);
  if (!r.ok)
    throw new AuthClientError(
      result?.message || "Não foi possível concluir esta operação.",
      r.status,
    );
  return result as T;
}
