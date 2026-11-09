"use client";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Package,
  Boxes,
  TriangleAlert,
  Search,
  Plus,
  Save,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  History,
  ShieldCheck,
  Barcode,
  ChevronLeft,
  ChevronRight,
  X,
  TrendingUp,
} from "lucide-react";
import {
  BASE_UNITS,
  MOVEMENT_KINDS,
  type AuthSession,
  type ProductInput,
  type InventoryPage,
  type ProductDetail,
  type MovementKind,
} from "@invictus/contracts";
import { inventoryRequest } from "../lib/inventory-client";
import { AuthClientError } from "../lib/auth-client";
import "../app/inventory.css";
const money = (n: string | number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qty = (n: string | number) =>
  Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const empty: ProductInput = {
  code: "",
  name: "",
  description: "",
  category: "",
  brand: "",
  baseUnit: "UN",
  packageName: "",
  packageFactor: "1",
  barcodes: [],
  salePrice: "0",
  desiredMargin: "30",
  minimumMargin: "0",
  minimumStock: "0",
  idealStock: "0",
  active: true,
};
const normalized = (v: string) => v.trim().replace(",", ".");
export function InventoryPanel({ session }: { session: AuthSession }) {
  const router = useRouter();
  const [barcodeText, setBarcodeText] = useState("");
  const [data, setData] = useState<InventoryPage | null>(null),
    [detail, setDetail] = useState<ProductDetail | null>(null),
    [form, setForm] = useState<ProductInput | null>(null),
    [tab, setTab] = useState<"data" | "stock" | "history">("data");
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("active"),
    [page, setPage] = useState(0),
    [filter, setFilter] = useState({ query: "", status: "active", page: 0 });
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<MovementKind>("entry"),
    [quantity, setQuantity] = useState("1"),
    [cost, setCost] = useState("0"),
    [reason, setReason] = useState(""),
    [packaged, setPackaged] = useState(false),
    [key, setKey] = useState("");
  const [minimum, setMinimum] = useState("0"),
    [ideal, setIdeal] = useState("0");
  const generation = useRef(0),
    editor = useRef<HTMLElement>(null);
  const permission = session.permissions.includes("products.read");
  const unit = session.units.find((u) => u.id === session.activeUnitId);
  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof AuthClientError && e.status === 401) {
        router.replace("/login");
        router.refresh();
      }
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível concluir a operação.",
      );
    },
    [router],
  );
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const r = await inventoryRequest<InventoryPage>(
        "products?" +
          new URLSearchParams({
            query: filter.query,
            status: filter.status,
            page: String(filter.page),
          }),
      );
      if (current === generation.current) setData(r);
    } catch (e) {
      if (current === generation.current) {
        setData(null);
        setDetail(null);
        setForm(null);
        fail(e);
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [filter, fail]);
  useEffect(() => {
    if (permission) void load();
    else setLoading(false);
    return () => {
      generation.current++;
    };
  }, [load, permission]);
  useEffect(() => {
    const check = () => {
      setDetail(null);
      setForm(null);
      void load();
    };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [load]);
  function beginOperation() {
    setKey(crypto.randomUUID());
    setReason("");
    setQuantity("1");
    setCost("0");
    setPackaged(false);
    setKind("entry");
  }
  async function select(id: string, scroll = true, movementPage = 0) {
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const r = await inventoryRequest<ProductDetail>(
        "products/" + id + "?page=" + movementPage,
      );
      setDetail(r);
      const { stock, ...p } = r.product;
      setForm(p);
      setBarcodeText(p.barcodes.join("\n"));
      setMinimum(stock?.minimumStock || p.minimumStock);
      setIdeal(stock?.idealStock || p.idealStock);
      beginOperation();
      if (scroll)
        setTimeout(
          () =>
            editor.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            }),
          0,
        );
    } catch (e) {
      setDetail(null);
      setForm(null);
      fail(e);
    } finally {
      setSaving(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const r = await inventoryRequest<{ id: string }>(
        "products/save",
        {
          ...form,
          barcodes: barcodeText
            .split(/[\n,;]+/)
            .map((v) => v.trim())
            .filter(Boolean),
        },
        session.csrf,
      );
      await load();
      await select(r.id, false);
      setMessage("Produto salvo com sucesso.");
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }
  async function movement(e: FormEvent, reversalOf?: string) {
    e.preventDefault();
    if (!form?.id || !data?.unitId || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await inventoryRequest(
        "movements",
        {
          unitId: data.unitId,
          productId: form.id,
          kind: reversalOf ? "reverse" : kind,
          quantity: normalized(quantity),
          packaged,
          cost: normalized(cost),
          reason,
          reversalOf,
          requestKey: key,
        },
        session.csrf,
      );
      await load();
      await select(form.id, false);
      setTab("stock");
      setMessage("Movimento confirmado. Saldo e histórico atualizados.");
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }
  async function limits(e: FormEvent) {
    e.preventDefault();
    if (!form?.id || !data?.unitId || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await inventoryRequest(
        "settings",
        {
          unitId: data.unitId,
          productId: form.id,
          minimumStock: normalized(minimum),
          idealStock: normalized(ideal),
        },
        session.csrf,
      );
      await load();
      await select(form.id, false);
      setTab("stock");
      setMessage("Limites desta unidade atualizados.");
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }
  const field = (
    label: string,
    name: keyof ProductInput,
    options: {
      required?: boolean;
      max?: number;
      decimal?: boolean;
      immutable?: boolean;
    } = {},
  ) => (
    <label>
      {label}
      <input
        name={name}
        value={String(form?.[name] ?? "")}
        required={options.required}
        maxLength={options.max || 100}
        inputMode={options.decimal ? "decimal" : undefined}
        disabled={
          saving ||
          !data?.canManageProducts ||
          !!(options.immutable && form?.id)
        }
        onChange={(e) =>
          setForm((p) =>
            p
              ? {
                  ...p,
                  [name]: options.decimal
                    ? normalized(e.target.value)
                    : e.target.value,
                }
              : p,
          )
        }
      />
    </label>
  );
  if (!permission)
    return (
      <section className="panel inv-denied">
        <ShieldCheck size={36} />
        <h2>Consulta de produtos não autorizada</h2>
        <p>Solicite ao administrador um perfil com acesso ao catálogo.</p>
      </section>
    );
  const stock = detail?.product.stock;
  const average = Number(stock?.averageCost || 0),
    price = Number(form?.salePrice || 0),
    margin = price > 0 ? ((price - average) / price) * 100 : null;
  const suggested =
    average > 0 && form && Number(form.desiredMargin) < 100
      ? Math.ceil((average / (1 - Number(form.desiredMargin) / 100)) * 100) /
        100
      : null;
  return (
    <div className="inventory-module" aria-busy={loading || saving}>
      <section
        className="inv-metrics"
        aria-label="Indicadores de produtos e estoque"
      >
        {[
          {
            label: "Total de produtos",
            value: data ? qty(data.summary.products) : "—",
            icon: Package,
          },
          {
            label: "Valor do estoque",
            value: data?.unitId ? money(data.summary.value) : "—",
            icon: Boxes,
          },
          {
            label: "Estoque baixo",
            value: data?.unitId ? qty(data.summary.low) + " itens" : "—",
            icon: TriangleAlert,
          },
          {
            label: "Produtos esgotados",
            value: data?.unitId ? qty(data.summary.empty) + " itens" : "—",
            icon: ArrowDownToLine,
          },
        ].map(({ label, value, icon: Icon }) => (
          <article key={label}>
            <Icon size={30} />
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </article>
        ))}
      </section>
      <div className="inv-context">
        <span>
          <Boxes size={17} />
          {data?.unitId
            ? unit?.name || "Unidade selecionada"
            : "Catálogo central da rede"}
        </span>
        <p>
          {data?.unitId
            ? "Saldos e limites exclusivos desta unidade."
            : "Selecione uma unidade no topo para consultar saldos e movimentar estoque."}
        </p>
      </div>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="inv-success" role="status">
          {message}
        </p>
      )}
      <div className="inv-layout">
        <section
          className="panel inv-catalog"
          aria-label="Catálogo de produtos"
        >
          <div className="inv-section-title">
            <h2>
              <Package size={22} /> Produtos e estoque
            </h2>
            <button
              className="icon-button"
              aria-label="Atualizar produtos"
              onClick={() => {
                setDetail(null);
                setForm(null);
                void load();
              }}
              disabled={loading || saving}
            >
              <RefreshCw size={18} />
            </button>
          </div>
          <form
            className="inv-filters"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              setFilter({ query, status, page: 0 });
            }}
          >
            <label className="inv-search">
              <span className="sr-only">Buscar produtos</span>
              <Search size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={100}
                placeholder="Nome, código ou código de barras…"
              />
            </label>
            <label>
              <span className="sr-only">Situação dos produtos</span>
              <select
                aria-label="Situação dos produtos"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="active">Ativos</option>
                <option value="all">Todos</option>
                <option value="inactive">Inativos</option>
                {data?.unitId && <option value="low">Estoque baixo</option>}
              </select>
            </label>
            <button className="button secondary" disabled={loading || saving}>
              Buscar
            </button>
          </form>
          <div className="inv-tools">
            <button
              className="button primary"
              disabled={!data?.canManageProducts || saving}
              onClick={() => {
                setDetail(null);
                setForm({ ...empty });
                setBarcodeText("");
                setTab("data");
                setError("");
                setMessage("");
                setTimeout(
                  () =>
                    editor.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    }),
                  0,
                );
              }}
            >
              <Plus size={18} />
              Novo produto
            </button>
            <span>{data?.total ?? 0} produto(s) encontrado(s)</span>
          </div>
          {loading && !data ? (
            <p className="inv-empty" role="status">
              Carregando produtos…
            </p>
          ) : data?.items.length ? (
            <div className="inv-table-wrap">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Cód.</th>
                    <th>Produto</th>
                    <th>Custo médio</th>
                    <th>Preço</th>
                    <th>Disponível</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr
                      key={p.id}
                      className={form?.id === p.id ? "selected" : ""}
                    >
                      <td>{p.code}</td>
                      <td>
                        <button
                          disabled={saving}
                          onClick={() => {
                            setTab("data");
                            void select(p.id);
                          }}
                        >
                          <span className="inv-product-icon">
                            <Package size={21} />
                          </span>
                          <span>
                            <strong>{p.name}</strong>
                            <small>
                              {p.category || "Sem categoria"} · {p.baseUnit}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>{p.stock ? money(p.stock.averageCost) : "—"}</td>
                      <td>{money(p.salePrice)}</td>
                      <td>{p.stock ? qty(p.stock.available) : "—"}</td>
                      <td>
                        <span
                          className={
                            "inv-badge " +
                            (!p.active
                              ? "inactive"
                              : p.stock &&
                                  Number(p.stock.available) <=
                                    Number(p.stock.minimumStock)
                                ? "low"
                                : "normal")
                          }
                        >
                          {!p.active
                            ? "Inativo"
                            : p.stock && Number(p.stock.available) === 0
                              ? "Esgotado"
                              : p.stock &&
                                  Number(p.stock.available) <=
                                    Number(p.stock.minimumStock)
                                ? "Estoque baixo"
                                : "Ativo"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="inv-empty">
              <Package size={40} />
              <h3>
                {filter.query
                  ? "Nenhum produto encontrado"
                  : "Seu catálogo começa aqui"}
              </h3>
              <p>
                {filter.query
                  ? "Revise a busca e os filtros."
                  : "Cadastre o primeiro produto para organizar mercadorias, preços e estoque."}
              </p>
            </div>
          )}
          <div className="inv-pagination">
            <span>
              Página {page + 1} de{" "}
              {Math.max(1, Math.ceil((data?.total || 0) / 20))}
            </span>
            <button
              className="icon-button"
              aria-label="Página anterior de produtos"
              disabled={page === 0 || loading}
              onClick={() => {
                setPage(page - 1);
                setFilter({ ...filter, page: page - 1 });
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Próxima página de produtos"
              disabled={(page + 1) * 20 >= (data?.total || 0) || loading}
              onClick={() => {
                setPage(page + 1);
                setFilter({ ...filter, page: page + 1 });
              }}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="inv-info">
            <ShieldCheck size={19} />
            <p>
              Movimentos preservam data, responsável e custo utilizado.
              Alterações ficam no{" "}
              <Link href="/auditoria">histórico de auditoria</Link>.
            </p>
          </div>
        </section>
        <aside
          className="panel inv-editor"
          ref={editor}
          aria-label="Cadastro e detalhes do produto"
        >
          <div className="inv-editor-title">
            <Package size={23} />
            <h2>{form?.id ? "Editar produto" : "Cadastro de produto"}</h2>
            {form && (
              <button
                className="icon-button"
                aria-label="Fechar produto"
                onClick={() => {
                  setForm(null);
                  setDetail(null);
                }}
              >
                <X size={18} />
              </button>
            )}
          </div>
          {!form ? (
            <div className="inv-empty">
              <Package size={52} />
              <h3>Todos os detalhes, em um lugar</h3>
              <p>Selecione um produto da lista ou comece um novo cadastro.</p>
            </div>
          ) : (
            <>
              <div
                className="inv-tabs"
                role="group"
                aria-label="Seções do produto"
              >
                <button
                  className={tab === "data" ? "active" : ""}
                  onClick={() => setTab("data")}
                >
                  <Package size={16} />
                  Dados
                </button>
                <button
                  className={tab === "stock" ? "active" : ""}
                  disabled={!form.id}
                  onClick={() => setTab("stock")}
                >
                  <Boxes size={16} />
                  Estoque
                </button>
                <button
                  className={tab === "history" ? "active" : ""}
                  disabled={!form.id}
                  onClick={() => setTab("history")}
                >
                  <History size={16} />
                  Histórico
                </button>
              </div>
              {tab === "data" && (
                <form onSubmit={save} className="inv-product-form">
                  <div className="inv-product-banner">
                    <span>
                      <Package size={44} />
                    </span>
                    <div>
                      <strong>{form.name || "Novo produto"}</strong>
                      <small>
                        {form.code || "Defina um código interno"} ·{" "}
                        {form.baseUnit}
                      </small>
                    </div>
                  </div>
                  <div className="inv-fields">
                    {field("Código interno *", "code", {
                      required: true,
                      max: 32,
                      immutable: true,
                    })}
                    {field("Nome do produto *", "name", {
                      required: true,
                      max: 160,
                    })}
                    {field("Categoria", "category", { max: 80 })}
                    {field("Marca", "brand", { max: 80 })}
                    <label>
                      Unidade-base *
                      <select
                        aria-label="Unidade-base"
                        value={form.baseUnit}
                        disabled={
                          saving || !data?.canManageProducts || !!form.id
                        }
                        onChange={(e) =>
                          setForm({
                            ...form,
                            baseUnit: e.target
                              .value as ProductInput["baseUnit"],
                          })
                        }
                      >
                        {BASE_UNITS.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </label>
                    {field("Embalagem de entrada", "packageName", { max: 40 })}
                    {field("Unidades por embalagem *", "packageFactor", {
                      required: true,
                      decimal: true,
                    })}
                    {field("Preço de venda (R$) *", "salePrice", {
                      required: true,
                      decimal: true,
                    })}
                    {field("Margem desejada (%)", "desiredMargin", {
                      required: true,
                      decimal: true,
                    })}
                    {field("Margem mínima (%)", "minimumMargin", {
                      required: true,
                      decimal: true,
                    })}
                    {field("Estoque mínimo padrão", "minimumStock", {
                      required: true,
                      decimal: true,
                    })}
                    {field("Estoque ideal padrão", "idealStock", {
                      required: true,
                      decimal: true,
                    })}
                  </div>
                  <label>
                    <span>
                      <Barcode size={15} /> Códigos de barras GTIN/EAN
                    </span>
                    <textarea
                      aria-label="Códigos de barras GTIN/EAN"
                      value={barcodeText}
                      placeholder="Um código por linha; opcional"
                      rows={2}
                      disabled={saving || !data?.canManageProducts}
                      onChange={(e) => setBarcodeText(e.target.value)}
                    />
                  </label>
                  <label>
                    Descrição
                    <textarea
                      value={form.description}
                      maxLength={2000}
                      rows={2}
                      disabled={saving || !data?.canManageProducts}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                    />
                  </label>
                  <label className="inv-checkbox">
                    <input
                      type="checkbox"
                      checked={form.active}
                      disabled={saving || !data?.canManageProducts}
                      onChange={(e) =>
                        setForm({ ...form, active: e.target.checked })
                      }
                    />
                    Produto ativo
                  </label>
                  {stock && (
                    <div className="inv-margin">
                      <TrendingUp size={18} />
                      <div>
                        <strong>Custo médio: {money(average)}</strong>
                        <span>
                          Margem sobre a receita:{" "}
                          {margin === null ? "—" : qty(margin) + "%"}
                          {margin !== null &&
                          margin < Number(form.minimumMargin)
                            ? " · Abaixo da margem mínima"
                            : ""}
                        </span>
                        <span>
                          Preço sugerido pela margem desejada:{" "}
                          {suggested === null ? "—" : money(suggested)}
                        </span>
                        <small>
                          Confira e salve o preço para aprovar a alteração.
                        </small>
                      </div>
                    </div>
                  )}
                  <button
                    className="button primary inv-save"
                    disabled={saving || !data?.canManageProducts}
                  >
                    <Save size={18} />
                    {saving ? "Salvando…" : "Salvar produto"}
                  </button>
                </form>
              )}
              {tab === "stock" && (
                <div className="inv-stock-content">
                  {stock ? (
                    <>
                      <div className="inv-balances">
                        {[
                          ["Físico", stock.physical],
                          ["Reservado", stock.reserved],
                          ["Disponível", stock.available],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <span>{label}</span>
                            <strong>
                              {qty(value || 0)} <small>{form.baseUnit}</small>
                            </strong>
                          </div>
                        ))}
                      </div>
                      <p className="inv-stock-value">
                        Valor em custo: <strong>{money(stock.value)}</strong> ·
                        Custo médio: <strong>{money(stock.averageCost)}</strong>
                      </p>
                      {Number(stock.available) <=
                        Number(stock.minimumStock) && (
                        <p className="inv-low">
                          <TriangleAlert size={18} />
                          {Number(stock.available) === 0
                            ? "Produto esgotado"
                            : "Estoque atingiu o mínimo"}{" "}
                          · Mínimo: {qty(stock.minimumStock)}
                        </p>
                      )}
                      <form onSubmit={movement} className="inv-move-form">
                        <h3>
                          <ArrowLeftRight size={18} />
                          Registrar movimento
                        </h3>
                        <div className="inv-fields">
                          <label>
                            Tipo de movimento
                            <select
                              aria-label="Tipo de movimento"
                              value={kind}
                              disabled={
                                !data?.canManageStock || saving || !form.active
                              }
                              onChange={(e) => {
                                setKind(e.target.value as MovementKind);
                                setKey(crypto.randomUUID());
                              }}
                            >
                              {Object.entries(MOVEMENT_KINDS)
                                .filter(([k]) => k !== "reverse")
                                .map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label>
                            Quantidade
                            <input
                              value={quantity}
                              inputMode="decimal"
                              required
                              disabled={
                                !data?.canManageStock || saving || !form.active
                              }
                              onChange={(e) => {
                                setQuantity(e.target.value);
                                setKey(crypto.randomUUID());
                              }}
                            />
                          </label>
                          {kind === "entry" && (
                            <label>
                              Custo por{" "}
                              {packaged ? "embalagem" : "unidade-base"} (R$)
                              <input
                                value={cost}
                                inputMode="decimal"
                                required
                                disabled={
                                  !data?.canManageStock ||
                                  saving ||
                                  !form.active
                                }
                                onChange={(e) => {
                                  setCost(e.target.value);
                                  setKey(crypto.randomUUID());
                                }}
                              />
                            </label>
                          )}
                        </div>
                        <label className="inv-checkbox">
                          <input
                            type="checkbox"
                            checked={packaged}
                            disabled={
                              !data?.canManageStock || saving || !form.active
                            }
                            onChange={(e) => {
                              setPackaged(e.target.checked);
                              setKey(crypto.randomUUID());
                            }}
                          />
                          Quantidade em embalagem (
                          {form.packageName || "embalagem"} ×{" "}
                          {qty(form.packageFactor)})
                        </label>
                        <label>
                          Motivo do movimento
                          <textarea
                            value={reason}
                            minLength={3}
                            maxLength={300}
                            required
                            rows={2}
                            disabled={
                              !data?.canManageStock || saving || !form.active
                            }
                            onChange={(e) => {
                              setReason(e.target.value);
                              setKey(crypto.randomUUID());
                            }}
                          />
                        </label>
                        <p className="inv-hint">
                          A entrada atualiza o custo médio. Saídas usam o custo
                          médio vigente; o preço de venda depende de aprovação
                          no cadastro.
                        </p>
                        <button
                          className="button primary"
                          disabled={
                            !data?.canManageStock || saving || !form.active
                          }
                        >
                          <Save size={17} />
                          Confirmar movimento
                        </button>
                      </form>
                      <form onSubmit={limits} className="inv-limits">
                        <h3>Limites desta unidade</h3>
                        <div className="inv-fields">
                          <label>
                            Estoque mínimo da unidade
                            <input
                              value={minimum}
                              inputMode="decimal"
                              required
                              disabled={!data?.canManageStock || saving}
                              onChange={(e) => setMinimum(e.target.value)}
                            />
                          </label>
                          <label>
                            Estoque ideal da unidade
                            <input
                              value={ideal}
                              inputMode="decimal"
                              required
                              disabled={!data?.canManageStock || saving}
                              onChange={(e) => setIdeal(e.target.value)}
                            />
                          </label>
                        </div>
                        <button
                          className="button secondary"
                          disabled={
                            !data?.canManageStock || saving || !form.active
                          }
                        >
                          Salvar limites da unidade
                        </button>
                      </form>
                    </>
                  ) : (
                    <p className="inv-empty">
                      Selecione uma unidade autorizada no topo para consultar os
                      saldos.
                    </p>
                  )}
                </div>
              )}
              {tab === "history" && (
                <div className="inv-history">
                  {detail?.movements.length ? (
                    detail.movements.map((m, index) => (
                      <article key={m.id}>
                        <div>
                          <strong>{MOVEMENT_KINDS[m.kind]}</strong>
                          <time>
                            {new Date(m.createdAt).toLocaleString("pt-BR", {
                              timeZone: "America/Fortaleza",
                            })}
                          </time>
                        </div>
                        <p>
                          {qty(m.baseQuantity)} {form.baseUnit} · Fator{" "}
                          {qty(m.factor)} · Variação em custo{" "}
                          {money(m.valueDelta)}
                        </p>
                        <p>
                          Físico após: {qty(m.physicalAfter)} · Reservado:{" "}
                          {qty(m.reservedAfter)}
                        </p>
                        <p>{m.reason}</p>
                        {m.purchaseReceiptId && (
                          <p>
                            <Link href="/compras">
                              Origem: recebimento de compra. Consulte ou estorne
                              pelo pedido.
                            </Link>
                          </p>
                        )}
                        <small>
                          Responsável: {m.actorName} · Horário de Fortaleza
                        </small>
                        {index === 0 &&
                          detail.movementPage === 0 &&
                          m.kind !== "reverse" &&
                          !m.purchaseReceiptId &&
                          data?.canManageStock &&
                          form.active && (
                            <form onSubmit={(e) => void movement(e, m.id)}>
                              <label>
                                Motivo do estorno
                                <input
                                  required
                                  minLength={3}
                                  maxLength={300}
                                  value={reason}
                                  onChange={(e) => {
                                    setReason(e.target.value);
                                    setKey(crypto.randomUUID());
                                  }}
                                />
                              </label>
                              <button
                                className="button secondary"
                                disabled={saving}
                              >
                                Estornar último movimento
                              </button>
                            </form>
                          )}
                      </article>
                    ))
                  ) : (
                    <p className="inv-empty">
                      {stock
                        ? "Nenhum movimento registrado nesta unidade."
                        : "Selecione uma unidade autorizada para consultar o histórico."}
                    </p>
                  )}
                  {detail && detail.movementTotal > 20 && (
                    <div className="inv-pagination">
                      <button
                        className="button secondary"
                        disabled={detail.movementPage === 0 || saving}
                        onClick={() =>
                          void select(form.id!, false, detail.movementPage - 1)
                        }
                      >
                        Anteriores
                      </button>
                      <span>
                        {detail.movementPage + 1} /{" "}
                        {Math.ceil(detail.movementTotal / 20)}
                      </span>
                      <button
                        className="button secondary"
                        disabled={
                          (detail.movementPage + 1) * 20 >=
                            detail.movementTotal || saving
                        }
                        onClick={() =>
                          void select(form.id!, false, detail.movementPage + 1)
                        }
                      >
                        Próximos
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
