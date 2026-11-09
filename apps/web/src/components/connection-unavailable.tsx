"use client";
import Link from "next/link";
import { RefreshCw, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
export function ConnectionUnavailable() {
  const router = useRouter();
  return (
    <main className="access-unavailable">
      <WifiOff size={40} />
      <h1>Não foi possível verificar seu acesso</h1>
      <p>
        Confira a conexão e tente novamente. Seus dados de acesso serão
        preservados.
      </p>
      <button className="button primary" onClick={() => router.refresh()}>
        <RefreshCw size={17} />
        Tentar novamente
      </button>
      <Link href="/login">Voltar ao login</Link>
    </main>
  );
}
