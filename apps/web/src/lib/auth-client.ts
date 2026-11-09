import type { AuthSession } from "@invictus/contracts";
export class AuthClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function authRequest<T = AuthSession>(
  path: string,
  body?: unknown,
  csrf?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/v1/auth/" + path, {
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
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new AuthClientError(
      "Não foi possível conectar ao serviço de acesso. Confira sua conexão e tente novamente.",
      0,
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new AuthClientError(
      data?.message || "Não foi possível conectar. Tente novamente.",
      response.status,
    );
  return data as T;
}
