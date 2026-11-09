"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
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
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import type { LivenessResponse, ReadinessResponse } from "@invictus/contracts";

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
  ["Filiais e rede", Building2],
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
    status: "Próximo incremento",
  },
  {
    title: "Autenticação e acesso",
    description: "Login, sessões e recuperação de acesso.",
    icon: ShieldCheck,
    status: "Planejado",
  },
  {
    title: "Usuários e permissões",
    description: "Perfis de acesso e escopo por unidade.",
    icon: Users,
    status: "Planejado",
  },
  {
    title: "Matriz, filiais e depósitos",
    description: "Estrutura organizacional da sua empresa.",
    icon: Store,
    status: "Planejado",
  },
  {
    title: "Auditoria e validação",
    description: "Histórico, testes e revisão dos fluxos.",
    icon: ClipboardList,
    status: "Planejado",
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

export function Workspace() {
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
        sidebar.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
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

  const title =
    view === "dashboard"
      ? "Dashboard administrativo"
      : view === "foundation"
        ? "Fundação do sistema"
        : "Ambiente e configurações";
  return (
    <div className="app-shell">
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
            className={`nav-item ${view === "dashboard" ? "active" : ""}`}
            aria-current={view === "dashboard" ? "page" : undefined}
            onClick={() => navigate("dashboard")}
          >
            <LayoutDashboard size={19} />
            Dashboard
          </button>
          {modules.map(([label, Icon]) => (
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
              <select aria-label="Empresa" disabled>
                <option>Nenhuma empresa cadastrada</option>
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="context-select unit">
              <Building2 size={17} />
              <select aria-label="Unidade" disabled>
                <option>Selecionar unidade</option>
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
          <span
            className="avatar"
            title="Ambiente local, sem usuário autenticado"
          >
            <ShieldCheck size={20} />
          </span>
        </header>

        <main id="main" tabIndex={-1}>
          <div className="breadcrumb">
            Workspace <ChevronRight size={12} />{" "}
            <span>
              {view === "dashboard"
                ? "Visão geral"
                : view === "foundation"
                  ? "Fundação"
                  : "Configurações"}
            </span>
          </div>
          <div className="page-heading">
            <div>
              <span className="eyebrow">SEU COMÉRCIO, CONECTADO</span>
              <h1>{title}</h1>
              <p>
                {view === "dashboard"
                  ? "Tudo o que importa para o seu negócio, em um só lugar."
                  : "Acompanhe a construção de uma gestão segura e integrada."}
              </p>
            </div>
            <button
              className="button secondary refresh"
              onClick={() => void refresh()}
              disabled={checking}
            >
              <RefreshCw size={16} className={checking ? "spin" : ""} />
              {checking ? "Verificando" : "Atualizar"}
            </button>
          </div>

          <div className="environment-banner">
            <span>
              <span className="status-dot gold" />
              <strong>Primeiros passos</strong>
              <span className="banner-divider">/</span>Estrutura inicial em
              desenvolvimento
            </span>
            <button onClick={() => navigate("foundation")}>
              Ver implantação <ArrowRight size={14} />
            </button>
          </div>

          {view === "dashboard" && (
            <>
              <section className="welcome-card" aria-labelledby="welcome-title">
                <div className="welcome-copy">
                  <div className="pill">
                    <Sparkles size={13} /> BEM-VINDO AO INVICTUS
                  </div>
                  <h2 id="welcome-title">
                    Uma base forte.
                    <br />
                    Um negócio sem limites.
                  </h2>
                  <p>
                    O primeiro passo para conectar sua operação.
                    <br className="desktop-break" /> Estamos preparando seu
                    ambiente de gestão.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => navigate("foundation")}
                  >
                    Acompanhar implantação <ArrowRight size={17} />
                  </button>
                  <small>
                    <ShieldCheck size={13} /> Segurança e organização desde o
                    início
                  </small>
                </div>
                <div className="welcome-visual" aria-hidden="true">
                  <div className="visual-grid" />
                  <div className="visual-card visual-card-back">
                    <Boxes size={24} />
                    <div>
                      <i />
                      <i />
                    </div>
                    <Check size={17} />
                  </div>
                  <div className="store-symbol">
                    <Store size={80} strokeWidth={1.25} />
                  </div>
                  <div className="visual-card visual-card-front">
                    <span>
                      <ShieldCheck size={23} />
                    </span>
                    <div>
                      <strong>Seu negócio conectado</strong>
                      <small>Uma plataforma. Toda a operação.</small>
                    </div>
                    <CheckCheck size={18} />
                  </div>
                  <span className="visual-label">INVICTUS SYSTEMS</span>
                </div>
              </section>

              <div className="section-heading">
                <h2>Visão geral do negócio</h2>
                <span className="subtle-label">
                  <span className="status-dot" /> Aguardando operações
                </span>
              </div>
              <section className="metrics" aria-label="Indicadores comerciais">
                {(
                  [
                    {
                      title: "Vendas do dia",
                      icon: ShoppingCart,
                      caption: "Nenhuma venda registrada",
                      color: "gold",
                    },
                    {
                      title: "Faturamento do mês",
                      icon: BarChart3,
                      caption: "Aguardando primeiras operações",
                      color: "blue",
                    },
                    {
                      title: "Lucro bruto",
                      icon: Wallet,
                      caption: "Disponível após as primeiras vendas",
                      color: "green",
                    },
                    {
                      title: "Valor do estoque",
                      icon: Package,
                      caption: "Nenhum produto cadastrado",
                      color: "purple",
                    },
                  ] as const
                ).map(({ title, icon: Icon, caption, color }) => (
                  <article className="metric" key={title}>
                    <div className="metric-top">
                      <span>{title}</span>
                      <span className={`metric-icon ${color}`}>
                        <Icon size={19} />
                      </span>
                    </div>
                    <strong className="metric-value">—</strong>
                    <p>{caption}</p>
                  </article>
                ))}
              </section>

              <div className="dashboard-grid">
                <section className="panel sales-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        <BarChart3 size={18} /> Desempenho de vendas
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
                <section className="panel checklist">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        <ClipboardList size={18} /> Implantação do ambiente
                      </h2>
                      <p>Um passo de cada vez, com segurança.</p>
                    </div>
                    <span className="step-count">01 / 06</span>
                  </div>
                  <div className="progress-track">
                    <span />
                  </div>
                  <ol>
                    {steps.slice(0, 4).map((step, i) => (
                      <li key={step.title}>
                        <span
                          className={`step-number ${i === 0 ? "done" : ""}`}
                        >
                          {i === 0 ? <Check size={14} /> : `0${i + 1}`}
                        </span>
                        <div>
                          <strong>{step.title}</strong>
                          <small>
                            {i === 0
                              ? "Estrutura inicial disponível"
                              : i === 1
                                ? "Próximo incremento"
                                : "Planejado"}
                          </small>
                        </div>
                        {i === 1 && <span className="next-dot" />}
                      </li>
                    ))}
                  </ol>
                  <button
                    className="text-button"
                    onClick={() => navigate("foundation")}
                  >
                    Ver todas as etapas <ArrowRight size={15} />
                  </button>
                </section>
              </div>

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
                    className={i === 0 ? "current-step" : ""}
                  >
                    <span className="foundation-icon">
                      <step.icon size={24} />
                    </span>
                    <div>
                      <small>INCREMENTO 01.{i + 1}</small>
                      <h3>{step.title}</h3>
                      <p>{step.description}</p>
                    </div>
                    <span
                      className={`step-status ${i === 0 ? "available" : ""}`}
                    >
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
          Esta é a estrutura inicial do ERP. As telas comerciais estão em
          planejamento e ainda não registram operações.
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
