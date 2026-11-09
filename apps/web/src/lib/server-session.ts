import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthSession } from "@invictus/contracts";
export async function serverSession(): Promise<AuthSession | null> {
  const cookie = (await cookies()).toString();
  if (!cookie) redirect("/login");
  let response: Response;
  try {
    response = await fetch(
      (process.env.API_INTERNAL_URL || "http://127.0.0.1:3333") +
        "/api/v1/auth/session",
      {
        headers: { cookie },
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      },
    );
  } catch {
    return null;
  }
  if (response.status === 401) redirect("/login");
  if (!response.ok) return null;
  return response.json() as Promise<AuthSession>;
}
