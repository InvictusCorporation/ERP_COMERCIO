import { AuthClientError } from "./auth-client";
export async function accessRequest<T>(
  path: string,
  body?: unknown,
  csrf?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/v1/access/" + path, {
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
    throw new AuthClientError("Não foi possível conectar. Tente novamente.", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new AuthClientError(
      data?.message || "Não foi possível concluir esta ação.",
      response.status,
    );
  return data as T;
}
