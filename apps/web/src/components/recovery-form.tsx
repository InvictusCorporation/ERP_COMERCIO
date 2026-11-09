"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Mail,
  ArrowLeft,
  ArrowRight,
  CheckCheck,
  KeyRound,
  LoaderCircle,
} from "lucide-react";
import { authRequest } from "../lib/auth-client";
export function RecoveryForm({ reset = false }: { reset?: boolean }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const loaded = useRef(false);
  useEffect(() => {
    if (!reset || loaded.current) return;
    loaded.current = true;
    setToken(
      new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
    );
    window.history.replaceState(null, "", window.location.pathname);
  }, [reset]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    if (reset && data.get("password") !== data.get("confirm")) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      if (reset)
        await authRequest("reset-password", {
          token,
          password: data.get("password"),
          ...(data.get("code") ? { code: data.get("code") } : {}),
        });
      else await authRequest("forgot-password", { email: data.get("email") });
      setDone(true);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Não foi possível concluir.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <span className="auth-card-icon">
        {done ? (
          <CheckCheck size={27} />
        ) : reset ? (
          <KeyRound size={27} />
        ) : (
          <Mail size={27} />
        )}
      </span>
      <span className="auth-label">ACESSO AO SEU ERP</span>
      <h2>
        {done
          ? reset
            ? "Senha redefinida"
            : "Confira seu e-mail"
          : reset
            ? "Crie uma nova senha"
            : "Recuperar acesso"}
      </h2>
      <p className="auth-description">
        {done
          ? reset
            ? "Entre novamente com sua nova senha. As sessões anteriores foram encerradas."
            : "Se o e-mail estiver cadastrado, você receberá as instruções de recuperação. Use o link mais recente, válido por 30 minutos."
          : reset
            ? "Escolha uma senha de 12 a 128 caracteres para proteger sua conta."
            : "Informe o e-mail da sua conta para receber as instruções de recuperação."}
      </p>
      {!done && (
        <form className="auth-form" onSubmit={submit}>
          {reset ? (
            <>
              {!token && (
                <p className="auth-warning">
                  Abra esta página pelo link de recuperação recebido.
                </p>
              )}
              <label htmlFor="new-password">Nova senha</label>
              <input
                id="new-password"
                className="auth-plain-input"
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
                required
              />
              <label htmlFor="confirm-password">Confirme a nova senha</label>
              <input
                id="confirm-password"
                className="auth-plain-input"
                type="password"
                name="confirm"
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
                required
              />
              <label htmlFor="reset-code">
                Código de autenticação <span>(se ativada)</span>
              </label>
              <input
                id="reset-code"
                className="auth-plain-input"
                name="code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="Código do seu autenticador"
              />
              <p className="auth-field-note">
                Se sua conta usa duas etapas, informe um código novo do
                aplicativo autenticador.
              </p>
            </>
          ) : (
            <>
              <label htmlFor="recovery-email">E-mail cadastrado</label>
              <div className="auth-input">
                <Mail size={19} />
                <input
                  id="recovery-email"
                  type="email"
                  name="email"
                  placeholder="voce@empresa.com.br"
                  autoComplete="username"
                  maxLength={254}
                  required
                />
              </div>
            </>
          )}
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button className="auth-submit" disabled={busy || (reset && !token)}>
            {busy ? (
              <LoaderCircle size={19} className="spin" />
            ) : (
              <ArrowRight size={18} />
            )}{" "}
            {busy
              ? "Aguarde…"
              : reset
                ? "Salvar nova senha"
                : "Enviar instruções"}
          </button>
        </form>
      )}
      <Link href="/login" className="auth-back">
        <ArrowLeft size={16} />
        Voltar ao login
      </Link>
    </>
  );
}
