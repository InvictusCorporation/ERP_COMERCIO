"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ShieldCheck,
  Monitor,
  KeyRound,
  LogOut,
  RefreshCw,
} from "lucide-react";
import type { AuthSession, SessionEntry } from "@invictus/contracts";
import { authRequest, AuthClientError } from "../lib/auth-client";
import "../app/auth.css";
const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Fortaleza",
  }).format(new Date(value));
export function SecurityPanel({ session }: { session: AuthSession }) {
  const router = useRouter();
  const [rows, setRows] = useState<SessionEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      setRows(await authRequest<SessionEntry[]>("sessions"));
    } catch (error) {
      if (error instanceof AuthClientError && error.status === 401) {
        router.replace("/login");
        router.refresh();
      } else
        setError(
          error instanceof Error
            ? error.message
            : "Não foi possível consultar as sessões.",
        );
    }
  }, [router]);
  useEffect(() => {
    void load();
  }, [load]);
  async function revoke(id?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await authRequest<{ ok: boolean; current?: boolean }>(
        id ? "sessions/revoke" : "sessions/revoke-all",
        id ? { sessionId: id } : {},
        session.csrf,
      );
      if (!id || result.current) {
        router.replace("/login");
        router.refresh();
      } else {
        await load();
        setNotice("Sessão encerrada.");
      }
    } catch (error) {
      if (error instanceof AuthClientError && error.status === 401) {
        router.replace("/login");
        router.refresh();
      } else
        setError(
          error instanceof Error ? error.message : "Não foi possível encerrar.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="security-shell">
      <div className="security-topbar">
        <Link href="/">
          <ArrowLeft size={18} />
          Voltar ao painel
        </Link>
        <div className="security-brand">
          <ShieldCheck size={24} />
          <span>INVICTUS ERP COMERCIAL</span>
        </div>
      </div>
      <div className="security-heading">
        <ShieldCheck size={36} />
        <div>
          <h1>Acesso e segurança</h1>
          <p>
            {session.user.name} · {session.user.email}
          </p>
        </div>
      </div>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="security-notice" role="status">
          {notice}
        </p>
      )}
      <section className="security-panel">
        <h2>
          <KeyRound size={21} />
          Autenticação em duas etapas
        </h2>
        <p>
          {session.user.mfaEnabled
            ? "Proteção ativada. Além da senha, sua conta exige o código do aplicativo autenticador."
            : "Adicione uma camada de proteção à sua conta usando um aplicativo autenticador."}
        </p>
        {!session.user.mfaEnabled && (
          <Link
            className="button primary"
            href="/verificar-acesso?configurar=1"
          >
            <ShieldCheck size={17} />
            Ativar duas etapas
          </Link>
        )}
      </section>
      <section className="security-panel">
        <h2>
          <Monitor size={21} />
          Sessões ativas
        </h2>
        <p>
          Confira onde sua conta está conectada. Ao encerrar uma sessão, será
          necessário entrar novamente naquele dispositivo.
        </p>
        {rows.map((row) => (
          <article className="security-session" key={row.id}>
            <Monitor size={24} />
            <div className="security-session-content">
              <strong>{row.userAgent || "Dispositivo não identificado"}</strong>
              <p>
                Início: {date(row.createdAt)}
                <br />
                Última atividade: {date(row.lastSeenAt)} · Horário de Fortaleza
              </p>
              {row.current && <span>Este dispositivo</span>}
            </div>
            <button disabled={busy} onClick={() => void revoke(row.id)}>
              {row.current ? "Sair deste dispositivo" : "Encerrar sessão"}
            </button>
          </article>
        ))}
        <button className="button secondary" onClick={() => void load()}>
          <RefreshCw size={16} />
          Atualizar sessões
        </button>
      </section>
      <section className="security-panel security-danger">
        <h2>
          <LogOut size={21} />
          Encerrar todos os acessos
        </h2>
        <p>
          Você sairá deste dispositivo e dos demais. Sua conta e os dados da
          empresa serão preservados.
        </p>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void revoke()}
        >
          Encerrar todas as sessões
        </button>
      </section>
    </main>
  );
}
