import {
  ShieldCheck,
  Store,
  ShoppingCart,
  Building2,
  Smartphone,
} from "lucide-react";
import type { ReactNode } from "react";
import "../app/auth.css";
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-brand-panel" aria-label="Invictus ERP Comercial">
        <div className="auth-brand">
          <ShieldCheck size={54} strokeWidth={1.8} />
          <div>
            <strong>INVICTUS</strong>
            <span>ERP COMERCIAL</span>
          </div>
        </div>
        <div className="auth-brand-copy">
          <span className="auth-kicker">GESTÃO COMPLETA. DO SEU JEITO.</span>
          <h1>
            Do balcão à rede
            <br />
            de lojas.
            <br />
            <em>Tudo conectado.</em>
          </h1>
          <p>
            Uma plataforma para acompanhar
            <br />
            cada etapa do seu negócio.
          </p>
          <div className="auth-segments">
            {[
              [Store, "Comércio simples"],
              [ShoppingCart, "Supermercados"],
              [Building2, "Matriz e filiais"],
              [Smartphone, "PDV mobile"],
            ].map(([Icon, label]) => {
              const I = Icon as typeof Store;
              return (
                <div key={String(label)}>
                  <I size={22} />
                  <span>{String(label)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="auth-brand-footer">
          <span>
            INVICTUS <strong>SYSTEMS</strong>
          </span>
          <small>Tecnologia para o seu negócio crescer.</small>
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-card">{children}</div>
        <p className="auth-footer">© 2026 Invictus Systems · ERP Comercial</p>
      </section>
    </main>
  );
}
