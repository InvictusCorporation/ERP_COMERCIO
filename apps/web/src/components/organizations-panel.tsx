"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Store,
  Warehouse,
  Network,
  Search,
  Plus,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Save,
  X,
  ShieldCheck,
  LockKeyhole,
  MapPin,
  Check,
} from "lucide-react";
import {
  UNIT_KINDS,
  type UnitKind,
  type AuthSession,
  type LegalCompany,
  type OrganizationUnit,
  type OrganizationOverview,
} from "@invictus/contracts";
import { organizationRequest } from "../lib/organizations-client";
import { AuthClientError } from "../lib/auth-client";
import "../app/access.css";
import "../app/organizations.css";
type CompanyForm = Omit<LegalCompany, "id"> & {
  id?: string;
  matrixCode: string;
};
type UnitForm = Omit<OrganizationUnit, "id" | "available"> & { id?: string };
const emptyCompany: CompanyForm = {
  legalName: "",
  tradeName: "",
  cnpj: "",
  matrixCode: "",
  stateRegistration: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
  active: true,
};
const emptyUnit: UnitForm = {
  companyId: "",
  parentId: null,
  kind: "filial",
  code: "",
  name: "",
  cnpj: null,
  address: "",
  city: "",
  state: "",
  postalCode: "",
  active: true,
};
const states = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];
const formatCnpj = (value: string) =>
  value.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
