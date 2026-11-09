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
  Truck,
  ShoppingBag,
  Package,
  Plus,
  Save,
  Search,
  RefreshCw,
  X,
  Check,
  ClipboardCheck,
  ArrowDownToLine,
  History,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Clock,
  Wallet,
} from "lucide-react";
import {
  PURCHASE_STATUSES,
  type AuthSession,
  type SupplierInput,
  type Supplier,
  type SupplierPage,
  type Purchase,
  type PurchaseInput,
  type PurchaseOptions,
  type PurchaseDetail,
  type PurchasePage,
  type PurchasePriceWarning,
} from "@invictus/contracts";
import { purchasingRequest as request } from "../lib/purchasing-client";
import { AuthClientError } from "../lib/auth-client";
import "../app/inventory.css";
import "../app/purchasing.css";
const money = (v: string | number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qty = (v: string | number) =>
  Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const decimal = (v: string) => v.trim().replace(",", ".");
const emptySupplier: SupplierInput = {
  legalName: "",
  name: "",
  cnpj: "",
  stateRegistration: "",
  contactName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
  deliveryDays: 0,
  paymentTerms: "",
  notes: "",
  active: true,
};
function useFailure() {
  const router = useRouter();
  const [error, setError] = useState("");
  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof AuthClientError && e.status === 401) {
        router.replace("/login");
        router.refresh();
      }
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível concluir esta operação.",
      );
    },
    [router],
  );
  return { error, setError, fail };
}
function Pagination({
  page,
  total,
  busy,
  onChange,
}: {
  page: number;
  total: number;
  busy: boolean;
  onChange: (p: number) => void;
}) {
  return (
    <div className="inv-pagination">
      <span>
        Página {page + 1} de {Math.max(1, Math.ceil(total / 20))} · {total}{" "}
        registro(s)
      </span>
      <button
        className="icon-button"
        aria-label="Página anterior"
        disabled={!page || busy}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={18} />
      </button>
      <button
        className="icon-button"
        aria-label="Próxima página"
        disabled={(page + 1) * 20 >= total || busy}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
function Denied({ label }: { label: string }) {
  return (
    <section className="panel inv-denied">
      <ShieldCheck size={36} />
      <h2>{label}</h2>
      <p>Solicite ao administrador um perfil com as permissões necessárias.</p>
    </section>
  );
}
export function SupplierPanel({ session }: { session: AuthSession }) {
  const [data, setData] = useState<SupplierPage | null>(null),
    [form, setForm] = useState<SupplierInput | null>(null),
    [history, setHistory] = useState<Purchase[]>([]),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("active"),
    [filter, setFilter] = useState({ query: "", status: "active", page: 0 }),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const { error, setError, fail } = useFailure();
  const editor = useRef<HTMLElement>(null),
    generation = useRef(0);
  const allowed = session.permissions.includes("suppliers.read");
  const load = useCallback(async () => {
    const n = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const r = await request<SupplierPage>(
        "suppliers?" +
          new URLSearchParams({
            query: filter.query,
            status: filter.status,
            page: String(filter.page),
          }),
      );
      if (n === generation.current) setData(r);
    } catch (e) {
      if (n === generation.current) {
        setData(null);
        setForm(null);
        setHistory([]);
        fail(e);
      }
    } finally {
      if (n === generation.current) setBusy(false);
    }
  }, [filter, fail, setError]);
  useEffect(() => {
    if (allowed) void load();
    return () => {
      generation.current++;
    };
  }, [allowed, load]);
  useEffect(() => {
    const check = () => {
      setForm(null);
      setHistory([]);
      void load();
    };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [load]);
  async function select(id: string, scroll = true) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setForm(await request<Supplier>("suppliers/" + id));
      setHistory(
        session.permissions.includes("purchases.read")
          ? (await request<PurchasePage>("orders?supplierId=" + id)).items
          : [],
      );
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
      setForm(null);
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await request<{ id: string }>(
        "suppliers/save",
        form,
        session.csrf,
      );
      await load();
      await select(r.id, false);
      setMessage("Fornecedor salvo com sucesso.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const field = (
    label: string,
    key: keyof SupplierInput,
    required = false,
    max = 120,
  ) => (
    <label>
      {label}
      <input
        value={String(form?.[key] ?? "")}
        required={required}
        maxLength={max}
        disabled={!data?.canManage || busy || (key === "cnpj" && !!form?.id)}
        onChange={(e) =>
          setForm((p) =>
            p
              ? {
                  ...p,
                  [key]:
                    key === "deliveryDays"
                      ? Number(e.target.value)
                      : e.target.value,
                }
              : p,
          )
        }
        type={key === "deliveryDays" ? "number" : "text"}
        min={key === "deliveryDays" ? 0 : undefined}
        max={key === "deliveryDays" ? 365 : undefined}
      />
    </label>
  );
  if (!allowed)
    return <Denied label="Consulta de fornecedores não autorizada" />;
  return (
    <div className="inventory-module purchasing-module">
      <section className="inv-metrics" aria-label="Indicadores de fornecedores">
        {[
          {
            label: "Fornecedores ativos",
            value: data?.active ?? "—",
            icon: Truck,
          },
          {
            label: "Encontrados na consulta",
            value: data?.total ?? "—",
            icon: Search,
          },
          {
            label: "Cadastro central",
            value: "Rede de empresas",
            icon: ShieldCheck,
          },
          {
            label: "Histórico preservado",
            value: "Compras vinculadas",
            icon: History,
          },
        ].map(({ label, value, icon: Icon }) => (
          <article key={label}>
            <Icon size={28} />
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </article>
        ))}
      </section>
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
          aria-label="Lista de fornecedores"
        >
          <div className="inv-section-title">
            <h2>
              <Truck size={22} />
              Fornecedores
            </h2>
            <button
              className="icon-button"
              aria-label="Atualizar fornecedores"
              disabled={busy}
              onClick={() => void load()}
            >
              <RefreshCw size={18} />
            </button>
          </div>
          <form
            className="inv-filters"
            onSubmit={(e) => {
              e.preventDefault();
              setFilter({ query, status, page: 0 });
            }}
          >
            <label className="inv-search">
              <span className="sr-only">Buscar fornecedores</span>
              <Search size={18} />
              <input
                aria-label="Buscar fornecedores"
                value={query}
                maxLength={100}
                placeholder="Nome, CNPJ ou contato…"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Situação dos fornecedores"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="active">Ativos</option>
              <option value="all">Todos</option>
              <option value="inactive">Inativos</option>
            </select>
            <button className="button secondary" disabled={busy}>
              Buscar
            </button>
          </form>
          <div className="inv-tools">
            <button
              className="button primary"
              disabled={!data?.canManage || busy}
              onClick={() => {
                setForm({ ...emptySupplier });
                setHistory([]);
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
              <Plus size={17} />
              Novo fornecedor
            </button>
            <span>Dados compartilhados na rede</span>
          </div>
          {data?.items.length ? (
            <div className="inv-table-wrap">
              <table className="inv-table supplier-table">
                <thead>
                  <tr>
                    <th>CNPJ</th>
                    <th>Fornecedor</th>
                    <th>Contato</th>
                    <th>Prazo</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => (
                    <tr
                      key={s.id}
                      className={form?.id === s.id ? "selected" : ""}
                    >
                      <td>{s.cnpj}</td>
                      <td>
                        <button
                          disabled={busy}
                          onClick={() => void select(s.id)}
                        >
                          <span className="inv-product-icon">
                            <Truck size={21} />
                          </span>
                          <span>
                            <strong>{s.name}</strong>
                            <small>
                              {s.city || "Cidade não informada"}
                              {s.state ? " / " + s.state : ""}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>{s.contactName || s.email || "—"}</td>
                      <td>{s.deliveryDays} dias</td>
                      <td>
                        <span
                          className={
                            "inv-badge " + (s.active ? "normal" : "inactive")
                          }
                        >
                          {s.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="inv-empty">
              <Truck size={40} />
              <h3>
                {busy
                  ? "Carregando fornecedores…"
                  : "Nenhum fornecedor encontrado"}
              </h3>
              <p>
                Organize contatos, prazos e condições para suas próximas
                compras.
              </p>
            </div>
          )}
          <Pagination
            page={filter.page}
            total={data?.total || 0}
            busy={busy}
            onChange={(page) => setFilter({ ...filter, page })}
          />
          <div className="inv-info">
            <ShieldCheck size={18} />
            <p>
              Inativar um fornecedor preserva os pedidos anteriores.{" "}
              <Link href="/compras">Acessar compras e recebimentos</Link>.
            </p>
          </div>
        </section>
        <aside
          className="panel inv-editor"
          ref={editor}
          aria-label="Cadastro de fornecedor"
        >
          <div className="inv-editor-title">
            <Truck size={23} />
            <h2>{form?.id ? "Editar fornecedor" : "Cadastro de fornecedor"}</h2>
            {form && (
              <button
                className="icon-button"
                aria-label="Fechar fornecedor"
                onClick={() => setForm(null)}
              >
                <X size={18} />
              </button>
            )}
          </div>
          {form ? (
            <>
              <form onSubmit={save} className="inv-product-form">
                <div className="inv-product-banner">
                  <span>
                    <Truck size={42} />
                  </span>
                  <div>
                    <strong>{form.name || "Novo fornecedor"}</strong>
                    <small>Cadastro central · Invictus ERP Comercial</small>
                  </div>
                </div>
                <div className="inv-fields">
                  {field("Razão social *", "legalName", true, 160)}
                  {field("Nome fantasia *", "name", true)}
                  {field("CNPJ *", "cnpj", true, 24)}
                  {field("Inscrição estadual", "stateRegistration", false, 30)}
                  {field("Pessoa de contato", "contactName", false, 100)}
                  {field("E-mail", "email", false, 254)}
                  {field("Telefone", "phone", false, 30)}
                  {field("Cidade", "city", false, 100)}
                  {field("UF", "state", false, 2)}
                  {field("CEP", "postalCode", false, 9)}
                  {field("Prazo de entrega (dias)", "deliveryDays", true)}
                  {field("Condições de pagamento", "paymentTerms", false, 200)}
                </div>
                {field("Endereço", "address", false, 240)}
                <label>
                  Observações
                  <textarea
                    aria-label="Observações do fornecedor"
                    value={form.notes}
                    rows={3}
                    maxLength={1000}
                    disabled={!data?.canManage || busy}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                  />
                </label>
                <label className="inv-checkbox">
                  <input
                    type="checkbox"
                    checked={form.active}
                    disabled={!data?.canManage || busy}
                    onChange={(e) =>
                      setForm({ ...form, active: e.target.checked })
                    }
                  />
                  Fornecedor ativo
                </label>
                <button
                  className="button primary inv-save"
                  disabled={!data?.canManage || busy}
                >
                  <Save size={18} />
                  {busy ? "Salvando…" : "Salvar fornecedor"}
                </button>
              </form>
              {form.id && session.permissions.includes("purchases.read") && (
                <section className="supplier-purchases">
                  <h3>
                    <History size={17} />
                    Compras deste fornecedor
                  </h3>
                  <p>
                    Até 20 pedidos recentes, respeitando a unidade e as
                    permissões atuais.
                  </p>
                  {history.length ? (
                    history.map((o) => (
                      <div key={o.id}>
                        <strong>{o.number}</strong>
                        <span>
                          {PURCHASE_STATUSES[o.status]} · {money(o.total)}
                        </span>
                        <small>{o.unitName}</small>
                      </div>
                    ))
                  ) : (
                    <p>Nenhum pedido no acesso atual.</p>
                  )}
                </section>
              )}
            </>
          ) : (
            <div className="inv-empty">
              <Truck size={50} />
              <h3>Seus parceiros de abastecimento</h3>
              <p>Selecione um fornecedor ou inicie um novo cadastro.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
export function PurchasesPanel({ session }: { session: AuthSession }) {
  const [pricing, setPricing] = useState<PurchasePriceWarning[]>([]);
  const productNames = useRef<
    Record<string, PurchaseOptions["products"][number]>
  >({});
  const supplierNames = useRef<Record<string, string>>({});
  function remember(o: PurchaseOptions) {
    for (const p of o.products) productNames.current[p.id] = p;
    for (const s of o.suppliers) supplierNames.current[s.id] = s.name;
    return o;
  }
  const [data, setData] = useState<PurchasePage | null>(null),
    [options, setOptions] = useState<PurchaseOptions | null>(null),
    [detail, setDetail] = useState<PurchaseDetail | null>(null),
    [form, setForm] = useState<PurchaseInput | null>(null),
    [dirty, setDirty] = useState(false),
    [tab, setTab] = useState<"order" | "receive" | "history">("order"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [filter, setFilter] = useState({ query: "", status: "all", page: 0 });
  const [supplierQuery, setSupplierQuery] = useState(""),
    [productQuery, setProductQuery] = useState(""),
    [productId, setProductId] = useState(""),
    [quantities, setQuantities] = useState<Record<string, string>>({}),
    [document, setDocument] = useState(""),
    [notes, setNotes] = useState(""),
    [reason, setReason] = useState(""),
    [receiptKey, setReceiptKey] = useState("");
  const { error, setError, fail } = useFailure();
  const editor = useRef<HTMLElement>(null),
    generation = useRef(0);
  const allowed = session.permissions.includes("purchases.read");
  const load = useCallback(async () => {
    const n = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const [r, o] = await Promise.all([
        request<PurchasePage>(
          "orders?" +
            new URLSearchParams({
              query: filter.query,
              status: filter.status,
              page: String(filter.page),
            }),
        ),
        request<PurchaseOptions>("options"),
      ]);
      if (n === generation.current) {
        setData(r);
        setOptions(remember(o));
      }
    } catch (e) {
      if (n === generation.current) {
        setData(null);
        setForm(null);
        setDetail(null);
        setPricing([]);
        fail(e);
      }
    } finally {
      if (n === generation.current) setBusy(false);
    }
  }, [filter, fail, setError]);
  useEffect(() => {
    if (allowed) void load();
    return () => {
      generation.current++;
    };
  }, [allowed, load]);
  useEffect(() => {
    const check = () => {
      setDetail(null);
      setPricing([]);
      setForm(null);
      void load();
    };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [load]);
  function change(patch: Partial<PurchaseInput>) {
    if (form) {
      setForm({ ...form, ...patch, requestKey: crypto.randomUUID() });
      setDirty(true);
    }
  }
  async function select(id: string, scroll = true, receiptPage = 0) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const d = await request<PurchaseDetail>(
        "orders/" + id + "?page=" + receiptPage,
      );
      setDetail(d);
      setPricing([]);
      const o = d.order;
      setForm({
        id: o.id,
        version: o.version,
        unitId: o.unitId,
        supplierId: o.supplierId,
        items: o.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitCost: i.unitCost,
          packaged: i.packaged,
        })),
        freight: o.freight,
        extraCost: o.extraCost,
        discount: o.discount,
        expectedDate: o.expectedDate,
        notes: o.notes,
        requestKey: crypto.randomUUID(),
      });
      setDirty(false);
      setQuantities({});
      setDocument("");
      setNotes("");
      setReason("");
      setReceiptKey(crypto.randomUUID());
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
      setForm(null);
      setDetail(null);
      setPricing([]);
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await request<{ id: string }>(
        "orders/save",
        form,
        session.csrf,
      );
      await load();
      await select(r.id, false);
      setMessage(
        "Rascunho salvo. O estoque será atualizado somente no recebimento.",
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function transition(action: "approve" | "cancel") {
    if (!detail || busy) return;
    if (action === "cancel" && reason.trim().length < 3) {
      setError(
        "Informe o motivo do cancelamento com pelo menos três caracteres.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request(
        "orders/transition",
        {
          id: detail.order.id,
          version: detail.order.version,
          action,
          reason: action === "cancel" ? reason : "",
        },
        session.csrf,
      );
      await load();
      await select(detail.order.id, false);
      setMessage(
        action === "approve"
          ? "Pedido aprovado. Confira as mercadorias antes de receber."
          : "Pedido cancelado. Histórico preservado.",
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function receive(e: FormEvent) {
    e.preventDefault();
    if (!detail || busy) return;
    if (
      Object.values(quantities).some(
        (v) => v.trim() !== "" && !/^\d+(?:[.,]\d{1,3})?$/.test(v.trim()),
      )
    ) {
      setError(
        "Confira as quantidades; use valores não negativos com até três casas decimais.",
      );
      return;
    }
    const items = detail.order.items
      .filter((i) => Number(decimal(quantities[i.id] || "0")) > 0)
      .map((i) => ({
        lineId: i.id,
        quantity: decimal(quantities[i.id] || ""),
      }));
    if (!items.length) {
      setError("Informe pelo menos uma quantidade conferida.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const received = await request<{ warnings: PurchasePriceWarning[] }>(
        "receipts",
        {
          orderId: detail.order.id,
          version: detail.order.version,
          items,
          document,
          notes,
          requestKey: receiptKey,
        },
        session.csrf,
      );
      await load();
      await select(detail.order.id, false);
      setTab("history");
      setPricing(Array.isArray(received.warnings) ? received.warnings : []);
      setMessage("Recebimento confirmado. Estoque e custo médio atualizados.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function reverse(id: string) {
    if (!detail || busy) return;
    if (reason.trim().length < 3) {
      setError("Informe o motivo do estorno com pelo menos três caracteres.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request(
        "receipts/reverse",
        { id, version: detail.order.version, reason, requestKey: receiptKey },
        session.csrf,
      );
      await load();
      await select(detail.order.id, false);
      setTab("history");
      setMessage("Recebimento estornado. Saldo e pedido atualizados.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function searchOptions() {
    setBusy(true);
    setError("");
    try {
      setOptions(
        remember(
          await request<PurchaseOptions>(
            "options?" + new URLSearchParams({ supplierQuery, productQuery }),
          ),
        ),
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const editable =
    !!form &&
    data?.capabilities.manage &&
    (!detail || detail.order.status === "draft");
  const order = detail?.order;
  const preview = form
    ? form.items.reduce(
        (s, i) => s + Number(i.quantity) * Number(i.unitCost),
        0,
      ) +
      Number(form.freight) +
      Number(form.extraCost) -
      Number(form.discount)
    : 0;
  const itemName = (id: string) =>
    detail?.order.items.find((i) => i.productId === id)?.name ||
    productNames.current[id]?.name ||
    options?.products.find((i) => i.id === id)?.name ||
    id;
  const field = (label: string, name: "freight" | "extraCost" | "discount") => (
    <label>
      {label}
      <input
        inputMode="decimal"
        required
        value={form?.[name] || "0"}
        disabled={!editable || busy}
        onChange={(e) => change({ [name]: decimal(e.target.value) })}
      />
    </label>
  );
  if (!allowed) return <Denied label="Consulta de compras não autorizada" />;
  return (
    <div className="inventory-module purchasing-module">
      <section className="inv-metrics" aria-label="Indicadores de compras">
        {[
          {
            label: "Rascunhos",
            value: data?.summary.draft ?? "—",
            icon: ShoppingBag,
          },
          {
            label: "Aguardando recebimento",
            value: data ? data.summary.approved + data.summary.partial : "—",
            icon: Clock,
          },
          {
            label: "Valor pendente em custo",
            value: data ? money(data.summary.openValue) : "—",
            icon: Wallet,
          },
          {
            label: "Pedidos recebidos",
            value: data?.summary.received ?? "—",
            icon: ClipboardCheck,
          },
        ].map(({ label, value, icon: Icon }) => (
          <article key={label}>
            <Icon size={28} />
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </article>
        ))}
      </section>
      <div className="inv-context">
        <span>
          <ShoppingBag size={17} />
          Pedidos e conferência de mercadorias
        </span>
        <p>
          Compras e indicadores limitados à unidade selecionada ou às unidades
          autorizadas.
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
      {pricing.length > 0 && (
        <section
          className="purchase-pricing-warning"
          aria-label="Alertas de margem"
          role="note"
        >
          <h3>Confira os preços de venda</h3>
          <p>
            O custo médio atualizado ficou acima do objetivo de margem ou o
            preço ainda não foi definido. Nenhum preço foi alterado
            automaticamente.
          </p>
          {pricing.map((p) => (
            <div key={p.id}>
              <strong>{p.name}</strong>
              <span>
                Custo médio {money(p.averageCost)} · Preço atual{" "}
                {money(p.salePrice)} · Margem{" "}
                {p.margin === null ? "—" : qty(p.margin) + "%"} · Objetivo{" "}
                {qty(p.targetMargin)}%
              </span>
              <span>
                Preço sugerido: {money(p.suggestedPrice)}. Revise e aprove no{" "}
                <Link href="/produtos">cadastro de produtos</Link>.
              </span>
            </div>
          ))}
        </section>
      )}
      <div className="inv-layout">
        <section className="panel inv-catalog" aria-label="Pedidos de compra">
          <div className="inv-section-title">
            <h2>
              <ShoppingBag size={22} />
              Compras
            </h2>
            <button
              className="icon-button"
              aria-label="Atualizar compras"
              disabled={busy}
              onClick={() => void load()}
            >
              <RefreshCw size={18} />
            </button>
          </div>
          <form
            className="inv-filters"
            onSubmit={(e) => {
              e.preventDefault();
              setFilter({ query, status, page: 0 });
            }}
          >
            <label className="inv-search">
              <span className="sr-only">Buscar compras</span>
              <Search size={18} />
              <input
                aria-label="Buscar compras"
                value={query}
                maxLength={100}
                placeholder="Pedido ou fornecedor…"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Situação das compras"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">Todas</option>
              {Object.entries(PURCHASE_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button className="button secondary" disabled={busy}>
              Buscar
            </button>
          </form>
          <div className="inv-tools">
            <button
              className="button primary"
              disabled={!data?.capabilities.manage || busy}
              onClick={() => {
                setDetail(null);
                setPricing([]);
                setForm({
                  unitId: session.activeUnitId || "",
                  supplierId: "",
                  items: [],
                  freight: "0",
                  extraCost: "0",
                  discount: "0",
                  expectedDate: "",
                  notes: "",
                  requestKey: crypto.randomUUID(),
                });
                setDirty(true);
                setTab("order");
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
              <Plus size={17} />
              Novo pedido
            </button>
            <Link className="purchase-link" href="/fornecedores">
              Fornecedores
              <Truck size={14} />
            </Link>
          </div>
          {data?.items.length ? (
            <div className="inv-table-wrap">
              <table className="inv-table purchase-table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Fornecedor / unidade</th>
                    <th>Total</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((o) => (
                    <tr
                      key={o.id}
                      className={order?.id === o.id ? "selected" : ""}
                    >
                      <td>
                        <small>{o.number}</small>
                      </td>
                      <td>
                        <button
                          disabled={busy}
                          onClick={() => {
                            setTab("order");
                            void select(o.id);
                          }}
                        >
                          <span className="inv-product-icon">
                            <ShoppingBag size={20} />
                          </span>
                          <span>
                            <strong>{o.supplier.name}</strong>
                            <small>
                              {o.number} · {o.unitName}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>{money(o.total)}</td>
                      <td>
                        <span
                          className={
                            "inv-badge " +
                            (o.status === "received"
                              ? "normal"
                              : o.status === "cancelled"
                                ? "inactive"
                                : "low")
                          }
                        >
                          {PURCHASE_STATUSES[o.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="inv-empty">
              <ShoppingBag size={40} />
              <h3>
                {busy ? "Carregando compras…" : "Nenhum pedido encontrado"}
              </h3>
              <p>
                Planeje a compra, aprove os valores e confira o recebimento.
              </p>
            </div>
          )}
          <Pagination
            page={filter.page}
            total={data?.total || 0}
            busy={busy}
            onChange={(page) => setFilter({ ...filter, page })}
          />
          <div className="purchase-flow">
            <span>
              <ShoppingBag size={18} />
              Rascunho
            </span>
            <b>→</b>
            <span>
              <Check size={18} />
              Aprovação
            </span>
            <b>→</b>
            <span>
              <ClipboardCheck size={18} />
              Conferência
            </span>
            <b>→</b>
            <span>
              <Package size={18} />
              Estoque
            </span>
          </div>
          <div className="inv-info">
            <ShieldCheck size={18} />
            <p>
              Aprovar não movimenta estoque. O recebimento registra quantidade,
              referência e responsável.{" "}
              <Link href="/auditoria">Consultar auditoria</Link>.
            </p>
          </div>
        </section>
        <aside
          className="panel inv-editor"
          ref={editor}
          aria-label="Detalhes da compra"
        >
          <div className="inv-editor-title">
            <ShoppingBag size={23} />
            <h2>{order?.number || "Novo pedido de compra"}</h2>
            {form && (
              <button
                className="icon-button"
                aria-label="Fechar pedido"
                onClick={() => {
                  setForm(null);
                  setDetail(null);
                  setPricing([]);
                }}
              >
                <X size={18} />
              </button>
            )}
          </div>
          {!form ? (
            <div className="inv-empty">
              <ShoppingBag size={50} />
              <h3>Abastecimento sob controle</h3>
              <p>
                Selecione um pedido ou crie uma compra para a unidade
                autorizada.
              </p>
            </div>
          ) : (
            <>
              <div
                className="inv-tabs"
                role="group"
                aria-label="Seções da compra"
              >
                <button
                  className={tab === "order" ? "active" : ""}
                  onClick={() => setTab("order")}
                >
                  <ShoppingBag size={16} />
                  Pedido
                </button>
                <button
                  className={tab === "receive" ? "active" : ""}
                  disabled={!order}
                  onClick={() => setTab("receive")}
                >
                  <ClipboardCheck size={16} />
                  Receber
                </button>
                <button
                  className={tab === "history" ? "active" : ""}
                  disabled={!order}
                  onClick={() => setTab("history")}
                >
                  <History size={16} />
                  Histórico
                </button>
              </div>
              {order && (
                <div className="purchase-status">
                  <span
                    className={
                      "inv-badge " +
                      (order.status === "received" ? "normal" : "low")
                    }
                  >
                    {PURCHASE_STATUSES[order.status]}
                  </span>
                  <strong>{money(order.total)}</strong>
                  <small>
                    {order.unitName}
                    {order.approvedBy
                      ? " · Aprovado por " + order.approvedBy
                      : ""}
                  </small>
                </div>
              )}
              {tab === "order" && (
                <>
                  <form className="inv-product-form" onSubmit={save}>
                    <div className="inv-fields">
                      <label>
                        Unidade da compra *
                        <select
                          aria-label="Unidade da compra"
                          required
                          value={form.unitId}
                          disabled={!editable || busy || !!form.id}
                          onChange={(e) => change({ unitId: e.target.value })}
                        >
                          <option value="">Selecione a unidade</option>
                          {options?.units.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Fornecedor *
                        <select
                          aria-label="Fornecedor da compra"
                          required
                          value={form.supplierId}
                          disabled={!editable || busy || !!form.id}
                          onChange={(e) =>
                            change({ supplierId: e.target.value })
                          }
                        >
                          <option value="">Selecione o fornecedor</option>
                          {form.supplierId &&
                            !options?.suppliers.some(
                              (s) => s.id === form.supplierId,
                            ) && (
                              <option value={form.supplierId}>
                                {supplierNames.current[form.supplierId] ||
                                  order?.supplier.name ||
                                  "Fornecedor selecionado"}
                              </option>
                            )}
                          {options?.suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {editable && !form.id && (
                      <div className="purchase-option-search">
                        <label>
                          Buscar fornecedor para o pedido
                          <input
                            aria-label="Buscar fornecedor para o pedido"
                            value={supplierQuery}
                            maxLength={100}
                            onChange={(e) => setSupplierQuery(e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="button secondary"
                          disabled={busy}
                          onClick={() => void searchOptions()}
                        >
                          Localizar fornecedor
                        </button>
                      </div>
                    )}
                    <div className="purchase-items">
                      <h3>
                        <Package size={17} />
                        Produtos do pedido
                      </h3>
                      {form.items.map((item, index) => {
                        const original = order?.items.find(
                            (i) => i.productId === item.productId,
                          ),
                          p =
                            options?.products.find(
                              (p) => p.id === item.productId,
                            ) || productNames.current[item.productId];
                        return (
                          <article key={item.productId}>
                            <div>
                              <strong>{itemName(item.productId)}</strong>
                              {editable && (
                                <button
                                  type="button"
                                  className="icon-button"
                                  aria-label={
                                    "Remover " + itemName(item.productId)
                                  }
                                  onClick={() =>
                                    change({
                                      items: form.items.filter(
                                        (_, i) => i !== index,
                                      ),
                                    })
                                  }
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                            <div className="inv-fields">
                              <label>
                                Quantidade pedida
                                <input
                                  aria-label={
                                    "Quantidade pedida de " +
                                    itemName(item.productId)
                                  }
                                  inputMode="decimal"
                                  value={item.quantity}
                                  required
                                  disabled={!editable || busy}
                                  onChange={(e) =>
                                    change({
                                      items: form.items.map((v, i) =>
                                        i === index
                                          ? {
                                              ...v,
                                              quantity: decimal(e.target.value),
                                            }
                                          : v,
                                      ),
                                    })
                                  }
                                />
                              </label>
                              <label>
                                Custo por unidade informada (R$)
                                <input
                                  aria-label={
                                    "Custo de " + itemName(item.productId)
                                  }
                                  inputMode="decimal"
                                  value={item.unitCost}
                                  required
                                  disabled={!editable || busy}
                                  onChange={(e) =>
                                    change({
                                      items: form.items.map((v, i) =>
                                        i === index
                                          ? {
                                              ...v,
                                              unitCost: decimal(e.target.value),
                                            }
                                          : v,
                                      ),
                                    })
                                  }
                                />
                              </label>
                            </div>
                            <label className="inv-checkbox">
                              <input
                                type="checkbox"
                                checked={item.packaged}
                                disabled={!editable || busy}
                                onChange={(e) =>
                                  change({
                                    items: form.items.map((v, i) =>
                                      i === index
                                        ? { ...v, packaged: e.target.checked }
                                        : v,
                                    ),
                                  })
                                }
                              />
                              Em embalagem (
                              {original?.packageName ||
                                p?.packageName ||
                                "embalagem"}{" "}
                              ×{" "}
                              {qty(
                                (editable && dirty
                                  ? p?.packageFactor
                                  : original?.factor) ||
                                  p?.packageFactor ||
                                  "1",
                              )}
                              )
                            </label>
                            {original && (
                              <small>
                                Recebido: {qty(original.receivedQuantity)} de{" "}
                                {qty(original.quantity)} · Valor final com
                                rateio: {money(original.totalValue)}
                              </small>
                            )}
                          </article>
                        );
                      })}
                      {!form.items.length && (
                        <p>Adicione pelo menos um produto.</p>
                      )}
                    </div>
                    {editable && (
                      <div className="purchase-add-item">
                        <label>
                          Buscar produto para o pedido
                          <input
                            aria-label="Buscar produto para o pedido"
                            value={productQuery}
                            maxLength={100}
                            onChange={(e) => setProductQuery(e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="button secondary"
                          disabled={busy}
                          onClick={() => void searchOptions()}
                        >
                          Localizar produto
                        </button>
                        <select
                          aria-label="Produto para adicionar"
                          value={productId}
                          onChange={(e) => setProductId(e.target.value)}
                        >
                          <option value="">Selecione um produto</option>
                          {options?.products
                            .filter(
                              (p) =>
                                !form.items.some((i) => i.productId === p.id),
                            )
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.code} · {p.name}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          className="button secondary"
                          disabled={
                            !productId || busy || form.items.length >= 50
                          }
                          onClick={() => {
                            change({
                              items: [
                                ...form.items,
                                {
                                  productId,
                                  quantity: "1",
                                  unitCost: "0",
                                  packaged: false,
                                },
                              ],
                            });
                            setProductId("");
                          }}
                        >
                          <Plus size={16} />
                          Adicionar produto
                        </button>
                        <small>
                          Até 100 opções por busca. Refine o nome ou código para
                          localizar outros cadastros.
                        </small>
                      </div>
                    )}
                    <div className="inv-fields">
                      {field("Frete (R$)", "freight")}
                      {field("Despesas adicionais (R$)", "extraCost")}
                      {field("Desconto (R$)", "discount")}
                      <label>
                        Previsão de entrega
                        <input
                          aria-label="Previsão de entrega"
                          type="date"
                          value={form.expectedDate}
                          disabled={!editable || busy}
                          onChange={(e) =>
                            change({ expectedDate: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Observações do pedido
                      <textarea
                        aria-label="Observações do pedido"
                        rows={2}
                        maxLength={1000}
                        value={form.notes}
                        disabled={!editable || busy}
                        onChange={(e) => change({ notes: e.target.value })}
                      />
                    </label>
                    <div className="purchase-total">
                      <span>
                        {dirty ? "Prévia do pedido" : "Total do pedido"}
                      </span>
                      <strong>
                        {money(dirty ? preview : order?.total || preview)}
                      </strong>
                    </div>
                    <p className="inv-hint">
                      Frete, despesas e desconto são rateados no custo. Fatores
                      e valores do pedido ficam preservados; o preço de venda
                      não muda automaticamente.
                    </p>
                    {editable && (
                      <button
                        className="button primary inv-save"
                        disabled={busy || !form.items.length}
                      >
                        <Save size={18} />
                        {busy ? "Salvando…" : "Salvar rascunho"}
                      </button>
                    )}
                  </form>
                  {order &&
                    order.status !== "received" &&
                    order.status !== "partial" &&
                    order.status !== "cancelled" && (
                      <div className="purchase-actions">
                        {order.status === "draft" &&
                          data?.capabilities.approve && (
                            <>
                              <button
                                className="button primary"
                                disabled={busy || dirty}
                                onClick={() => void transition("approve")}
                              >
                                <Check size={18} />
                                Aprovar pedido
                              </button>
                              {dirty && (
                                <p className="inv-hint">
                                  Salve as alterações antes de aprovar.
                                </p>
                              )}
                            </>
                          )}
                        {data?.capabilities.manage && (
                          <>
                            <label>
                              Motivo do cancelamento
                              <input
                                aria-label="Motivo do cancelamento"
                                value={reason}
                                maxLength={300}
                                onChange={(e) => setReason(e.target.value)}
                              />
                            </label>
                            <button
                              className="button secondary"
                              disabled={busy || dirty}
                              onClick={() => void transition("cancel")}
                            >
                              Cancelar pedido
                            </button>
                          </>
                        )}
                      </div>
                    )}
                </>
              )}
              {tab === "receive" && order && (
                <form className="inv-product-form" onSubmit={receive}>
                  <h3 className="purchase-subtitle">
                    <ClipboardCheck size={19} />
                    Conferência do recebimento
                  </h3>
                  <p className="inv-hint">
                    Informe somente o que chegou. Quantidades usam a unidade de
                    compra do pedido; fator preservado em cada item.
                  </p>
                  {order.items.map((i) => (
                    <label key={i.id}>
                      {i.name}
                      <small>
                        Pedido: {qty(i.quantity)} · Recebido:{" "}
                        {qty(i.receivedQuantity)} · Fator: {qty(i.factor)}
                      </small>
                      <input
                        aria-label={"Quantidade conferida de " + i.name}
                        inputMode="decimal"
                        value={quantities[i.id] || ""}
                        placeholder="0"
                        disabled={
                          busy ||
                          !data?.capabilities.receive ||
                          !["approved", "partial"].includes(order.status) ||
                          Number(i.receivedQuantity) >= Number(i.quantity)
                        }
                        onChange={(e) => {
                          setQuantities({
                            ...quantities,
                            [i.id]: e.target.value,
                          });
                          setReceiptKey(crypto.randomUUID());
                        }}
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="button secondary"
                    disabled={
                      busy ||
                      !data?.capabilities.receive ||
                      !["approved", "partial"].includes(order.status)
                    }
                    onClick={() => {
                      setQuantities(
                        Object.fromEntries(
                          order.items.map((i) => [
                            i.id,
                            (
                              Number(i.quantity) - Number(i.receivedQuantity)
                            ).toFixed(3),
                          ]),
                        ),
                      );
                      setReceiptKey(crypto.randomUUID());
                    }}
                  >
                    Preencher quantidades pendentes
                  </button>
                  <label>
                    Referência do recebimento *
                    <input
                      aria-label="Referência do recebimento"
                      required
                      maxLength={120}
                      value={document}
                      disabled={busy || !data?.capabilities.receive}
                      onChange={(e) => {
                        setDocument(e.target.value);
                        setReceiptKey(crypto.randomUUID());
                      }}
                    />
                  </label>
                  <label>
                    Observações da conferência *
                    <textarea
                      aria-label="Observações da conferência"
                      required
                      minLength={3}
                      maxLength={300}
                      value={notes}
                      rows={3}
                      disabled={busy || !data?.capabilities.receive}
                      onChange={(e) => {
                        setNotes(e.target.value);
                        setReceiptKey(crypto.randomUUID());
                      }}
                    />
                  </label>
                  <p className="inv-hint">
                    Referência é um registro interno. A importação e a validação
                    fiscal de NF-e serão integradas em etapa própria.
                  </p>
                  <button
                    className="button primary inv-save"
                    disabled={
                      busy ||
                      !data?.capabilities.receive ||
                      !["approved", "partial"].includes(order.status)
                    }
                  >
                    <ArrowDownToLine size={18} />
                    Confirmar recebimento
                  </button>
                </form>
              )}
              {tab === "history" && order && (
                <div className="inv-history">
                  <div className="purchase-history-intro">
                    <p>
                      Criado por {order.actorName} ·{" "}
                      {new Date(order.createdAt).toLocaleString("pt-BR", {
                        timeZone: "America/Fortaleza",
                      })}
                    </p>
                    <p>
                      Fornecedor na compra: {order.supplier.name} ·{" "}
                      {order.supplier.cnpj}
                    </p>
                    {order.cancelReason && (
                      <p>Cancelamento: {order.cancelReason}</p>
                    )}
                    <Link href="/produtos">Consultar produtos e estoque</Link>
                  </div>
                  {detail?.receipts.length ? (
                    detail.receipts.map((r) => (
                      <article key={r.id}>
                        <div>
                          <strong>{r.document}</strong>
                          <span
                            className={
                              "inv-badge " +
                              (r.status === "confirmed" ? "normal" : "inactive")
                            }
                          >
                            {r.status === "confirmed"
                              ? "Confirmado"
                              : "Estornado"}
                          </span>
                        </div>
                        <p>
                          {new Date(r.createdAt).toLocaleString("pt-BR", {
                            timeZone: "America/Fortaleza",
                          })}{" "}
                          · {r.actorName}
                        </p>
                        {r.items.map((i) => (
                          <p key={i.lineId}>
                            {i.name}: {qty(i.quantity)} × {qty(i.factor)} ={" "}
                            {qty(i.baseQuantity)} em unidade-base ·{" "}
                            {money(i.totalValue)}
                          </p>
                        ))}
                        <strong>Total em custo: {money(r.total)}</strong>
                        <p>{r.notes}</p>
                        {r.reversalReason && (
                          <p>
                            Estorno: {r.reversalReason} · {r.reversedBy}
                          </p>
                        )}
                        {r.status === "confirmed" &&
                          data?.capabilities.receive && (
                            <>
                              <label>
                                Motivo do estorno
                                <input
                                  aria-label={"Motivo do estorno " + r.document}
                                  value={reason}
                                  maxLength={300}
                                  onChange={(e) => {
                                    setReason(e.target.value);
                                    setReceiptKey(crypto.randomUUID());
                                  }}
                                />
                              </label>
                              <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() => void reverse(r.id)}
                              >
                                Estornar recebimento
                              </button>
                              <p className="inv-hint">
                                Exige que as entradas ainda sejam os últimos
                                movimentos dos produtos envolvidos. Falha em um
                                item reverte a operação inteira.
                              </p>
                            </>
                          )}
                      </article>
                    ))
                  ) : (
                    <p className="inv-empty">Nenhum recebimento registrado.</p>
                  )}
                  {detail && detail.receiptTotal > 20 && (
                    <Pagination
                      page={detail.receiptPage}
                      total={detail.receiptTotal}
                      busy={busy}
                      onChange={(page) => void select(order.id, false, page)}
                    />
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
