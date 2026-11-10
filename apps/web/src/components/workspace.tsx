"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authRequest } from "../lib/auth-client";
import {
  ArrowRight,
  ArrowDownToLine,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Package,
  RefreshCw,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
  TriangleAlert,
  Trophy,
  Users,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type {
  LivenessResponse,
  ReadinessResponse,
  AuthSession,
} from "@invictus/contracts";

type View = "dashboard" | "foundation" | "settings";
type Health = { api: boolean; database: boolean; checked: boolean };
const modules: [string, LucideIcon][] = [
  ["Vendas e PDV", ShoppingCart],
  ["Produtos", Package],
  ["Estoque", Boxes],
  ["Compras", ShoppingBag],
  ["Fornecedores", Truck],
  ["Clientes", Users],
  ["Financeiro", Wallet],
  ["Fiscal", FileText],
  ["Entregas", Truck],
  ["Relatórios", BarChart3],
];
const steps = [
  {
    title: "Estrutura do projeto",
    description: "Interface, API e configuração local.",
    icon: Boxes,
    status: "Disponível nesta versão",
  },
  {
    title: "Isolamento de empresas",
    description: "Banco de dados e separação dos clientes.",
    icon: Building2,
    status: "Disponível nesta versão",
  },
  {
    title: "Autenticação e acesso",
    description: "Login, sessões e recuperação de acesso.",
    icon: ShieldCheck,
    status: "Disponível nesta versão",
  },
  {
    title: "Usuários e permissões",
    description: "Equipe, convites e perfis por empresa.",
    icon: Users,
    status: "Disponível nesta versão",
  },
  {
    title: "Matriz, filiais e depósitos",
    description: "Empresas, unidades e acesso por filial.",
    icon: Store,
    status: "Disponível nesta versão",
  },
  {
    title: "Auditoria e validação",
    description: "Histórico, testes e revisão dos fluxos.",
    icon: ClipboardList,
    status: "Disponível nesta versão",
  },
];

function Brand() {
  return (
    <div className="brand">
      <ShieldCheck size={38} strokeWidth={2.1} aria-hidden="true" />
      <div>
        <strong>INVICTUS</strong>
        <span>ERP COMERCIAL</span>
      </div>
    </div>
  );
}

export function Workspace({
  initialSession,
  children,
  section = "access",
}: {
  initialSession: AuthSession;
  children?: React.ReactNode;
  section?:
    | "access"
    | "organizations"
    | "audit"
    | "inventory"
    | "suppliers"
    | "purchases"
    | "pos"
    | "finance" | "fiscal" | "lots" | "supermarket" | "network";
}) {
  const router = useRouter();
  const [session, setSession] = useState(initialSession);
  const [sessionError, setSessionError] = useState("");
  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/v1/auth/session", {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (cancelled) return;
        if (response.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }
        if (response.ok) {
          const current = (await response.json()) as AuthSession;
          if (current.stage !== "authenticated") {
            router.replace("/verificar-acesso");
            return;
          }
          setSession(current);
          setSessionError("");
        }
      } catch {
        /* Falha temporária de conexão não encerra a sessão localmente. */
      }
    }
    const timer = setInterval(() => void check(), 60000);
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [router]);
  async function selectTenant(id: string) {
    setSessionError("");
    try {
      setSession(await authRequest("context", { tenantId: id }, session.csrf));
      router.refresh();
    } catch (error) {
      setSessionError(
        error instanceof Error
          ? error.message
          : "Não foi possível selecionar a empresa.",
      );
    }
  }
  async function selectUnit(id: string) {
    setSessionError("");
    try {
      setSession(
        await authRequest("unit", { unitId: id || null }, session.csrf),
      );
      router.refresh();
    } catch (error) {
      setSessionError(
        error instanceof Error
          ? error.message
          : "Não foi possível selecionar a unidade.",
      );
    }
  }
  const [view, setView] = useState<View>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [health, setHealth] = useState<Health>({
    api: false,
    database: false,
    checked: false,
  });
  const [checking, setChecking] = useState(true);
  const [help, setHelp] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const helpButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const navigate = (next: View) => {
    if (children) {
      router.push("/");
      return;
    }
    setView(next);
    setMenuOpen(false);
  };
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 4500);
    setChecking(true);
    const read = async (endpoint: string) => {
      const response = await fetch(`/api/v1/health/${endpoint}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      return { ok: response.ok, data: await response.json() };
    };
    const [live, ready] = await Promise.allSettled([
      read("live"),
      read("ready"),
    ]);
    clearTimeout(timeout);
    if (request.current !== controller) return;
    const liveness = live.status === "fulfilled" ? live.value : undefined;
    const readiness = ready.status === "fulfilled" ? ready.value : undefined;
    setHealth({
      api: !!(
        liveness?.ok &&
        (liveness.data as LivenessResponse)?.status === "ok" &&
        liveness.data?.service === "invictus-api"
      ),
      database: !!(
        readiness?.ok &&
        (readiness.data as ReadinessResponse)?.status === "ready" &&
        readiness.data?.checks?.database === "up"
      ),
      checked: true,
    });
    setChecking(false);
  }, []);
  useEffect(() => {
    void refresh();
    return () => request.current?.abort();
  }, [refresh]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMenuOpen(false);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (help) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [help]);
  useEffect(() => {
    if (!menuOpen) return;
    const focusable = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href]",
        ) || [],
      ).filter((button) => button.getClientRects().length > 0);
    focusable()[0]?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
      if (event.key === "Tab") {
        const controls = focusable();
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      menuButton.current?.focus();
    };
  }, [menuOpen]);

  const sectionTitle =
    section === "network" ? "Gestão da rede e distribuição" : section === "supermarket" ? "Setores, pesagem e produção" : section === "lots" ? "Lotes, validade e perdas" : section === "fiscal" ? "Fiscal · NF-e e NFC-e" : section === "finance" ? "Financeiro" : section === "pos" ? "Vendas e PDV" : section === "suppliers"
      ? "Fornecedores"
      : section === "purchases"
        ? "Compras e recebimentos"
        : section === "inventory"
          ? "Produtos e estoque"
          : section === "audit"
            ? "Auditoria e histórico"
            : section === "organizations"
              ? "Empresas e unidades"
              : "Usuários e permissões";
  const SectionIcon =
    section === "network" ? Building2 : section === "supermarket" ? Store : section === "lots" ? Boxes : section === "fiscal" ? FileText : section === "finance" ? Wallet : section === "pos" ? ShoppingCart : section === "suppliers"
      ? Truck
      : section === "purchases"
        ? ShoppingBag
        : section === "inventory"
          ? Package
          : section === "audit"
            ? ClipboardList
            : section === "organizations"
              ? Building2
              : Users;
  const title = children
    ? sectionTitle
    : view === "dashboard"
      ? "Dashboard administrativo"
      : view === "foundation"
        ? "Fundação do sistema"
        : "Ambiente e configurações";
  return (
    <div className={`app-shell view-${view}`}>
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      {menuOpen && (
        <button
          className="nav-overlay"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        ref={sidebar}
        id="sidebar"
        className={`sidebar ${menuOpen ? "is-open" : ""}`}
        inert={isMobile && !menuOpen}
        role={isMobile && menuOpen ? "dialog" : undefined}
        aria-modal={isMobile && menuOpen ? true : undefined}
        aria-label="Menu do ERP"
      >
        <div className="brand-wrap">
          <Brand />
          <button
            className="icon-button close-menu"
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-tag">
          <span className="status-dot gold" /> Ambiente de desenvolvimento
        </div>
        <nav aria-label="Navegação principal">
          <span className="nav-label">PRINCIPAL</span>
          <button
            className={`nav-item ${!children && view === "dashboard" ? "active" : ""}`}
            aria-current={
              !children && view === "dashboard" ? "page" : undefined
            }
            onClick={() => navigate("dashboard")}
          >
            <LayoutDashboard size={19} />
            Dashboard
          </button>
          {session.permissions.includes("organizations.read") && (
            <Link
              href="/empresas"
              className={`nav-item ${children && section === "organizations" ? "active" : ""}`}
              aria-current={
                children && section === "organizations" ? "page" : undefined
              }
            >
              <Building2 size={19} />
              Empresas e unidades
            </Link>
          )}
          {session.permissions.includes("products.read") && (
            <Link
              href="/produtos"
              className={
                "nav-item " +
                (children && section === "inventory" ? "active" : "")
              }
              aria-current={
                children && section === "inventory" ? "page" : undefined
              }
              onClick={() => setMenuOpen(false)}
            >
              <Package size={19} />
              <span>Produtos e estoque</span>
            </Link>
          )}
          {session.permissions.includes("suppliers.read") && (
            <Link
              href="/fornecedores"
              className={
                "nav-item " +
                (children && section === "suppliers" ? "active" : "")
              }
              aria-current={
                children && section === "suppliers" ? "page" : undefined
              }
              onClick={() => setMenuOpen(false)}
            >
              <Truck size={19} />
              <span>Fornecedores</span>
            </Link>
          )}
          {session.permissions.includes("organizations.read") && session.permissions.includes("stock.read") && session.permissions.includes("products.read") && <Link href="/rede" className={`nav-item ${children && section === "network" ? "active" : ""}`} onClick={() => setMenuOpen(false)}><Building2 size={21}/><span>Rede e distribuição</span></Link>}
          {session.permissions.includes("stock.read") && session.permissions.includes("products.read") && <Link href="/supermercado" className={`nav-item ${children && section === "supermarket" ? "active" : ""}`} onClick={() => setMenuOpen(false)}><Store size={21}/><span>Setores e produção</span></Link>}
          {session.permissions.includes("stock.read") && session.permissions.includes("products.read") && <Link href="/lotes" className={`nav-item ${children && section === "lots" ? "active" : ""}`} onClick={() => setMenuOpen(false)}><Boxes size={21}/><span>Lotes e validade</span></Link>}
          {session.permissions.includes("fiscal.read") && <Link href="/fiscal" className={`nav-item ${children && section === "fiscal" ? "active" : ""}`} onClick={() => setMenuOpen(false)}><FileText size={21}/><span>Fiscal</span></Link>}
{session.permissions.includes("finance.read") && <Link href="/financeiro" className={`nav-item ${children && section === "finance" ? "active" : ""}`}><Wallet size={21}/><span>Financeiro</span></Link>}
          {session.permissions.includes("pos.read") && <Link href="/pdv" className={`nav-item ${children && section === "pos" ? "active" : ""}`}><ShoppingCart size={21}/><span>Vendas e PDV</span></Link>}
          {session.permissions.includes("purchases.read") && (
            <Link
              href="/compras"
              className={
                "nav-item " +
                (children && section === "purchases" ? "active" : "")
              }
              aria-current={
                children && section === "purchases" ? "page" : undefined
              }
              onClick={() => setMenuOpen(false)}
            >
              <ShoppingBag size={19} />
              <span>Compras</span>
            </Link>
          )}
          {modules
            .filter(
              ([label]) =>
                label !== "Produtos" &&
                label !== "Estoque" &&
                label !== "Compras" && label !== "Vendas e PDV" && label !== "Financeiro" && label !== "Fiscal" &&
                label !== "Fornecedores",
            )
            .map(([label, Icon]) => (
              <button
                key={label}
                className="nav-item future"
                disabled
                title={`${label}: disponível em uma próxima etapa`}
              >
                <Icon size={19} />
                <span>{label}</span>
                <LockKeyhole size={12} />
              </button>
            ))}
          <button className="nav-item future assistant" disabled>
            <Sparkles size={19} />
            <span>Assistente inteligente</span>
            <LockKeyhole size={12} />
          </button>
        </nav>
        <div className="sidebar-bottom">
          {session.permissions.includes("users.read") && (
            <Link
              className={`nav-item ${children && section === "access" ? "active" : ""}`}
              href="/usuarios"
              aria-current={
                children && section === "access" ? "page" : undefined
              }
            >
              <Users size={19} />
              Usuários e permissões
            </Link>
          )}
          <Link
            className={`nav-item ${children && section === "audit" ? "active" : ""}`}
            href="/auditoria"
            aria-current={children && section === "audit" ? "page" : undefined}
          >
            <ClipboardList size={19} />
            Auditoria e histórico
          </Link>

          <Link
            className="nav-item"
            href="/seguranca"
            style={{ textDecoration: "none" }}
          >
            <ShieldCheck size={19} />
            Acesso e segurança
          </Link>
          <button
            className={`nav-item ${view === "settings" ? "active" : ""}`}
            aria-current={view === "settings" ? "page" : undefined}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={19} />
            Configurações
          </button>
          <div className="sidebar-footer">
            <ShieldCheck size={17} />
            <span>
              Uma solução <strong>Invictus Systems</strong>
            </span>
            <small>v0.1.0 · Fundação</small>
          </div>
        </div>
      </aside>

      <div className="workspace" inert={isMobile && menuOpen}>
        <header className="topbar">
          <button
            ref={menuButton}
            className="icon-button menu-toggle"
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            aria-controls="sidebar"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Menu size={23} />
          </button>
          <div className="topbar-title">
            <strong>Invictus ERP Comercial</strong>
            <span>Gestão completa para o seu negócio</span>
          </div>
          <div className="context-controls">
            <label className="context-select">
              <Store size={17} />
              <select
                aria-label="Empresa"
                value={session.activeTenantId || ""}
                disabled={!session.tenants.length}
                onChange={(event) => void selectTenant(event.target.value)}
              >
                <option value="" disabled>
                  {session.tenants.length
                    ? "Selecionar empresa"
                    : "Nenhuma empresa disponível"}
                </option>
                {session.tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="context-select unit">
              <Building2 size={17} />
              <select
                aria-label="Unidade"
                value={session.activeUnitId || ""}
                disabled={!session.units.length}
                onChange={(e) => void selectUnit(e.target.value)}
              >
                <option value="" disabled={!session.allUnits}>
                  {session.allUnits
                    ? "Consolidado da rede"
                    : "Selecionar unidade"}
                </option>
                {session.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.companyName} · {u.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
          <button
            ref={helpButton}
            className="icon-button help-toggle"
            aria-label="Ajuda sobre esta versão"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={21} />
          </button>
          <Link
            href="/seguranca"
            aria-label="Acesso e segurança"
            className="avatar"
            title={session.user.name}
          >
            <ShieldCheck size={20} />
          </Link>
        </header>

        <main id="main" tabIndex={-1}>
          <div className="breadcrumb">
            Workspace <ChevronRight size={12} />{" "}
            <span>
              {children
                ? sectionTitle
                : view === "dashboard"
                  ? "Visão geral"
                  : view === "foundation"
                    ? "Fundação"
                    : "Configurações"}
            </span>
          </div>
          <div className="page-heading">
            <div>
              <span className="eyebrow">SEU COMÉRCIO, CONECTADO</span>
              <h1>
                {children ? (
                  <SectionIcon className="heading-icon" size={42} />
                ) : (
                  view === "dashboard" && (
                    <BarChart3 className="heading-icon" size={42} />
                  )
                )}
                <span>{title}</span>
              </h1>
              <p>
                {children
                  ? section === "network" ? "Matriz, filiais, centros de distribuição e mercadorias em trânsito." : section === "supermarket" ? "Operação de supermercado, balcão e produção por filial." : section === "lots" ? "Controle por filial, descarte e reposição de mercadorias." : section === "fiscal" ? "Conferência, emissão em homologação e histórico por filial." : section === "finance" ? "Contas a pagar, a receber e caixa por filial." : section === "pos" ? "Venda no balcão, caixa e histórico por filial." : section === "suppliers"
                    ? "Parceiros, contatos e condições de abastecimento."
                    : section === "purchases"
                      ? "Planeje, aprove e confira as compras da sua unidade."
                      : section === "inventory"
                        ? "Cadastro, saldos, custos e movimentações por unidade."
                        : section === "audit"
                          ? "Acompanhe quem alterou, quando e o que mudou, com acesso ao histórico autorizado."
                          : section === "organizations"
                            ? "Matriz, filiais e depósitos conectados em uma só gestão."
                            : "Gerencie sua equipe e os acessos à empresa selecionada."
                  : view === "dashboard"
                    ? "Visão geral do seu negócio em tempo real"
                    : "Acompanhe a construção de uma gestão segura e integrada."}
              </p>
            </div>
            {!children && (
              <button
                className="button secondary refresh"
                onClick={() => void refresh()}
                disabled={checking}
              >
                <RefreshCw size={16} className={checking ? "spin" : ""} />
                {checking ? "Verificando" : "Atualizar"}
              </button>
            )}
          </div>

          {!children && (
            <div className="environment-banner">
              <span>
                <span className="status-dot gold" />
                <strong>Primeiros passos</strong>
                <span className="banner-divider">/</span>Fundação em
                desenvolvimento
              </span>
              <button onClick={() => navigate("foundation")}>
                Acompanhar implantação <ArrowRight size={14} />
              </button>
            </div>
          )}

          <div className="operation-context">
            <label className="operation-network">
              Rede de acesso
              <select
                aria-label="Rede para operação"
                value={session.activeTenantId || ""}
                onChange={(e) => void selectTenant(e.target.value)}
                disabled={!session.tenants.length}
              >
                <option value="" disabled>
                  Selecione a rede
                </option>
                {session.tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Unidade para operação
              <select
                aria-label="Unidade para operação"
                value={session.activeUnitId || ""}
                onChange={(e) => void selectUnit(e.target.value)}
                disabled={!session.units.length}
              >
                <option value="" disabled={!session.allUnits}>
                  {session.allUnits
                    ? "Consolidado da rede"
                    : "Selecionar unidade"}
                </option>
                {session.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.companyName} · {u.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {sessionError && (
            <p className="auth-error" role="alert">
              {sessionError}
            </p>
          )}
          {children}
          {!children && view === "dashboard" && (
            <>
              <section className="metrics" aria-label="Indicadores comerciais">
                {[
                  {
                    title: "Vendas do dia",
                    icon: ShoppingCart,
                    caption: "Nenhuma venda registrada",
                  },
                  {
                    title: "Faturamento do mês",
                    icon: BarChart3,
                    caption: "Aguardando primeiras operações",
                  },
                  {
                    title: "Lucro bruto",
                    icon: CircleDollarSign,
                    caption: "Disponível após as primeiras vendas",
                  },
                  {
                    title: "Estoque total",
                    icon: Package,
                    caption:
                      "Valor em custo · Consulte produtos e saldos por unidade",
                  },
                  {
                    title: "Produtos em falta",
                    icon: TriangleAlert,
                    caption: "Consulte os alertas em Produtos e estoque",
                  },
                  {
                    title: "Contas a receber",
                    icon: Wallet,
                    caption: "A vencer · Aguardando lançamentos",
                  },
                ].map(({ title, icon: Icon, caption }, i) => (
                  <article
                    className={
                      "metric" +
                      (i === 0 ? " highlighted" : "") +
                      (i === 4 ? " shortage" : "")
                    }
                    key={title}
                  >
                    <span className="metric-icon">
                      <Icon size={36} strokeWidth={1.8} />
                    </span>
                    <div className="metric-content">
                      <h2>{title}</h2>
                      <strong className="metric-value">—</strong>
                      <p>{caption}</p>
                    </div>
                  </article>
                ))}
              </section>

              <div className="dashboard-grid">
                <section className="panel sales-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        <BarChart3 size={23} /> Vendas dos últimos 7 dias
                      </h2>
                      <p>A evolução do seu faturamento</p>
                    </div>
                    <span className="period-label">Últimos 7 dias</span>
                  </div>
                  <div className="empty-chart">
                    <div className="chart-grid">
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                    </div>
                    <div className="empty-chart-content">
                      <span className="empty-icon">
                        <BarChart3 size={27} />
                      </span>
                      <h3>Sua história começa aqui</h3>
                      <p>
                        As vendas aparecerão neste gráfico quando
                        <br /> o PDV estiver disponível e em operação.
                      </p>
                      <span className="planned-pill">
                        Módulo em planejamento
                      </span>
                    </div>
                    <div className="chart-days">
                      {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(
                        (day) => (
                          <span key={day}>{day}</span>
                        ),
                      )}
                    </div>
                  </div>
                </section>
                <section className="panel ranking-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        <Trophy size={23} /> Ranking de lojas
                      </h2>
                      <p>Faturamento do mês por unidade</p>
                    </div>
                  </div>
                  <div className="ranking-empty">
                    <Store size={42} strokeWidth={1.3} />
                    <h3>Nenhuma unidade cadastrada</h3>
                    <p>
                      O desempenho das lojas será exibido
                      <br /> após o início da operação.
                    </p>
                  </div>
                  <div className="ranking-footer">
                    <Building2 size={17} />
                    <span>Matriz · Filiais · Centro de distribuição</span>
                  </div>
                </section>
              </div>

              <section className="quick-access" aria-labelledby="quick-title">
                <h2 id="quick-title">
                  <Zap size={25} /> Acesso rápido
                </h2>
                <div className="quick-access-grid">
                  {[
                    ["Nova venda (PDV)", ShoppingCart],
                    ["Cadastrar produto", Package],
                    ["Entrada de estoque", ArrowDownToLine],
                    ["Pedido de compra", ShoppingBag],
                    ["Contas a pagar", FileText],
                    ["Relatórios gerenciais", BarChart3],
                  ].map(([label, Icon]) => {
                    const QuickIcon = Icon as LucideIcon;
                    return (
                      <button
                        key={String(label)}
                        disabled={
                          !(
                            (label === "Contas a pagar" && session.permissions.includes("finance.read")) || (label === "Nova venda (PDV)" && session.permissions.includes("pos.read")) || (label === "Pedido de compra" && session.permissions.includes("purchases.read")) || [
                              "Cadastrar produto",
                              "Entrada de estoque",
                            ].includes(String(label)) &&
                            session.permissions.includes("products.read")
                          )
                        }
                        onClick={() => router.push(label === "Contas a pagar" ? "/contas-a-pagar" : label === "Nova venda (PDV)" ? "/pdv" : label === "Pedido de compra" ? "/compras" : "/produtos")}
                        title={
                          ["Cadastrar produto", "Entrada de estoque"].includes(
                            String(label),
                          )
                            ? "Abrir produtos e estoque"
                            : label === "Contas a pagar" ? "Abrir contas a pagar" : label === "Nova venda (PDV)" ? "Abrir PDV de teste" : label === "Pedido de compra" ? "Abrir compras" : "Disponível na etapa correspondente do projeto"
                        }
                      >
                        <QuickIcon size={30} />
                        <span>{String(label)}</span>
                        <small>
                          {["Cadastrar produto", "Entrada de estoque"].includes(
                            String(label),
                          ) && session.permissions.includes("products.read") || label === "Contas a pagar" && session.permissions.includes("finance.read") || label === "Nova venda (PDV)" && session.permissions.includes("pos.read") || label === "Pedido de compra" && session.permissions.includes("purchases.read")
                            ? "Abrir"
                            : "Em breve"}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </section>
              <div className="bottom-grid">
                <section className="panel activity">
                  <div className="panel-heading">
                    <h2>
                      <Bell size={18} /> Alertas e pendências
                    </h2>
                    <span className="count-badge">0</span>
                  </div>
                  <div className="empty-inline">
                    <span className="empty-icon soft-green">
                      <CheckCheck size={23} />
                    </span>
                    <div>
                      <h3>Nenhum alerta por enquanto</h3>
                      <p>Os avisos da operação aparecerão aqui.</p>
                    </div>
                  </div>
                </section>
                <section className="panel connection">
                  <div className="panel-heading">
                    <h2>
                      <ShieldCheck size={18} /> Status do ambiente
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => navigate("settings")}
                    >
                      Detalhes <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="connection-items" aria-live="polite">
                    <Status
                      label="Interface web"
                      state="ok"
                      text="Disponível"
                    />
                    <Status
                      label="API de serviços"
                      state={
                        checking ? "loading" : health.api ? "ok" : "pending"
                      }
                      text={
                        checking
                          ? "Verificando"
                          : health.api
                            ? "Conectada"
                            : "Indisponível"
                      }
                    />
                    <Status
                      label="Banco de dados"
                      state={
                        checking
                          ? "loading"
                          : health.database
                            ? "ok"
                            : "pending"
                      }
                      text={
                        checking
                          ? "Verificando"
                          : health.database
                            ? "Conectado"
                            : "Não conectado"
                      }
                    />
                  </div>
                </section>
              </div>
            </>
          )}

          {view === "foundation" && (
            <section className="panel foundation-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    <ClipboardList size={19} /> Etapa 01 · Construindo a
                    fundação
                  </h2>
                  <p>
                    A base para uma plataforma modular, segura e preparada para
                    crescer.
                  </p>
                </div>
                <span className="planned-pill">Em desenvolvimento</span>
              </div>
              <div className="foundation-steps">
                {steps.map((step, i) => (
                  <article
                    key={step.title}
                    className={i < 3 ? "current-step" : ""}
                  >
                    <span className="foundation-icon">
                      <step.icon size={24} />
                    </span>
                    <div>
                      <small>INCREMENTO 01.{i + 1}</small>
                      <h3>{step.title}</h3>
                      <p>{step.description}</p>
                    </div>
                    <span className={`step-status ${i < 3 ? "available" : ""}`}>
                      {step.status}
                    </span>
                  </article>
                ))}
              </div>
              <div className="foundation-note">
                <ShieldCheck size={21} />
                <p>
                  Os módulos comerciais serão liberados em etapas, após a
                  implementação das regras de negócio, persistência e testes.
                </p>
              </div>
            </section>
          )}

          {view === "settings" && (
            <section className="settings-grid">
              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      <ShieldCheck size={19} /> Conexões do ambiente
                    </h2>
                    <p>Verificações reais da API local.</p>
                  </div>
                </div>
                <div className="settings-status" aria-live="polite">
                  <Status label="Interface web" state="ok" text="Disponível" />
                  <Status
                    label="API de serviços"
                    state={checking ? "loading" : health.api ? "ok" : "pending"}
                    text={
                      checking
                        ? "Verificando"
                        : health.api
                          ? "Conectada"
                          : "Indisponível"
                    }
                  />
                  <Status
                    label="PostgreSQL"
                    state={
                      checking ? "loading" : health.database ? "ok" : "pending"
                    }
                    text={
                      checking
                        ? "Verificando"
                        : health.database
                          ? "Conectado"
                          : "Não conectado"
                    }
                  />
                </div>
                <p className="settings-note">
                  A API pode estar ativa enquanto o banco está indisponível.
                  Isso ainda não significa que o sistema está pronto para
                  operações comerciais.
                </p>
                <button
                  className="button secondary"
                  onClick={() => void refresh()}
                  disabled={checking}
                >
                  <RefreshCw size={16} />
                  Verificar conexões
                </button>
              </article>
              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      <Building2 size={19} /> Organização e acesso
                    </h2>
                    <p>Configuração dos próximos incrementos.</p>
                  </div>
                </div>
                <div className="empty-settings">
                  <LockKeyhole size={34} />
                  <h3>Seu ambiente está em construção</h3>
                  <p>
                    Empresas, unidades e usuários serão cadastrados após a
                    implementação do isolamento de dados e da autenticação.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => navigate("foundation")}
                  >
                    Acompanhar a fundação <ArrowRight size={16} />
                  </button>
                </div>
              </article>
            </section>
          )}

          <footer className="page-footer">
            <span>© {new Date().getFullYear()} Invictus Systems</span>
            <span>
              Feito para o seu negócio crescer.
              <span className="footer-tag">Versão em desenvolvimento</span>
            </span>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialog}
        onCancel={() => setHelp(false)}
        onClose={() => {
          setHelp(false);
          helpButton.current?.focus();
        }}
        aria-labelledby="help-title"
      >
        <div className="dialog-header">
          <span className="empty-icon">
            <CircleHelp size={24} />
          </span>
          <button
            className="icon-button"
            aria-label="Fechar ajuda"
            onClick={() => setHelp(false)}
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="help-title">Primeiros passos no Invictus</h2>
        <p>
          Cadastre produtos, consulte saldos e registre movimentos em Produtos e
          estoque. Os demais módulos comerciais seguem o planejamento do
          projeto.
        </p>
        <ol>
          <li>
            Acompanhe os incrementos em <strong>Ver implantação</strong>.
          </li>
          <li>
            Consulte a conexão da API e do banco em{" "}
            <strong>Configurações</strong>.
          </li>
          <li>
            O cadastro da empresa será disponibilizado após a autenticação e o
            isolamento dos dados.
          </li>
        </ol>
        <button
          className="button primary"
          onClick={() => {
            setHelp(false);
            navigate("foundation");
          }}
        >
          Ver plano de implantação <ArrowRight size={16} />
        </button>
      </dialog>
    </div>
  );
}

function Status({
  label,
  state,
  text,
}: {
  label: string;
  state: "ok" | "pending" | "loading";
  text: string;
}) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <span className={`status-value ${state}`}>
        <span className="status-dot" />
        {text}
      </span>
    </div>
  );
}
