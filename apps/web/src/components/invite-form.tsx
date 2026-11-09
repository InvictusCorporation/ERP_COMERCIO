"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mail, CheckCircle2 } from "lucide-react";
import type { InvitePreview, AuthSession } from "@invictus/contracts";
import { accessRequest } from "../lib/access-client";
import { authRequest } from "../lib/auth-client";
import "../app/access.css";
export function InviteForm() {
  const [token, setToken] = useState("");
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const fragment = useRef<string | null>(null);
  useEffect(() => {
    if (fragment.current === null)
      fragment.current =
        new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    const value = fragment.current;
    window.history.replaceState(null, "", window.location.pathname);
    setToken(value);
    let cancelled = false;
    async function load() {
      try {
        if (!/^[a-f0-9]{64}$/.test(value))
          throw new Error("Convite inválido. Abra o link recebido por e-mail.");
        const [preview, current] = await Promise.all([
          accessRequest<InvitePreview>("invitations/preview", { token: value }),
          authRequest<AuthSession>("session").catch(() => null),
        ]);
        if (!cancelled) {
          setInvite(preview);
          setSession(current);
        }
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : "Não foi possível consultar o convite.",
          );
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);
  async function accept(e: React.FormEvent) {
    e.preventDefault();
    if (!invite?.existingAccount && password !== confirm) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await accessRequest(
        "invitations/accept",
        { token, ...(!invite?.existingAccount ? { password } : {}) },
        session?.csrf,
      );
      // O aceite não autentica a pessoa nem altera dados renderizados pelo servidor.
      // Refresh aqui pode restaurar o fragmento antigo do estado de navegação.
      window.history.replaceState(null, "", window.location.pathname);
      setDone(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível aceitar o convite.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <div className="invite-actions">
        <CheckCircle2 size={40} color="#39843b" />
        <h1>Você faz parte da equipe.</h1>
        <p>
          Seu vínculo foi criado. Entre no sistema para começar; perfis
          administrativos precisam concluir a autenticação em duas etapas.
        </p>
        <Link className="button primary" href={session ? "/" : "/login"}>
          Continuar
        </Link>
      </div>
    );
  return (
    <>
      <div className="auth-card-icon">
        <Mail size={25} />
      </div>
      <span className="auth-label">CONVITE PARA A EQUIPE</span>
      <h1>Seu acesso ao Invictus</h1>
      <p className="auth-description">
        Confira a empresa e o perfil antes de aceitar.
      </p>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {busy && !invite && <p role="status">Consultando convite…</p>}
      {invite && (
        <>
          <div className="invite-details">
            <small>Empresa</small>
            <strong>{invite.company}</strong>
            <span>
              {invite.name} · {invite.email}
            </span>
            <small>Perfil: {invite.role}</small>
          </div>
          <form onSubmit={accept} className="auth-form invite-form">
            {invite.existingAccount ? (
              <p>
                Este e-mail já possui uma conta. Entre com ela e abra novamente
                o link do convite para confirmar o vínculo.
              </p>
            ) : session ? (
              <p>
                Saia da conta atual e abra novamente o link para cadastrar este
                novo acesso.
              </p>
            ) : (
              <>
                <label htmlFor="invite-password">
                  Crie sua senha
                  <input
                    id="invite-password"
                    type="password"
                    minLength={12}
                    maxLength={256}
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <small>Use de 12 a 128 caracteres.</small>
                <label htmlFor="invite-confirm">
                  Confirme a senha
                  <input
                    id="invite-confirm"
                    type="password"
                    minLength={12}
                    maxLength={256}
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </label>
              </>
            )}
            {(!invite.existingAccount && !session) ||
            (invite.existingAccount &&
              session?.user.email === invite.email &&
              session.stage === "authenticated") ? (
              <button className="button primary" disabled={busy}>
                {busy ? "Confirmando…" : "Aceitar convite"}
              </button>
            ) : (
              <Link href={session ? "/seguranca" : "/login"}>
                {session ? "Acesso e segurança" : "Entrar na minha conta"}
              </Link>
            )}
          </form>
        </>
      )}
      <Link className="auth-back" href="/login">
        Voltar ao login
      </Link>
    </>
  );
}
