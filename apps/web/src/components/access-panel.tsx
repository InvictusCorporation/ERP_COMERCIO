"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  ShieldCheck,
  Mail,
  Search,
  RefreshCw,
  LockKeyhole,
  Save,
  Check,
  Building2,
  KeyRound,
  X,
  ChevronRight,
} from "lucide-react";
import {
  PERMISSIONS,
  type AuthSession,
  type AccessOverview,
  type AccessMember,
  type AccessRole,
  type Permission,
} from "@invictus/contracts";
import { accessRequest } from "../lib/access-client";
import { AuthClientError } from "../lib/auth-client";
import "../app/access.css";
export function AccessPanel({
  session,
  initialTab = "users",
}: {
  session: AuthSession;
  initialTab?: "users" | "roles";
}) {
  const router = useRouter();
  const [data, setData] = useState<AccessOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [tab, setTab] = useState(initialTab);
  const [mode, setMode] = useState<"invite" | "member" | "role" | null>(null);
  const [member, setMember] = useState<AccessMember | null>(null);
  const [role, setRole] = useState<AccessRole | null>(null);
  const [roleId, setRoleId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [active, setActive] = useState(true);
  const [allUnits, setAllUnits] = useState(true);
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const editor = useRef<HTMLElement>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await accessRequest<AccessOverview>("overview");
      setData(next);
      setError("");
      return next;
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Falha ao consultar a equipe.");
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
  useEffect(() => {
    const focus = () => {
      if (!mode) void load();
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [load, mode]);
  const can = (p: Permission) => !!data?.permissions.includes(p);
  const grant = (r: AccessRole) =>
    !!data && r.permissions.every((p) => data.permissions.includes(p));
  function open(
    kind: "invite" | "member" | "role",
    item?: AccessMember | AccessRole,
  ) {
    setError("");
    setNotice("");
    setMode(kind);
    setMember(kind === "member" ? (item as AccessMember) : null);
    setRole(kind === "role" ? (item as AccessRole) || null : null);
    setName(item?.name || "");
    setEmail(kind === "member" ? (item as AccessMember).email : "");
    setActive(kind === "member" ? (item as AccessMember).active : true);
    setAllUnits(kind === "member" ? (item as AccessMember).allUnits : true);
    setUnitIds(kind === "member" ? (item as AccessMember).unitIds : []);
    setRoleId(
      kind === "member"
        ? (item as AccessMember).roleId
        : data?.roles.find((r) => r.name === "Operador de caixa" && r.system)
            ?.id || "",
    );
    setPermissions(
      kind === "role" ? (item as AccessRole)?.permissions || [] : [],
    );
    requestAnimationFrame(() => {
      editor.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      editor.current?.focus();
    });
  }
  async function perform(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setMode(null);
      await load();
      router.refresh();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "invite")
      await perform(
        () =>
          accessRequest(
            "invitations",
            { name, email, roleId, allUnits, unitIds: allUnits ? [] : unitIds },
            session.csrf,
          ),
        "Convite preparado para envio ao e-mail informado.",
      );
    if (mode === "member" && member)
      await perform(
        () =>
          accessRequest(
            "members/change",
            {
              id: member.id,
              roleId,
              active,
              allUnits,
              unitIds: allUnits ? [] : unitIds,
            },
            session.csrf,
          ),
        "Acesso atualizado. A alteração já vale para esta empresa.",
      );
    if (mode === "role")
      await perform(
        () =>
          accessRequest(
            "roles/save",
            { ...(role ? { id: role.id } : {}), name, permissions },
            session.csrf,
          ),
        "Perfil salvo. As permissões já foram atualizadas.",
      );
  }
  const rows =
    data?.members.filter(
      (m) =>
        (filter === "all" || (filter === "active" ? m.active : !m.active)) &&
        [m.name, m.email, m.roleName].some((v) =>
          v
            .toLocaleLowerCase("pt-BR")
            .includes(search.toLocaleLowerCase("pt-BR")),
        ),
    ) || [];
  const pages = Math.max(1, Math.ceil(rows.length / 5));
  const currentPage = Math.min(pageIndex, pages - 1);
  return (
    <section className="access-area" aria-label="Administração de acessos">
      <div className="access-summary">
        {[
          {
            label: "Usuários ativos",
            value: data?.members.filter((m) => m.active).length,
            Icon: Users,
          },
          {
            label: "Convites pendentes",
            value: data?.invitations.filter((i) => i.status === "pending")
              .length,
            Icon: Mail,
          },
          {
            label: "Perfis de acesso",
            value: data?.roles.length,
            Icon: ShieldCheck,
          },
          {
            label: "Empresa selecionada",
            value: data?.tenant.name,
            Icon: Building2,
          },
        ].map(({ label, value, Icon }) => (
          <article key={label}>
            <Icon size={28} />
            <div>
              <span>{label}</span>
              <strong>{value === undefined ? "—" : value}</strong>
            </div>
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
      <div className="access-layout">
        <div className="access-content">
          <section className="access-card">
            <div className="access-tabs" aria-label="Seções de acesso">
              <button
                className={tab === "users" ? "selected" : ""}
                onClick={() => {
                  setTab("users");
                  setMode(null);
                }}
                aria-pressed={tab === "users"}
              >
                <Users size={18} />
                Usuários
              </button>
              <button
                className={tab === "roles" ? "selected" : ""}
                onClick={() => {
                  setTab("roles");
                  setMode(null);
                }}
                aria-pressed={tab === "roles"}
              >
                <ShieldCheck size={18} />
                Perfis e permissões
              </button>
            </div>
            <div className="access-toolbar">
              <label className="access-search">
                <Search size={18} />
                <input
                  aria-label="Buscar usuários"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPageIndex(0);
                  }}
                  placeholder="Buscar por nome, e-mail ou perfil…"
                  disabled={tab !== "users"}
                />
              </label>
              <button
                className="button secondary"
                onClick={() => {
                  setMode(null);
                  void load();
                }}
                disabled={busy || loading}
                aria-label="Atualizar usuários"
              >
                <RefreshCw size={17} />
              </button>
            </div>
            <div className="access-actions">
              {tab === "users" ? (
                <>
                  <select
                    aria-label="Filtrar usuários"
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value);
                      setPageIndex(0);
                    }}
                  >
                    <option value="all">Todos os usuários</option>
                    <option value="active">Ativos</option>
                    <option value="suspended">Suspensos</option>
                  </select>
                  {can("users.manage") && (
                    <button
                      className="button primary"
                      onClick={() => open("invite")}
                    >
                      <UserPlus size={17} />
                      Novo usuário
                    </button>
                  )}
                </>
              ) : (
                <>
                  {can("roles.manage") && (
                    <button
                      className="button primary"
                      onClick={() => open("role")}
                    >
                      <ShieldCheck size={17} />
                      Novo perfil
                    </button>
                  )}
                  <span className="access-muted">Permissões por empresa</span>
                </>
              )}
            </div>
            {loading ? (
              <p className="access-empty" role="status">
                Carregando acessos…
              </p>
            ) : !data ? (
              <div className="access-empty">
                <LockKeyhole size={30} />
                <h2>Acesso indisponível</h2>
                <p>
                  Selecione uma empresa autorizada ou solicite acesso ao
                  proprietário.
                </p>
                <Link href="/">Voltar ao painel</Link>
              </div>
            ) : tab === "users" ? (
              <>
                <div className="access-table-wrap">
                  <table className="access-table">
                    <thead>
                      <tr>
                        <th>Usuário</th>
                        <th>Perfil</th>
                        <th>Escopo</th>
                        <th>Situação</th>
                        <th>
                          <span className="sr-only">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows
                        .slice(currentPage * 5, currentPage * 5 + 5)
                        .map((m) => (
                          <tr key={m.id}>
                            <td>
                              <div className="access-user">
                                <span className="user-monogram">
                                  {m.name
                                    .slice(0, 2)
                                    .toLocaleUpperCase("pt-BR")}
                                </span>
                                <div>
                                  <strong>{m.name}</strong>
                                  <small>{m.email}</small>
                                </div>
                              </div>
                            </td>
                            <td>
                              {m.roleName}
                              {m.mfaEnabled && (
                                <small className="access-mfa">
                                  <ShieldCheck size={12} />
                                  Duas etapas
                                </small>
                              )}
                            </td>
                            <td>
                              <span className="access-muted">
                                {m.allUnits
                                  ? "Toda a rede"
                                  : `${m.unitIds.length} unidade(s)`}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`access-badge ${m.active ? "good" : "off"}`}
                              >
                                {m.active ? "Ativo" : "Suspenso"}
                              </span>
                            </td>
                            <td>
                              {can("users.manage") &&
                                (!m.isOwner || can("ownership.manage")) && (
                                  <button
                                    className="access-edit"
                                    onClick={() => open("member", m)}
                                    aria-label={`Editar ${m.name}`}
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
                {!rows.length && (
                  <p className="access-empty">
                    Nenhum usuário encontrado para esta busca.
                  </p>
                )}
                <div className="access-table-footer">
                  <span>
                    {rows.length} usuário(s) · {data.tenant.name}
                  </span>
                  <div className="access-pagination">
                    <button
                      aria-label="Página anterior de usuários"
                      disabled={currentPage === 0}
                      onClick={() => setPageIndex(currentPage - 1)}
                    >
                      ‹
                    </button>
                    <span>
                      {currentPage + 1} / {pages}
                    </span>
                    <button
                      aria-label="Próxima página de usuários"
                      disabled={currentPage >= pages - 1}
                      onClick={() => setPageIndex(currentPage + 1)}
                    >
                      ›
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="access-role-list">
                {data.roles.map((r) => (
                  <article key={r.id}>
                    <ShieldCheck size={24} />
                    <div>
                      <strong>{r.name}</strong>
                      <p>
                        {r.permissions.length
                          ? r.permissions
                              .map(
                                (p) =>
                                  PERMISSIONS.find((x) => x.key === p)?.label,
                              )
                              .join(" · ")
                          : "Sem acesso à administração de usuários"}
                      </p>
                      <small>
                        {r.system ? "Perfil padrão" : "Perfil personalizado"}
                        {r.sensitive
                          ? " · Autenticação em duas etapas obrigatória"
                          : ""}
                      </small>
                    </div>
                    {can("roles.manage") && !r.system && grant(r) && (
                      <button
                        className="button secondary"
                        onClick={() => open("role", r)}
                        aria-label={`Editar perfil ${r.name}`}
                      >
                        Editar
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
          {data && tab === "users" && can("users.manage") && (
            <section className="access-card access-invites">
              <h2>
                <Mail size={20} />
                Convites da equipe
              </h2>
              {!data.invitations.length ? (
                <p className="access-empty">
                  Nenhum convite enviado. Comece por “Novo usuário”.
                </p>
              ) : (
                data.invitations.map((i) => (
                  <article key={i.id}>
                    <div>
                      <strong>{i.name}</strong>
                      <small>{i.email}</small>
                      <span>
                        {i.roleName} ·{" "}
                        {
                          {
                            pending: "Pendente",
                            accepted: "Aceito",
                            revoked: "Revogado",
                            expired: "Expirado",
                          }[i.status]
                        }
                      </span>
                    </div>
                    {i.status === "pending" && (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void perform(
                            () =>
                              accessRequest(
                                "invitations/revoke",
                                { id: i.id },
                                session.csrf,
                              ),
                            "Convite revogado.",
                          )
                        }
                        aria-label={`Revogar convite de ${i.name}`}
                      >
                        Revogar
                      </button>
                    )}
                  </article>
                ))
              )}
            </section>
          )}
        </div>
        <aside
          className="access-card access-editor"
          ref={editor}
          tabIndex={-1}
          aria-label="Edição de acesso"
        >
          <h2>
            {mode === "member" ? (
              <Users size={22} />
            ) : mode === "role" ? (
              <ShieldCheck size={22} />
            ) : (
              <UserPlus size={22} />
            )}{" "}
            {mode === "member"
              ? "Editar acesso"
              : mode === "role"
                ? "Configurar perfil"
                : "Cadastro de usuário"}
            {mode && (
              <button aria-label="Fechar edição" onClick={() => setMode(null)}>
                <X size={18} />
              </button>
            )}
          </h2>
          {!mode ? (
            <div className="access-editor-empty">
              <div className="access-editor-icon">
                <ShieldCheck size={40} />
              </div>
              <h3>Cada pessoa, o acesso certo.</h3>
              <p>
                Convide sua equipe e escolha o que cada perfil pode administrar
                na empresa.
              </p>
              {can("users.manage") && (
                <button
                  className="button primary"
                  onClick={() => open("invite")}
                >
                  <UserPlus size={17} />
                  Convidar pessoa
                </button>
              )}
              <div className="access-note">
                <LockKeyhole size={18} />
                <p>
                  O usuário define a própria senha. Acesso de proprietário exige
                  autenticação em duas etapas.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={save} className="access-form">
              <label>
                {mode === "role" ? "Nome do perfil" : "Nome completo"}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={mode === "role" ? 80 : 120}
                  disabled={mode === "member"}
                  autoComplete="off"
                />
              </label>
              {mode !== "role" && (
                <>
                  <label>
                    E-mail
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      maxLength={254}
                      disabled={mode === "member"}
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    Perfil de acesso
                    <select
                      value={roleId}
                      onChange={(e) => {
                        setRoleId(e.target.value);
                        if (
                          data?.roles
                            .find((r) => r.id === e.target.value)
                            ?.permissions.includes("ownership.manage")
                        ) {
                          setAllUnits(true);
                          setUnitIds([]);
                        }
                      }}
                      required
                    >
                      {data?.roles
                        .filter((r) => grant(r))
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="access-scope">
                    <Building2 size={18} />
                    <span>
                      Rede: <strong>{data?.tenant.name}</strong>
                    </span>
                  </div>
                  <fieldset className="unit-scope-editor">
                    <legend>Acesso por filial / unidade</legend>
                    <label>
                      Escopo de acesso
                      <select
                        aria-label="Escopo de acesso"
                        value={allUnits ? "all" : "selected"}
                        onChange={(e) => {
                          setAllUnits(e.target.value === "all");
                          setUnitIds([]);
                        }}
                        disabled={data?.roles
                          .find((r) => r.id === roleId)
                          ?.permissions.includes("ownership.manage")}
                      >
                        <option value="all">
                          Toda a rede (inclui novas unidades)
                        </option>
                        <option value="selected">
                          Somente unidades selecionadas
                        </option>
                      </select>
                    </label>
                    {!allUnits && (
                      <>
                        <p>
                          Marque cada filial ou depósito autorizado. O vínculo
                          superior não é incluído automaticamente.
                        </p>
                        <div className="scope-unit-options">
                          {data?.units.map((u) => (
                            <label key={u.id}>
                              <input
                                type="checkbox"
                                checked={unitIds.includes(u.id)}
                                onChange={(e) =>
                                  setUnitIds(
                                    e.target.checked
                                      ? [...unitIds, u.id]
                                      : unitIds.filter((id) => id !== u.id),
                                  )
                                }
                              />
                              <span>
                                {u.name}
                                <small>
                                  {u.companyName} · {u.code}
                                </small>
                              </span>
                            </label>
                          ))}
                        </div>
                        {!data?.units.length && (
                          <p>
                            Cadastre e ative as unidades antes de restringir o
                            acesso.
                          </p>
                        )}
                        {unitIds.some(
                          (id) => !data?.units.some((u) => u.id === id),
                        ) && (
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() =>
                              setUnitIds(
                                unitIds.filter((id) =>
                                  data?.units.some((u) => u.id === id),
                                ),
                              )
                            }
                          >
                            Remover unidades indisponíveis do escopo
                          </button>
                        )}
                        <p>
                          Administração da rede e da equipe exige escopo “Toda a
                          rede”.
                        </p>
                      </>
                    )}
                  </fieldset>
                </>
              )}
              {mode === "member" && (
                <label>
                  Situação
                  <select
                    value={active ? "active" : "suspended"}
                    onChange={(e) => setActive(e.target.value === "active")}
                  >
                    <option value="active">Ativo</option>
                    <option value="suspended">Suspenso</option>
                  </select>
                </label>
              )}
              {mode === "role" && (
                <fieldset>
                  <legend>Permissões deste perfil</legend>
                  {PERMISSIONS.filter((p) => p.key !== "ownership.manage").map(
                    (p) => (
                      <label className="access-checkbox" key={p.key}>
                        <input
                          type="checkbox"
                          checked={permissions.includes(p.key)}
                          disabled={!can(p.key)}
                          onChange={(e) =>
                            setPermissions(
                              e.target.checked
                                ? [...permissions, p.key]
                                : permissions.filter((v) => v !== p.key),
                            )
                          }
                        />
                        <span>
                          <strong>{p.label}</strong>
                          <small>{p.description}</small>
                        </span>
                      </label>
                    ),
                  )}
                </fieldset>
              )}
              <div className="access-note">
                <KeyRound size={18} />
                <p>
                  {mode === "invite"
                    ? "O convite vale por 7 dias e será enviado ao e-mail informado. Uma conta existente precisa entrar para aceitar."
                    : mode === "role"
                      ? "Perfis com administração exigem autenticação em duas etapas. Alterações valem imediatamente."
                      : "A suspensão bloqueia esta empresa e preserva os demais vínculos e o histórico."}
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
                  {mode === "invite" ? <Mail size={17} /> : <Save size={17} />}{" "}
                  {busy
                    ? "Salvando…"
                    : mode === "invite"
                      ? "Enviar convite"
                      : "Salvar alterações"}
                </button>
              </div>
            </form>
          )}
        </aside>
      </div>
    </section>
  );
}
