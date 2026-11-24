import { AuthClientError } from './auth-client';
export async function assistantRequest<T>(path: string, body?: unknown, csrf?: string): Promise<T> {
  try {
    const response = await fetch('/api/v1/assistant/' + path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf || '' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new AuthClientError(result?.message || 'Consulta indisponível.', response.status);
    if (!result) throw new AuthClientError('Resposta incompleta. Atualize a consulta.', 0);
    return result as T;
  } catch (e) {
    if (e instanceof AuthClientError) throw e;
    throw new AuthClientError('Não foi possível conectar. Confira a conexão e tente novamente.', 0);
  }
}
