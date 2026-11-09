import type { Metadata } from "next";
import "./globals.css";
import "./auth.css";
export const metadata: Metadata = {
  title: "Invictus ERP Comercial | Visão geral",
  description:
    "Gestão para o seu comércio. Ambiente local de desenvolvimento do Invictus ERP Comercial.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
