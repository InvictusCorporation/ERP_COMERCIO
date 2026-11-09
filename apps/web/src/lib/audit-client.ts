import { AuthClientError } from "./auth-client";
export async function auditRequest<T>(
  path: string,
  params: Record<string, string> = {},
) {
  let response: Response;
  try {
    response = await fetch(
      "/api/v1/audit/" + path + "?" + new URLSearchParams(params),
      {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new AuthClientError(
      "Não foi possível conectar ao histórico. Tente novamente.",
      0,
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new AuthClientError(
      data?.message || "Não foi possível consultar o histórico.",
      response.status,
    );
  return data as T;
}
