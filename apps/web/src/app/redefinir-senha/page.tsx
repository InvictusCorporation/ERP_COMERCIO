import { AuthFrame } from "../../components/auth-frame";
import { RecoveryForm } from "../../components/recovery-form";
export const metadata = {
  title: "Nova senha | Invictus ERP Comercial",
  referrer: "no-referrer" as const,
};
export default function Reset() {
  return (
    <AuthFrame>
      <RecoveryForm reset />
    </AuthFrame>
  );
}
