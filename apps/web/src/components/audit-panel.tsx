"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  ShieldCheck,
  History,
  Network,
  Search,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  Clock,
  UserRound,
  X,
  Link2,
  LockKeyhole,
  ArrowRight,
} from "lucide-react";
import {
  REPORT_KINDS,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_FIELDS,
  PERMISSIONS,
  UNIT_KINDS,
  MOVEMENT_KINDS,
  type AuditEntry,
  type AuditPage,
  type AuditCategory,
  type AuthSession,
} from "@invictus/contracts";
import { auditRequest } from "../lib/audit-client";
import { AuthClientError } from "../lib/auth-client";
import "../app/access.css";
import "../app/audit.css";
const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Fortaleza",
  }).format(new Date(value));
const valueLabel = (key: string, value: unknown): string => {
  if (value === undefined || value === null || value === "") return "—";
  if(key === "report_kind")return REPORT_KINDS[value as keyof typeof REPORT_KINDS]||String(value);
  if(key === "source" && (value === "manual" || value === "sandbox"))return value === "sandbox"?"PDV simulado":"Manual";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (key === "kind")
    return (
      UNIT_KINDS[value as keyof typeof UNIT_KINDS] ||
      MOVEMENT_KINDS[value as keyof typeof MOVEMENT_KINDS] ||
      String(value)
    );
  if(key === "changedFields" && Array.isArray(value))return value.map(k=>AUDIT_FIELDS[String(k)]||String(k)).join(", ");
  if (Array.isArray(value))
    return (
      value
        .map((v) => {
          if (v && typeof v === "object") {
            const item = v as Record<string, unknown>;
            if (key === "items" && item.name)
              return `${item.name} · Quantidade: ${item.quantity ?? "—"} · Fator: ${item.factor ?? "—"}${item.unitPrice !== undefined ? ` · Preço unitário: ${item.unitPrice}` : ""}${item.unitCost !== undefined ? ` · Custo unitário: ${item.unitCost}` : ""} · Valor total: ${item.totalValue ?? item.total ?? "—"}${item.receivedQuantity !== undefined ? ` · Recebido: ${item.receivedQuantity} · Valor recebido: ${item.receivedValue}` : ""}`;
            return JSON.stringify(v);
          }
          return PERMISSIONS.find((p) => p.key === v)?.label || String(v);
        })
        .join(" · ") || "Nenhuma"
    );
  if (key.endsWith("_at") && typeof value === "string") return date(value);
  return typeof value === "object" ? JSON.stringify(value) : String(value);
};
const initialFilters = {
  query: "",
  category: "",
  action: "",
  actor: "",
  unitId: "",
  from: "",
  to: "",
  requestId: "",
};
export function AuditPanel({ session }: { session: AuthSession }) {
  const router = useRouter();
  const hasNetwork = session.permissions.includes("audit.read");
  const [scope, setScope] = useState<"network" | "personal">(
    hasNetwork ? "network" : "personal",
  );
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const detailRef = useRef<HTMLElement>(null);
  const detailVersion = useRef(0);
  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      setLoading(true);
      setError("");
      try {
        const params: Record<string, string> = {
          scope,
          page: String(page),
          pageSize: String(pageSize),
        };
        for (const [key, value] of Object.entries(filters))
          if (value) params[key] = value;
        const next = await auditRequest<AuditPage>("events", params);
        if (!signal.cancelled) setData(next);
      } catch (e) {
        if (!signal.cancelled) {
          setData(null);
          setError(
            e instanceof Error ? e.message : "Falha ao consultar o histórico.",
          );
          if (e instanceof AuthClientError && e.status === 401) {
            router.replace("/login");
            router.refresh();
          }
        }
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    },
    [scope, filters, page, pageSize, refresh, router],
  );
  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);
  function resetDetail() {
    detailVersion.current++;
    setSelected(null);
    setDetailLoading(false);
  }
  useEffect(() => {
    const refreshOnFocus = () => {
      resetDetail();
      setRefresh((value) => value + 1);
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      detailVersion.current++;
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, []);
  useEffect(() => {
    if (!hasNetwork && scope === "network") {
      setScope("personal");
      setData(null);
      resetDetail();
    }
  }, [hasNetwork, scope]);
  function switchScope(next: "network" | "personal") {
    setScope(next);
    setDraft(initialFilters);
    setFilters(initialFilters);
    setPage(0);
    resetDetail();
    setData(null);
  }
  async function open(entry: AuditEntry) {
    const version = ++detailVersion.current;
    setDetailLoading(true);
    setError("");
    try {
      const current = await auditRequest<AuditEntry>("events/" + entry.id, {
        scope,
      });
      if (version === detailVersion.current) {
        setSelected(current);
        requestAnimationFrame(() => {
          detailRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
          detailRef.current?.focus();
        });
      }
    } catch (e) {
      if (version === detailVersion.current) {
        setSelected(null);
        setError(e instanceof Error ? e.message : "Evento indisponível.");
      }
    } finally {
      if (version === detailVersion.current) setDetailLoading(false);
    }
  }
  const keys = selected?.legacy
    ? []
    : [
        ...new Set([
          ...Object.keys(selected?.before || {}),
          ...Object.keys(selected?.after || {}),
        ]),
      ]
        .filter(
          (key) =>
            JSON.stringify(selected?.before?.[key]) !==
            JSON.stringify(selected?.after?.[key]),
        )
        .filter(
          (key) =>
            !(
              key === "unit_id" &&
              (selected?.before?.unit_name || selected?.after?.unit_name)
            ),
        );
  const categories = Object.entries(AUDIT_CATEGORIES).filter(([key]) =>
    scope === "personal"
      ? ["security", "context"].includes(key)
      : !["security", "context"].includes(key),
  );
  const pages = Math.max(1, Math.ceil((data?.total || 0) / pageSize));
  return (
    <section className="audit-area" aria-label="Consulta de auditoria">
      <div className="audit-summary">
        {[
          {
            label: "Eventos encontrados",
            value: data?.total,
            Icon: ClipboardList,
          },
          {
            label: "Alterações detalhadas",
            value: data?.summary.changes,
            Icon: History,
          },
          {
            label: "Operações correlacionadas",
            value: data?.summary.operations,
            Icon: Link2,
          },
          {
            label: "Registros anteriores",
            value: data?.summary.legacy,
            Icon: Clock,
          },
        ].map(({ label, value, Icon }) => (
          <article key={label}>
            <Icon size={27} />
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
      <div className="audit-layout">
        <div className="audit-content">
          <section className="access-card">
            <div className="audit-tabs">
              {hasNetwork && (
                <button
                  className={scope === "network" ? "selected" : ""}
                  onClick={() => switchScope("network")}
                  aria-pressed={scope === "network"}
                >
                  <Network size={18} />
                  Histórico da rede
                </button>
              )}
              <button
                className={scope === "personal" ? "selected" : ""}
                onClick={() => switchScope("personal")}
                aria-pressed={scope === "personal"}
              >
                <ShieldCheck size={18} />
                Minha segurança
              </button>
            </div>
            <form
              className="audit-filters"
              onSubmit={(e) => {
                e.preventDefault();
                setFilters({ ...draft });
                setPage(0);
                resetDetail();
                setRefresh(refresh + 1);
              }}
            >
              <div className="audit-search-row">
                <label className="access-search">
                  <Search size={18} />
                  <input
                    aria-label="Buscar no histórico"
                    maxLength={100}
                    value={draft.query}
                    onChange={(e) =>
                      setDraft({ ...draft, query: e.target.value })
                    }
                    placeholder="Buscar por registro ou responsável…"
                  />
                </label>
                <button className="button primary" disabled={loading}>
                  <Search size={16} />
                  Buscar
                </button>
                <button
                  type="button"
                  className="button secondary"
                  aria-label="Atualizar histórico"
                  onClick={() => {
                    setPage(0);
                    resetDetail();
                    setRefresh(refresh + 1);
                  }}
                  disabled={loading}
                >
                  <RefreshCw size={17} />
                </button>
              </div>
              <div className="audit-filter-grid">
                <label>
                  Categoria
                  <select
                    aria-label="Categoria do histórico"
                    value={draft.category}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        category: e.target.value,
                        action: "",
                      })
                    }
                  >
                    <option value="">Todas as categorias</option>
                    {categories.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Responsável
                  <select
                    aria-label="Responsável pela alteração"
                    value={draft.actor}
                    onChange={(e) =>
                      setDraft({ ...draft, actor: e.target.value })
                    }
                  >
                    <option value="">Todos os responsáveis</option>
                    {data?.actors.map((actor) => (
                      <option key={actor.id} value={actor.id}>
                        {actor.name}
                      </option>
                    ))}
                  </select>
                </label>
                {scope === "network" && (
                  <label>
                    Filial / Unidade
                    <select
                      aria-label="Unidade do histórico"
                      value={draft.unitId}
                      onChange={(e) =>
                        setDraft({ ...draft, unitId: e.target.value })
                      }
                    >
                      <option value="">Todas as autorizadas</option>
                      {data?.units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Data inicial
                  <input
                    aria-label="Data inicial do histórico"
                    type="date"
                    value={draft.from}
                    onChange={(e) =>
                      setDraft({ ...draft, from: e.target.value })
                    }
                  />
                </label>
                <label>
                  Data final
                  <input
                    aria-label="Data final do histórico"
                    type="date"
                    value={draft.to}
                    onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                  />
                </label>
              </div>
              <div className="audit-filter-footer">
                <span>
                  <Clock size={13} />
                  Horário de Fortaleza · UTC−3
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(initialFilters);
                    setFilters(initialFilters);
                    setPage(0);
                    resetDetail();
                  }}
                >
                  <X size={13} />
                  Limpar filtros
                </button>
              </div>
              {filters.requestId && (
                <div className="audit-correlation-filter">
                  <Link2 size={15} />
                  Mesma operação: <code>{filters.requestId}</code>
                  <button
                    type="button"
                    aria-label="Remover filtro da operação"
                    onClick={() => {
                      setFilters({ ...filters, requestId: "" });
                      setDraft({ ...draft, requestId: "" });
                      setPage(0);
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </form>
            <div className="audit-list-title">
              <h2>
                <History size={18} />
                {scope === "network"
                  ? "Linha do tempo da rede"
                  : "Atividades da minha conta"}
              </h2>
              <span>Somente leitura</span>
            </div>
            {loading ? (
              <p className="access-empty" role="status">
                Consultando histórico…
              </p>
            ) : !data ? (
              <div className="access-empty">
                <LockKeyhole size={32} />
                <h3>Histórico indisponível</h3>
                <p>Confira sua conexão e a permissão de acesso.</p>
              </div>
            ) : !data.items.length ? (
              <div className="audit-empty">
                <History size={40} />
                <h3>Nenhum evento encontrado</h3>
                <p>
                  Altere os filtros ou aguarde as primeiras alterações
                  autorizadas.
                </p>
              </div>
            ) : (
              <div className="audit-table-wrap">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Data e hora</th>
                      <th>Alteração / Registro</th>
                      <th>Responsável</th>
                      <th>
                        <span className="sr-only">Detalhes</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((entry) => (
                      <tr
                        key={entry.id}
                        className={selected?.id === entry.id ? "selected" : ""}
                      >
                        <td>
                          <span className="audit-date">
                            {date(entry.createdAt)}
                          </span>
                          <small>{AUDIT_CATEGORIES[entry.category]}</small>
                        </td>
                        <td>
                          <strong>
                            {AUDIT_ACTIONS[entry.action] || entry.action}
                          </strong>
                          <span>{entry.targetLabel}</span>
                          {entry.legacy && (
                            <small className="audit-legacy-badge">
                              Histórico anterior
                            </small>
                          )}
                        </td>
                        <td>
                          <span className="audit-actor">
                            <UserRound size={14} />
                            {entry.actorName}
                          </span>
                        </td>
                        <td>
                          <button
                            className="audit-open"
                            aria-label={`Detalhes do evento ${entry.id}`}
                            onClick={() => void open(entry)}
                          >
                            <ChevronRight size={17} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="audit-pagination">
              <span>{data?.total || 0} registro(s) autorizado(s)</span>
              <label>
                Por página
                <select
                  aria-label="Eventos por página"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(0);
                  }}
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
              </label>
              <div>
                <button
                  aria-label="Página anterior do histórico"
                  disabled={loading || page === 0}
                  onClick={() => {
                    setPage(page - 1);
                    resetDetail();
                  }}
                >
                  ‹
                </button>
                <span>
                  {page + 1} / {pages}
                </span>
                <button
                  aria-label="Próxima página do histórico"
                  disabled={loading || page >= pages - 1}
                  onClick={() => {
                    setPage(page + 1);
                    resetDetail();
                  }}
                >
                  ›
                </button>
              </div>
            </div>
          </section>
          <div className="audit-retention">
            <ShieldCheck size={17} />
            <p>
              Histórico preservado, sem edição ou exclusão pela aplicação. A
              consulta respeita seus acessos atuais.
            </p>
          </div>
        </div>
        <aside
          className="access-card audit-detail"
          ref={detailRef}
          tabIndex={-1}
          aria-label="Detalhes da auditoria"
        >
          <h2>
            <ClipboardList size={21} />
            Detalhes da alteração
            {selected && (
              <button
                aria-label="Fechar detalhes da auditoria"
                onClick={resetDetail}
              >
                <X size={18} />
              </button>
            )}
          </h2>
          {detailLoading ? (
            <p className="access-empty" role="status">
              Carregando detalhes…
            </p>
          ) : !selected ? (
            <div className="audit-detail-empty">
              <div>
                <History size={44} />
              </div>
              <h3>Cada alteração tem uma história.</h3>
              <p>
                Selecione um evento para conferir o responsável e os valores
                anteriores e posteriores.
              </p>
              <div className="access-note">
                <LockKeyhole size={18} />
                <p>
                  Dados de senha, códigos de autenticação, cookies e tokens não
                  são incluídos no histórico.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="audit-detail-meta">
                <span className="audit-category">
                  {AUDIT_CATEGORIES[selected.category]}
                </span>
                <h3>{AUDIT_ACTIONS[selected.action] || selected.action}</h3>
                <p>{selected.targetLabel}</p>
                <dl>
                  <div>
                    <dt>
                      <UserRound size={14} />
                      Responsável
                    </dt>
                    <dd>{selected.actorName}</dd>
                  </div>
                  <div>
                    <dt>
                      <Clock size={14} />
                      Data e hora
                    </dt>
                    <dd>{date(selected.createdAt)}</dd>
                  </div>
                </dl>
              </div>
              {selected.legacy ? (
                <div className="audit-legacy-note">
                  <History size={20} />
                  <p>
                    Registro anterior à auditoria detalhada. Os valores de
                    antes/depois e o identificador da operação não estão
                    disponíveis.
                  </p>
                </div>
              ) : keys.length ? (
                <div className="audit-diff-wrap">
                  <table className="audit-diff">
                    <thead>
                      <tr>
                        <th>Campo</th>
                        <th>Antes</th>
                        <th>Depois</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((key) => (
                        <tr key={key}>
                          <th>{AUDIT_FIELDS[key] || key}</th>
                          <td>{valueLabel(key, selected.before?.[key])}</td>
                          <td>{valueLabel(key, selected.after?.[key])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="audit-event-note">
                  Evento de segurança registrado sem copiar dados de
                  credenciais.
                </p>
              )}
              {selected.requestId && (
                <div className="audit-operation">
                  <span>
                    <Link2 size={15} />
                    Identificador da operação
                  </span>
                  <code>{selected.requestId}</code>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setFilters({
                        ...initialFilters,
                        requestId: selected.requestId!,
                      });
                      setDraft({
                        ...initialFilters,
                        requestId: selected.requestId!,
                      });
                      setPage(0);
                    }}
                  >
                    <Link2 size={15} />
                    Ver eventos da mesma operação
                  </button>
                </div>
              )}
              <details className="audit-identifiers">
                <summary>Identificação do registro</summary>
                <p>
                  Evento <code>{selected.id}</code>
                </p>
                {selected.entityId && (
                  <p>
                    Cadastro <code>{selected.entityId}</code>
                  </p>
                )}
              </details>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
