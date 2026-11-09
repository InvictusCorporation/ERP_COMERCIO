import { AuthFrame } from "../../components/auth-frame";
import { InviteForm } from "../../components/invite-form";
export const metadata = {
  title: "Aceitar convite | Invictus ERP Comercial",
  referrer: "no-referrer",
};
export default function AcceptInvitation() {
  return (
    <AuthFrame>
      <InviteForm />
    </AuthFrame>
  );
}
