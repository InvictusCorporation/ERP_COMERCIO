"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
import { authRequest } from "../lib/auth-client";
export function LoginForm() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const session = await authRequest("login", {
        email: data.get("email"),
        password: data.get("password"),
      });
      router.replace(
        session.stage === "authenticated" ? "/" : "/verificar-acesso",
      );
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Não foi possível entrar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <span className="auth-card-icon">
        <LockKeyhole size={27} />
      </span>
      <span className="auth-label">BEM-VINDO AO INVICTUS</span>
      <h2>Acesse sua conta</h2>
      <p className="auth-description">Entre para gerenciar seu negócio.</p>
      <form onSubmit={submit} className="auth-form">
        <label htmlFor="email">E-mail</label>
        <div className="auth-input">
          <Mail size={19} />
          <input
            id="email"
            name="email"
            type="email"
            placeholder="voce@empresa.com.br"
            autoComplete="username"
            maxLength={254}
            required
            autoCapitalize="none"
          />
        </div>
        <label htmlFor="password">Senha</label>
        <div className="auth-input">
          <LockKeyhole size={19} />
          <input
            id="password"
            name="password"
            type={visible ? "text" : "password"}
            placeholder="Digite sua senha"
            autoComplete="current-password"
            maxLength={256}
            required
          />
          <button
            type="button"
            className="password-toggle"
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </div>
        <div className="auth-form-links">
          <Link href="/recuperar-acesso">Esqueci minha senha</Link>
        </div>
        {error && (
          <p role="alert" className="auth-error">
            {error}
          </p>
        )}
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? <LoaderCircle size={19} className="spin" /> : null}
          {busy ? "Entrando…" : "Entrar no sistema"}
          {!busy && <ArrowRight size={18} />}
        </button>
      </form>
      <div className="auth-account-note">
        <ShieldCheck size={19} />
        <p>
          Seu acesso é fornecido pelo
          <br />
          <strong>administrador da empresa.</strong>
        </p>
      </div>
    </>
  );
}
