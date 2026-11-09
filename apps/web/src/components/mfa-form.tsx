"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AuthSession } from "@invictus/contracts";
import { ShieldCheck, ArrowRight, LoaderCircle, LogOut } from "lucide-react";
import { authRequest } from "../lib/auth-client";
export function MfaForm({ session }: { session: AuthSession }) {
  const router = useRouter();
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setup = session.stage !== "mfa_challenge";
  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await authRequest<{ qr: string; secret: string }>(
        "mfa/enroll",
        session.stage === "authenticated"
          ? { password: form.get("password") }
          : {},
        session.csrf,
      );
      setQr(result.qr);
      setSecret(result.secret);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Não foi possível preparar.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await authRequest("mfa/verify", { code: form.get("code") }, session.csrf);
      router.replace("/");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Código inválido.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await authRequest("logout", {}, session.csrf);
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Não foi possível sair. Tente novamente.");
    }
  }
  return (
    <>
      <span className="auth-card-icon">
        <ShieldCheck size={28} />
      </span>
      <span className="auth-label">UMA CAMADA EXTRA DE SEGURANÇA</span>
      <h2>{setup ? "Proteja sua conta" : "Confirme seu acesso"}</h2>
      <p className="auth-description">
        {setup
          ? "Configure seu aplicativo autenticador. Esta proteção é obrigatória para o administrador."
          : "Digite o código de seis números do seu aplicativo autenticador."}
      </p>
      {setup && !qr && (
        <form className="auth-form" onSubmit={enroll}>
          {session.stage === "authenticated" && (
            <>
              <label htmlFor="mfa-password">Confirme sua senha</label>
              <input
                className="auth-plain-input"
                id="mfa-password"
                type="password"
                name="password"
                autoComplete="current-password"
                maxLength={256}
                required
              />
            </>
          )}
          <button className="auth-submit" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <ShieldCheck size={18} />
            )}
            Configurar autenticador
          </button>
        </form>
      )}
      {qr && (
        <div className="mfa-setup">
          <img
            src={qr}
            alt="QR Code para configurar o aplicativo autenticador"
            width={200}
            height={200}
          />
          <details>
            <summary>Não consegue ler o QR Code?</summary>
            <p>Insira esta chave manualmente no seu autenticador:</p>
            <code>{secret}</code>
          </details>
        </div>
      )}
      {(!setup || qr) && (
        <form className="auth-form" onSubmit={verify}>
          <label htmlFor="mfa-code">Código de autenticação</label>
          <input
            id="mfa-code"
            name="code"
            className="auth-plain-input mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            placeholder="000000"
            required
          />
          <button className="auth-submit" disabled={busy}>
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <ArrowRight size={18} />
            )}
            Confirmar e entrar
          </button>
        </form>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button className="auth-back" onClick={() => void logout()}>
        <LogOut size={16} />
        Sair e entrar com outra conta
      </button>
    </>
  );
}
