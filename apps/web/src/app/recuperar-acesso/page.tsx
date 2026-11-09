import { AuthFrame } from "../../components/auth-frame";
import { RecoveryForm } from "../../components/recovery-form";
export const metadata = { title: "Recuperar acesso | Invictus ERP Comercial" };
export default function Recovery() {
  return (
    <AuthFrame>
      <RecoveryForm />
    </AuthFrame>
  );
}
