import type { Metadata } from "next";
import { AuthFrame } from "../../components/auth-frame";
import { LoginForm } from "../../components/login-form";
export const metadata: Metadata = { title: "Entrar | Invictus ERP Comercial" };
export default function Login() {
  return (
    <AuthFrame>
      <LoginForm />
    </AuthFrame>
  );
}