export function OrganizationsPanel({ session }: { session: AuthSession }) {
  const router = useRouter();
  const [data, setData] = useState<OrganizationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<"company" | "unit" | null>(null);
  const [company, setCompany] = useState<CompanyForm>(emptyCompany);
  const [unit, setUnit] = useState<UnitForm>(emptyUnit);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const editor = useRef<HTMLElement>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result =
        await organizationRequest<OrganizationOverview>("overview");
      setData(result);
      setError("");
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Falha ao consultar a rede.");
      if (e instanceof AuthClientError && e.status === 401) {
        router.replace("/login");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }, [router]);
  useEffect(() => {
    void load();
  }, [load]);
  function showEditor() {
    requestAnimationFrame(() => {
      editor.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      editor.current?.focus();
    });
  }
  function openCompany(value?: LegalCompany) {
    setError("");
    setNotice("");
    setMode("company");
    setCompany(
      value
        ? {
            ...value,
            matrixCode:
              data?.units.find(
                (u) => u.companyId === value.id && u.kind === "matriz",
              )?.code || "",
          }
        : { ...emptyCompany },
    );
    showEditor();
  }
  function openUnit(value?: OrganizationUnit, companyId?: string) {
    setError("");
    setNotice("");
    setMode("unit");
    const selected =
      companyId ||
      companyFilter ||
      data?.companies.find((c) => c.active)?.id ||
      "";
    const matrix = data?.units.find(
      (u) => u.companyId === selected && u.kind === "matriz",
    );
    setUnit(
      value
        ? { ...value }
        : { ...emptyUnit, companyId: selected, parentId: matrix?.id || null },
    );
    showEditor();
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "company")
        await organizationRequest("companies/save", company, session.csrf);
      else {
        const { available, ...payload } = unit as UnitForm & {
          available?: boolean;
        };
        await organizationRequest("units/save", payload, session.csrf);
      }
      setMode(null);
      await load();
      router.refresh();
      setNotice(
        mode === "company"
          ? "Empresa salva. A matriz está vinculada ao cadastro."
          : "Unidade salva. A disponibilidade e os acessos já foram atualizados.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  const units = (data?.units || []).filter(
    (u) =>
      (!companyFilter || u.companyId === companyFilter) &&
      (kindFilter === "all" || u.kind === kindFilter) &&
      (statusFilter === "all" ||
        (statusFilter === "available" ? u.available : !u.available)) &&
      [
        u.name,
        u.code,
        u.cnpj || "",
        data?.companies.find((c) => c.id === u.companyId)?.tradeName || "",
      ].some((v) =>
        v
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR")),
      ),
  );
  const pages = Math.max(1, Math.ceil(units.length / 5));
  const currentPage = Math.min(pageIndex, pages - 1);
  const parents =
    data?.units.filter(
      (u) =>
        u.companyId === unit.companyId &&
        (unit.kind === "deposito"
          ? u.kind !== "deposito"
          : u.kind === "matriz"),
    ) || [];
  const patchCompany = (key: keyof CompanyForm, value: string | boolean) =>
    setCompany({ ...company, [key]: value });
  const patchUnit = (key: keyof UnitForm, value: string | boolean | null) =>
    setUnit({ ...unit, [key]: value });
  function renderNode(u: OrganizationUnit): React.ReactNode {
    return (
      <div key={u.id} className="org-tree-branch">
        <button
          className={`org-unit-node kind-${u.kind}`}
          onClick={() => {
            if (data?.canManage) openUnit(u);
            else {
              setCompanyFilter(u.companyId);
              setSearch(u.name);
              setPageIndex(0);
            }
          }}
          aria-label={`${data?.canManage ? "Editar" : "Ver"} unidade ${u.name}`}
        >
          <span className={`status-dot ${u.available ? "green" : ""}`} />
          {u.kind === "deposito" ? (
            <Warehouse size={16} />
          ) : u.kind === "filial" ? (
            <Store size={16} />
          ) : (
            <Building2 size={16} />
          )}
          <span>
            {u.name}
            <small>
              {UNIT_KINDS[u.kind]} · {u.code}
            </small>
          </span>
          {!u.available && <small>Indisponível</small>}
        </button>
        {data?.units.some((child) => child.parentId === u.id) && (
          <div className="org-nested">
            {data.units
              .filter((child) => child.parentId === u.id)
              .map(renderNode)}
          </div>
        )}
      </div>
    );
  }
  return (
    <section className="org-area" aria-label="Estrutura de empresas e unidades">
      <div className="org-summary">
        {[
          {
            label: "Empresas cadastradas",
            value: data?.companies.length,
            Icon: Building2,
          },
          {
            label: "Matrizes",
            value: data?.units.filter((u) => u.kind === "matriz").length,
            Icon: Network,
          },
          {
            label: "Filiais / Lojas",
            value: data?.units.filter((u) => u.kind === "filial").length,
            Icon: Store,
          },
          {
            label: "Centros de distribuição",
            value: data?.units.filter((u) => u.kind === "cd").length,
            Icon: Warehouse,
          },
          {
            label: "Depósitos",
            value: data?.units.filter((u) => u.kind === "deposito").length,
            Icon: Warehouse,
          },
          {
            label: "Unidades disponíveis",
            value: data?.units.filter((u) => u.available).length,
            Icon: ShieldCheck,
          },
        ].map(({ label, value, Icon }) => (
          <article key={label}>
            <Icon size={25} />
            <span>
              {label}
              <strong>{value ?? "—"}</strong>
            </span>
          </article>
        ))}
      </div>
      {error && (
        <div className="access-message error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="access-message success" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      <div className="org-layout">
        <div className="org-content">
          <section className="access-card org-network">
            <div className="org-section-heading">
              <h2>
                <Network size={21} />
                Estrutura da rede
              </h2>
              <span>{data?.network || "Rede selecionada"}</span>
            </div>
            <div className="org-network-toolbar">
              <button
                className="org-filter-chip"
                onClick={() => {
                  setCompanyFilter("");
                  setPageIndex(0);
                }}
                aria-pressed={!companyFilter}
              >
                Todas as empresas
              </button>
              {data?.canManage && (
                <button
                  className="button primary"
                  onClick={() => openCompany()}
                >
                  <Plus size={16} />
                  Nova empresa
                </button>
              )}
            </div>
            {loading ? (
              <p className="access-empty" role="status">
                Carregando estrutura…
              </p>
            ) : !data ? (
              <div className="access-empty">
                <LockKeyhole size={30} />
                <h2>Acesso indisponível</h2>
                <p>
                  Selecione uma rede autorizada ou solicite acesso às suas
                  unidades.
                </p>
                <Link href="/">Voltar ao painel</Link>
              </div>
            ) : !data.companies.length ? (
              <div className="org-empty">
                <Building2 size={42} />
                <h3>
                  {data.canManage
                    ? "Sua rede começa pela matriz."
                    : "Nenhuma unidade autorizada disponível."}
                </h3>
                <p>
                  {data.canManage
                    ? "Cadastre a primeira empresa. A matriz será criada no mesmo processo."
                    : "Solicite ao administrador a atribuição de uma unidade ativa."}
                </p>
                {data.canManage && (
                  <button
                    className="button primary"
                    onClick={() => openCompany()}
                  >
                    Cadastrar empresa
                  </button>
                )}
              </div>
            ) : (
              <div className="org-tree">
                {data.companies.map((c) => (
                  <article
                    key={c.id}
                    className={companyFilter === c.id ? "chosen" : ""}
                  >
                    <div className="org-company-row">
                      <button
                        className="org-expand"
                        onClick={() =>
                          setCollapsed(
                            collapsed.includes(c.id)
                              ? collapsed.filter((id) => id !== c.id)
                              : [...collapsed, c.id],
                          )
                        }
                        aria-expanded={!collapsed.includes(c.id)}
                        aria-label={`Expandir empresa ${c.tradeName}`}
                      >
                        <ChevronDown size={17} />
                      </button>
                      <Building2 size={24} />
                      <button
                        className="org-company-name"
                        onClick={() => {
                          setCompanyFilter(c.id);
                          setPageIndex(0);
                        }}
                      >
                        <strong>{c.tradeName}</strong>
                        <small>
                          {formatCnpj(c.cnpj)} · {c.legalName}
                        </small>
                      </button>
                      <span
                        className={`access-badge ${c.active ? "good" : "off"}`}
                      >
                        {c.active ? "Ativa" : "Inativa"}
                      </span>
                      {data.canManage && (
                        <button
                          className="org-edit"
                          onClick={() => openCompany(c)}
                          aria-label={`Editar empresa ${c.tradeName}`}
                        >
                          <ChevronRight size={18} />
                        </button>
                      )}
                    </div>
                    {!collapsed.includes(c.id) && (
                      <div className="org-unit-branches">
                        {data.units
                          .filter(
                            (u) =>
                              u.companyId === c.id &&
                              (!u.parentId ||
                                !data.units.some((p) => p.id === u.parentId)),
                          )
                          .map(renderNode)}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="access-card org-units">
            <div className="org-section-heading">
              <h2>
                <Store size={21} />
                Unidades da rede
              </h2>
              {data?.canManage && (
                <button
                  className="org-add"
                  onClick={() => openUnit()}
                  disabled={!data.companies.some((c) => c.active)}
                >
                  <Plus size={16} />
                  Nova unidade
                </button>
              )}
            </div>
            <div className="access-toolbar">
              <label className="access-search">
                <Search size={18} />
                <input
                  aria-label="Buscar unidades"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPageIndex(0);
                  }}
                  placeholder="Buscar nome, código ou CNPJ…"
                />
              </label>
              <button
                className="button secondary"
                aria-label="Atualizar estrutura"
                onClick={() => {
                  setMode(null);
                  void load();
                }}
                disabled={loading || busy}
              >
                <RefreshCw size={17} />
              </button>
            </div>
            <div className="org-filters">
              <select
                aria-label="Filtrar empresa"
                value={companyFilter}
                onChange={(e) => {
                  setCompanyFilter(e.target.value);
                  setPageIndex(0);
                }}
              >
                <option value="">Todas as empresas</option>
                {data?.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tradeName}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filtrar tipo de unidade"
                value={kindFilter}
                onChange={(e) => {
                  setKindFilter(e.target.value);
                  setPageIndex(0);
                }}
              >
                <option value="all">Todos os tipos</option>
                {Object.entries(UNIT_KINDS).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filtrar disponibilidade"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPageIndex(0);
                }}
              >
                <option value="all">Todas as situações</option>
                <option value="available">Disponíveis</option>
                <option value="unavailable">Indisponíveis</option>
              </select>
            </div>
            <div className="access-table-wrap">
              <table className="org-table">
                <thead>
                  <tr>
                    <th>Unidade</th>
                    <th>Tipo</th>
                    <th>Empresa</th>
                    <th>Situação</th>
                    <th>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {units
                    .slice(currentPage * 5, currentPage * 5 + 5)
                    .map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.name}</strong>
                          <small>
                            {u.code}
                            {u.cnpj ? " · " + formatCnpj(u.cnpj) : ""}
                          </small>
                        </td>
                        <td>{UNIT_KINDS[u.kind]}</td>
                        <td>
                          {
                            data?.companies.find((c) => c.id === u.companyId)
                              ?.tradeName
                          }
                        </td>
                        <td>
                          <span
                            className={`access-badge ${u.available ? "good" : "off"}`}
                          >
                            {u.available
                              ? "Disponível"
                              : !u.active
                                ? "Inativa"
                                : "Bloqueada por vínculo superior"}
                          </span>
                        </td>
                        <td>
                          {data?.canManage && (
                            <button
                              className="org-edit"
                              onClick={() => openUnit(u)}
                              aria-label={`Editar cadastro ${u.name}`}
                            >
                              <ChevronRight size={18} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!units.length && !loading && (
              <p className="access-empty">
                Nenhuma unidade encontrada para estes filtros.
              </p>
            )}
            <div className="access-table-footer">
              <span>{units.length} unidade(s) autorizada(s)</span>
              <div className="access-pagination">
                <button
                  aria-label="Página anterior de unidades"
                  onClick={() => setPageIndex(currentPage - 1)}
                  disabled={!currentPage}
                >
                  ‹
                </button>
                <span>
                  {currentPage + 1} / {pages}
                </span>
                <button
                  aria-label="Próxima página de unidades"
                  onClick={() => setPageIndex(currentPage + 1)}
                  disabled={currentPage >= pages - 1}
                >
                  ›
                </button>
              </div>
            </div>
          </section>
        </div>
        <aside
          className="access-card org-editor"
          ref={editor}
          tabIndex={-1}
          aria-label="Cadastro organizacional"
        >
          <h2>
            <Building2 size={22} />
            {mode === "company"
              ? "Cadastro de empresa"
              : mode === "unit"
                ? "Cadastro de unidade"
                : "Gestão da estrutura"}
            {mode && (
              <button
                aria-label="Fechar cadastro"
                onClick={() => setMode(null)}
              >
                <X size={18} />
              </button>
            )}
          </h2>
          {!mode ? (
            <div className="org-editor-empty">
              <div className="org-hero-icon">
                <Network size={48} />
              </div>
              <h3>Da matriz a cada filial.</h3>
              <p>
                Organize empresas, lojas e depósitos com vínculos claros e
                acessos definidos para sua equipe.
              </p>
              {data?.canManage && (
                <>
                  <button
                    className="button primary"
                    onClick={() => openCompany()}
                  >
                    <Plus size={17} />
                    Cadastrar empresa
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => openUnit()}
                    disabled={!data.companies.some((c) => c.active)}
                  >
                    <Store size={17} />
                    Cadastrar unidade
                  </button>
                  <Link href="/usuarios" className="org-access-link">
                    <ShieldCheck size={17} />
                    Definir acesso por filial
                    <ChevronRight size={16} />
                  </Link>
                </>
              )}
              <div className="access-note">
                <LockKeyhole size={18} />
                <p>
                  Somente unidades autorizadas e ativas ficam disponíveis para
                  operação. A inativação preserva os cadastros e seus vínculos.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={save} className="org-form">
              {mode === "company" ? (
                <>
                  <label>
                    Razão social
                    <input
                      aria-label="Razão social"
                      required
                      maxLength={160}
                      value={company.legalName}
                      onChange={(e) =>
                        patchCompany("legalName", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Nome fantasia
                    <input
                      aria-label="Nome fantasia"
                      required
                      maxLength={120}
                      value={company.tradeName}
                      onChange={(e) =>
                        patchCompany("tradeName", e.target.value)
                      }
                    />
                  </label>
                  <div className="org-form-row">
                    <label>
                      CNPJ da empresa
                      <input
                        aria-label="CNPJ da empresa"
                        required
                        maxLength={18}
                        placeholder="00.000.000/0001-00"
                        value={company.cnpj}
                        onChange={(e) =>
                          patchCompany("cnpj", e.target.value.toUpperCase())
                        }
                        disabled={!!company.id}
                      />
                    </label>
                    <label>
                      Código da matriz
                      <input
                        aria-label="Código da matriz"
                        required
                        maxLength={24}
                        placeholder="MATRIZ-01"
                        value={company.matrixCode}
                        onChange={(e) =>
                          patchCompany(
                            "matrixCode",
                            e.target.value.toUpperCase(),
                          )
                        }
                        disabled={!!company.id}
                      />
                    </label>
                  </div>
                  <label>
                    Inscrição estadual
                    <input
                      value={company.stateRegistration}
                      maxLength={30}
                      onChange={(e) =>
                        patchCompany("stateRegistration", e.target.value)
                      }
                    />
                  </label>
                  <div className="org-form-row">
                    <label>
                      E-mail da empresa
                      <input
                        type="email"
                        value={company.email}
                        maxLength={254}
                        onChange={(e) => patchCompany("email", e.target.value)}
                      />
                    </label>
                    <label>
                      Telefone
                      <input
                        type="tel"
                        value={company.phone}
                        maxLength={30}
                        onChange={(e) => patchCompany("phone", e.target.value)}
                      />
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <label>
                    Empresa da unidade
                    <select
                      aria-label="Empresa da unidade"
                      value={unit.companyId}
                      disabled={!!unit.id}
                      required
                      onChange={(e) =>
                        setUnit({
                          ...unit,
                          companyId: e.target.value,
                          parentId:
                            data?.units.find(
                              (u) =>
                                u.companyId === e.target.value &&
                                u.kind === "matriz",
                            )?.id || null,
                        })
                      }
                    >
                      <option value="" disabled>
                        Selecione a empresa
                      </option>
                      {data?.companies
                        .filter((c) => c.active || c.id === unit.companyId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.tradeName}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="org-form-row">
                    <label>
                      Tipo de unidade
                      <select
                        aria-label="Tipo de unidade"
                        value={unit.kind}
                        disabled={!!unit.id}
                        onChange={(e) =>
                          setUnit({
                            ...unit,
                            kind: e.target.value as UnitKind,
                            parentId:
                              data?.units.find(
                                (u) =>
                                  u.companyId === unit.companyId &&
                                  u.kind === "matriz",
                              )?.id || null,
                          })
                        }
                      >
                        {Object.entries(UNIT_KINDS)
                          .filter(
                            ([kind]) =>
                              kind !== "matriz" || unit.kind === "matriz",
                          )
                          .map(([kind, label]) => (
                            <option key={kind} value={kind}>
                              {label}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Código da unidade
                      <input
                        aria-label="Código da unidade"
                        required
                        maxLength={24}
                        value={unit.code}
                        disabled={!!unit.id}
                        onChange={(e) =>
                          patchUnit("code", e.target.value.toUpperCase())
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Nome da unidade
                    <input
                      aria-label="Nome da unidade"
                      required
                      maxLength={120}
                      value={unit.name}
                      onChange={(e) => patchUnit("name", e.target.value)}
                    />
                  </label>
                  {unit.kind !== "matriz" && (
                    <label>
                      Unidade superior
                      <select
                        aria-label="Unidade superior"
                        value={unit.parentId || ""}
                        disabled={!!unit.id}
                        required
                        onChange={(e) => patchUnit("parentId", e.target.value)}
                      >
                        <option value="" disabled>
                          Selecione o vínculo
                        </option>
                        {parents.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {!p.available ? " (indisponível)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    CNPJ da unidade (opcional)
                    <input
                      aria-label="CNPJ da unidade"
                      maxLength={18}
                      value={unit.cnpj || ""}
                      disabled={!!unit.id}
                      onChange={(e) =>
                        patchUnit("cnpj", e.target.value.toUpperCase() || null)
                      }
                      placeholder="Use a mesma raiz de CNPJ da empresa"
                    />
                  </label>
                </>
              )}
              <div className="org-form-divider">
                <MapPin size={16} />
                Localização
              </div>
              <label>
                Endereço
                <input
                  aria-label="Endereço"
                  maxLength={240}
                  value={mode === "company" ? company.address : unit.address}
                  onChange={(e) =>
                    mode === "company"
                      ? patchCompany("address", e.target.value)
                      : patchUnit("address", e.target.value)
                  }
                />
              </label>
              <div className="org-form-row">
                <label>
                  Cidade
                  <input
                    aria-label="Cidade"
                    maxLength={100}
                    value={mode === "company" ? company.city : unit.city}
                    onChange={(e) =>
                      mode === "company"
                        ? patchCompany("city", e.target.value)
                        : patchUnit("city", e.target.value)
                    }
                  />
                </label>
                <label>
                  UF
                  <select
                    aria-label="UF"
                    value={mode === "company" ? company.state : unit.state}
                    onChange={(e) =>
                      mode === "company"
                        ? patchCompany("state", e.target.value)
                        : patchUnit("state", e.target.value)
                    }
                  >
                    <option value="">Selecione</option>
                    {states.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="org-form-row">
                <label>
                  CEP
                  <input
                    aria-label="CEP"
                    maxLength={9}
                    value={
                      mode === "company" ? company.postalCode : unit.postalCode
                    }
                    onChange={(e) =>
                      mode === "company"
                        ? patchCompany("postalCode", e.target.value)
                        : patchUnit("postalCode", e.target.value)
                    }
                  />
                </label>
                <label>
                  Situação
                  <select
                    aria-label="Situação do cadastro"
                    value={
                      (mode === "company" ? company.active : unit.active)
                        ? "active"
                        : "inactive"
                    }
                    onChange={(e) =>
                      mode === "company"
                        ? patchCompany("active", e.target.value === "active")
                        : patchUnit("active", e.target.value === "active")
                    }
                  >
                    <option value="active">Ativa</option>
                    <option value="inactive">Inativa</option>
                  </select>
                </label>
              </div>
              <div className="access-note">
                <ShieldCheck size={18} />
                <p>
                  {mode === "company"
                    ? "Ao cadastrar uma empresa, a matriz é criada na mesma transação. O CNPJ é validado pelo dígito verificador; a situação fiscal não é consultada."
                    : "A unidade pertence à empresa e ao vínculo superior escolhidos. Código, tipo, CNPJ e vínculos são permanentes após o cadastro."}
                </p>
              </div>
              <div className="access-form-footer">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setMode(null)}
                  disabled={busy}
                >
                  Cancelar
                </button>
                <button className="button primary" disabled={busy}>
                  <Save size={17} />
                  {busy
                    ? "Salvando…"
                    : mode === "company"
                      ? "Salvar empresa"
                      : "Salvar unidade"}
                </button>
              </div>
            </form>
          )}
        </aside>
      </div>
    </section>
  );
}
