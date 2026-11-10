"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShoppingCart, Search, Plus, Minus, Trash2, Package, Check, Wallet, ReceiptText, RefreshCw, ArrowLeftRight, Store } from "lucide-react";
import { PAYMENT_METHODS, SALE_STATUSES, type AuthSession, type PosOverview, type PosProduct, type SalePage, type SaleDetail, type RegisterDetail, type CashRegister, type PaymentMethod } from "@invictus/contracts";
import { posRequest } from "../lib/pos-client";
import { PosScanner } from "./pos-scanner";
type CartLine = {
    product: PosProduct;
    quantity: string;
};
type Tab = "sale" | "history" | "cash";
type Method = {
    method: PaymentMethod;
    amount: string;
    tendered: string;
};
const money = (v: string | number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (v: string) => new Date(v).toLocaleString("pt-BR");
export function PosPanel({ session, initialTab = "sale" }: {
    session: AuthSession;
    initialTab?: Tab;
}) {
    const [tab, setTab] = useState<Tab>(initialTab), [overview, setOverview] = useState<PosOverview | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
    const [query, setQuery] = useState(""), [catalog, setCatalog] = useState<{
        items: PosProduct[];
        total: number;
        page: number;
    }>({ items: [], total: 0, page: 0 }), [cart, setCart] = useState<CartLine[]>([]), [discount, setDiscount] = useState("0"), [notes, setNotes] = useState("");
    const [selected, setSelected] = useState<SaleDetail | null>(null), [methods, setMethods] = useState<Method[]>([{ method: "cash", amount: "", tendered: "" }]), [reason, setReason] = useState("");
    const [sales, setSales] = useState<SalePage>({ items: [], total: 0, page: 0 }), [status, setStatus] = useState("all"), [saleQuery, setSaleQuery] = useState("");
    const [registers, setRegisters] = useState<{
        items: CashRegister[];
        total: number;
        page: number;
    }>({ items: [], total: 0, page: 0 }), [ledger, setLedger] = useState<RegisterDetail | null>(null), [code, setCode] = useState("CX-01"), [opening, setOpening] = useState("0"), [counted, setCounted] = useState("0"), [cashKind, setCashKind] = useState("supply"), [cashAmount, setCashAmount] = useState(""), [cashReason, setCashReason] = useState("");
    const keys = useRef(new Map<string, string>()), epoch = useRef(crypto.randomUUID()), mounted = useRef(true), inFlight = useRef(false);
    const lastRegister = useRef<string | null>(null);
    const allowed = session.permissions.includes("pos.read");
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const write = async (path: string, body: Record<string, unknown>, keyed = true) => { const signature = epoch.current + path + JSON.stringify(body); let key = keys.current.get(signature); if (!key) {
        key = crypto.randomUUID();
        keys.current.set(signature, key);
    } return posRequest<{
        id: string;
    }>(path, keyed ? { ...body, requestKey: key } : body, session.csrf); };
    const refresh = useCallback(async () => { const o = await posRequest<PosOverview>("overview"); if(lastRegister.current && lastRegister.current !== o.activeRegister?.id){epoch.current=crypto.randomUUID();keys.current.clear();}lastRegister.current=o.activeRegister?.id||null; if (mounted.current)
        setOverview(o); return o; }, []);
    const loadCatalog = useCallback(async (q: string, page = 0) => { const result = await posRequest<typeof catalog>("catalog?query=" + encodeURIComponent(q) + "&page=" + page); if (mounted.current)
        setCatalog(result); }, []);
    const loadSales = async (page = 0) => setSales(await posRequest<SalePage>("sales?status=" + status + "&query=" + encodeURIComponent(saleQuery) + "&page=" + page));
    const loadRegisters = async (page = 0) => setRegisters(await posRequest<typeof registers>("registers?page=" + page));
    const execute = async (fn: () => Promise<void>) => { if (inFlight.current)
        return; inFlight.current = true; setBusy(true); setError(""); setNotice(""); try {
        await fn();
    }
    catch (e) {
        if (mounted.current) {
            setError(e instanceof Error ? e.message : "Não foi possível concluir. Atualize a consulta.");
            if ((e as {
                status?: number;
            }).status === 403) {
                setSelected(null);
                setCatalog({ items: [], total: 0, page: 0 });
                setSales({ items: [], total: 0, page: 0 });
                setLedger(null);
            }
        }
    }
    finally {
        inFlight.current = false;
        if (mounted.current)
            setBusy(false);
    } };
    useEffect(() => { if (!allowed)
        return; void refresh().catch(e => setError(e.message)); const focus = () => { void refresh().catch(e => setError(e.message)); }; window.addEventListener("focus", focus); return () => window.removeEventListener("focus", focus); }, [allowed, refresh]);
    useEffect(() => {
        if (!overview?.unitId)
            return;
        void execute(async () => { if (tab === "sale")
            await loadCatalog(query); if (tab === "history")
            await loadSales(); if (tab === "cash")
            await loadRegisters(); }); /* tab refresh */ // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, overview?.unitId]);
    const add = (product: PosProduct) => { if (selected)
        return; setCart(lines => { const found = lines.find(l => l.product.id === product.id); return found ? lines.map(l => l === found ? { ...l, quantity: String(Number(l.quantity) + 1) } : l) : [...lines, { product, quantity: "1" }]; }); };
    const scan = async (barcode: string) => { if (selected)
        throw Error("Inicie uma nova venda para adicionar produtos."); const result = await posRequest<typeof catalog>("catalog?barcode=" + encodeURIComponent(barcode)); if (result.items.length !== 1)
        throw Error("Código não encontrado no catálogo desta unidade."); const product = result.items[0]!; add(product); setNotice("Produto lido: " + product.name); };
    const search = async () => { const q = query.trim(); if (/^\d{8,14}$/.test(q)) {
        try {
            await scan(q);
            return;
        }
        catch { /* allow internal numeric product codes */ }
    } await loadCatalog(q); };
    const gross = cart.reduce((sum, l) => sum + Math.round(Number(l.quantity) * Number(l.product.price) * 100), 0) / 100, total = Math.max(0, gross - Number(discount || 0));
    const sale = selected?.sale, payment = selected?.payments.find(p => p.id === sale?.paymentId);
    const active = overview?.activeRegister;
    const openSale = async (id: string) => { const d = await posRequest<SaleDetail>("sales/" + id); setSelected(d); setReason(""); setMethods([{ method: "cash", amount: d.sale.total, tendered: d.sale.total }]); };
    const fresh = () => { epoch.current = crypto.randomUUID(); keys.current.clear(); setSelected(null); setCart([]); setDiscount("0"); setNotes(""); setReason(""); setMethods([{ method: "cash", amount: "", tendered: "" }]); setNotice(""); };
    const save = () => execute(async () => { if (!active)
        throw Error("Abra seu caixa antes de vender."); const result = await write("sales/save", { registerId: active.id, items: cart.map(l => ({ productId: l.product.id, quantity: l.quantity, expectedPrice: l.product.price })), discount: discount || "0", notes }); await openSale(result.id); setNotice("Rascunho salvo. Confira e prepare o pagamento de teste."); });
    const prepare = () => execute(async () => { if (!sale)
        return; const result = await write("payments", { saleId: sale.id, version: sale.version, methods: methods.map(m => ({ ...m, tendered: m.method === "cash" ? m.tendered : m.amount })) }); await openSale(sale.id); await refresh(); setNotice("Pagamento de teste pendente. ID: " + result.id); });
    const settle = (outcome: "confirmed" | "authorized" | "declined") => execute(async () => { if (!payment || !sale)
        return; await write("payments/simulate", { paymentId: payment.id, outcome }, false); await openSale(sale.id); await refresh(); if (tab === "history")
        await loadSales(sales.page); setNotice(outcome === "confirmed" ? "Venda de teste confirmada. Estoque e caixa atualizados." : outcome === "authorized" ? "Autorizado em teste. O estoque só muda na confirmação." : "Pagamento de teste recusado. A venda voltou ao rascunho."); });
    const cancel = () => execute(async () => { if (!sale)
        return; await write("sales/cancel", { saleId: sale.id, version: sale.version, reason }, false); await openSale(sale.id); await refresh(); if (tab === "history")
        await loadSales(sales.page); });
    const refund = () => execute(async () => { if (!sale || !active)
        throw Error("Abra seu caixa para receber a devolução."); await write("sales/return", { saleId: sale.id, version: sale.version, registerId: active.id, reason }); await openSale(sale.id); await refresh(); if (tab === "history")
        await loadSales(sales.page); setNotice("Devolução integral de teste registrada; estoque e caixa recompostos."); });
    const viewRegister = async (id: string, page = 0) => { const d = await posRequest<RegisterDetail>("registers/" + id + "?page=" + page); setLedger(d); setCounted(d.register.balance); };
    if (!allowed)
        return <div className="panel pos-empty">Seu perfil não permite consultar o PDV.</div>;
    return <div className="pos-root">
 <div className="pos-sandbox"><ShieldIcon /><span><strong>Ambiente de teste</strong> · Todos os pagamentos são simulados. Sem cobrança e sem emissão fiscal.</span></div>
 <nav className="pos-tabs" aria-label="Vendas e caixa"><Link href="/pdv" aria-current={tab === "sale" ? "page" : undefined} onClick={e => { e.preventDefault(); setTab("sale"); }}><ShoppingCart size={18}/>Nova venda</Link><Link href="/vendas" aria-current={tab === "history" ? "page" : undefined} onClick={e => { e.preventDefault(); setTab("history"); }}><ReceiptText size={18}/>Vendas</Link><Link href="/caixa" aria-current={tab === "cash" ? "page" : undefined} onClick={e => { e.preventDefault(); setTab("cash"); }}><Wallet size={18}/>Caixa</Link><button aria-label="Atualizar PDV" disabled={busy} onClick={() => void execute(async () => { await refresh(); if (sale)
        await openSale(sale.id); if (tab === "cash")
        await loadRegisters(registers.page); if (tab === "history")
        await loadSales(sales.page); if (tab === "sale")
        await loadCatalog(query, catalog.page); })}><RefreshCw size={18}/></button></nav>
 {error && <p role="alert" className="pos-error">{error} Se houve perda de conexão, consulte o histórico antes de iniciar outra venda.</p>}{notice && <p role="status" className="pos-notice">{notice}</p>}
 {!overview?.unitId ? <div className="pos-empty panel">{overview ? "Selecione uma filial no topo para operar o PDV." : "Carregando PDV…"}</div> : <>
 <div className="pos-stats"><div><Store /><span>Caixa do operador<strong>{active ? active.code : "Fechado"}</strong></span></div><div><ShoppingCart /><span>Vendas confirmadas hoje<strong>{overview.summary.confirmed}</strong></span></div><div><Wallet /><span>Vendas de teste hoje<strong>{money(overview.summary.total)}</strong></span></div><div><ArrowLeftRight /><span>Pagamentos pendentes<strong>{overview.summary.pending}</strong></span></div></div>
 {tab === "sale" && <div className="pos-grid"><section className="panel pos-catalog"><div className="pos-heading"><h2><Package /> Produtos</h2><span>{catalog.total} encontrados</span></div><form className="pos-search" onSubmit={e => { e.preventDefault(); void execute(search); }}><label className="sr-only" htmlFor="pos-search">Buscar produto ou código</label><Search /><input id="pos-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome, código ou código de barras" maxLength={100}/><button disabled={busy}>Buscar</button></form>{!selected && overview.capabilities.sell && <PosScanner onRead={scan}/>}
 <div className="pos-products">{catalog.items.map(p => <button type="button" key={p.id} className="pos-product" disabled={!!selected || busy || !active || !overview.capabilities.sell} onClick={() => add(p)}><span className="pos-product-icon"><Package /></span><span><small>{p.code} · {p.category || p.baseUnit}</small><strong>{p.name}</strong><small>Disponível: {Number(p.available).toLocaleString("pt-BR")} {p.baseUnit}</small></span><b>{money(p.price)}</b><Plus size={17}/></button>)}{!catalog.items.length && <p className="pos-empty">Nenhum produto disponível para venda nesta consulta.</p>}</div><Pager page={catalog.page} total={catalog.total} busy={busy} onPage={p => void execute(() => loadCatalog(query, p))}/></section>
 <section className="panel pos-cart"><div className="pos-heading"><h2><ShoppingCart />Carrinho da venda</h2><button disabled={busy} onClick={fresh}>{sale ? "Nova venda" : "Limpar"}</button></div>
 {sale ? <div className="pos-sale-state"><strong>{sale.number}</strong><span className={"pos-badge " + sale.status}>{SALE_STATUSES[sale.status]}</span></div> : <p className="pos-cart-hint">Adicione produtos pelo catálogo, busca ou câmera.</p>}
 <div className="pos-cart-lines">{sale ? sale.items.map(i => <div className="pos-line" key={i.id}><Package /><div><strong>{i.name}</strong><small>{i.quantity} {i.baseUnit} × {money(i.unitPrice)}</small></div><b>{money(i.total)}</b></div>) : cart.map(l => <div className="pos-line" key={l.product.id}><Package /><div><strong>{l.product.name}</strong><small>{money(l.product.price)} / {l.product.baseUnit}</small><div className="pos-quantity"><button aria-label={"Diminuir " + l.product.name} onClick={() => setCart(lines => lines.map(x => x === l ? { ...x, quantity: String(Math.max(.001, Number(x.quantity) - 1)) } : x))}><Minus size={14}/></button><input aria-label={"Quantidade de " + l.product.name} type="number" min="0.001" step="0.001" value={l.quantity} onChange={e => setCart(lines => lines.map(x => x === l ? { ...x, quantity: e.target.value } : x))}/><button aria-label={"Aumentar " + l.product.name} onClick={() => add(l.product)}><Plus size={14}/></button></div></div><b>{money(Number(l.quantity) * Number(l.product.price))}</b><button aria-label={"Remover " + l.product.name} onClick={() => setCart(lines => lines.filter(x => x !== l))}><Trash2 size={17}/></button></div>)}{!sale && !cart.length && <p className="pos-empty">O carrinho está vazio.</p>}</div>
 <div className="pos-totals"><span>Subtotal <b>{money(sale?.gross ?? gross)}</b></span><label>Desconto {sale ? <b>{money(sale.discount)}</b> : <input aria-label="Desconto da venda" type="number" min="0" step="0.01" disabled={!overview.capabilities.discount || busy} value={discount} onChange={e => setDiscount(e.target.value)}/>}</label><div className="pos-total">Total da venda <strong>{money(sale?.total ?? total)}</strong></div></div>
 {!sale && <><label className="pos-field">Observações<input value={notes} maxLength={1000} onChange={e => setNotes(e.target.value)}/></label><button className="pos-gold pos-wide" disabled={busy || !cart.length || !active || !overview.capabilities.sell} onClick={save}><Check size={21}/>Salvar rascunho</button>{!active && <p>Abra seu caixa na aba Caixa para iniciar uma venda.</p>}</>}
 </section></div>}

 {tab === "history" && <section className="panel pos-history"><div className="pos-heading"><h2><ReceiptText /> Controle de vendas</h2><span>Somente a filial selecionada</span></div><form className="pos-filters" onSubmit={e => { e.preventDefault(); void execute(() => loadSales()); }}><label>Buscar venda ou operador<input value={saleQuery} maxLength={100} onChange={e => setSaleQuery(e.target.value)}/></label><label>Situação<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todas</option>{Object.entries(SALE_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><button className="pos-gold" disabled={busy}>Consultar vendas</button></form><div className="pos-table-wrap"><table><thead><tr><th>Venda / data</th><th>Operador</th><th>Situação</th><th>Total</th><th>Detalhes</th></tr></thead><tbody>{sales.items.map(s => <tr key={s.id}><td><strong>{s.number}</strong><small>{date(s.createdAt)}</small></td><td>{s.operatorName}</td><td><span className={"pos-badge " + s.status}>{SALE_STATUSES[s.status]}</span></td><td>{money(s.total)}</td><td><button onClick={() => void execute(() => openSale(s.id))}>Abrir venda</button></td></tr>)}</tbody></table>{!sales.items.length && <p className="pos-empty">Nenhuma venda encontrada.</p>}</div><Pager page={sales.page} total={sales.total} busy={busy} onPage={p => void execute(() => loadSales(p))}/></section>}
 {tab === "cash" && <div className="pos-cash-grid"><section className="panel"><div className="pos-heading"><h2><Wallet />Controle de caixa</h2></div>{!active && overview.capabilities.cash && <form className="pos-form" onSubmit={e => { e.preventDefault(); void execute(async () => { const result = await write("registers/open", { unitId: overview.unitId, code: code.trim().toUpperCase(), openingAmount: opening }); await refresh(); await loadRegisters(); await viewRegister(result.id); setNotice("Caixa aberto para seu operador."); }); }}><label>Código do caixa<input required value={code} maxLength={24} onChange={e => setCode(e.target.value)}/></label><label>Fundo de abertura (R$)<input required type="number" min="0" step="0.01" value={opening} onChange={e => setOpening(e.target.value)}/></label><button className="pos-gold" disabled={busy}>Abrir caixa</button></form>}<div className="pos-registers">{registers.items.map(r => <button key={r.id} onClick={() => void execute(() => viewRegister(r.id))}><Wallet /><span><strong>{r.code} · {r.closedAt ? "Fechado" : "Aberto"}</strong><small>{r.operatorName} · {date(r.openedAt)}</small></span><b>{money(r.balance)}</b></button>)}{!registers.items.length && <p className="pos-empty">Nenhum caixa registrado.</p>}</div><Pager page={registers.page} total={registers.total} busy={busy} onPage={p => void execute(() => loadRegisters(p))}/></section>
 <section className="panel">{ledger ? <><div className="pos-heading"><h2>{ledger.register.code} · Extrato</h2><span>{ledger.register.closedAt ? "Fechado" : "Aberto"}</span></div><div className="pos-form"><strong>Saldo esperado: {money(ledger.register.balance)}</strong><p>Operador: {ledger.register.operatorName}</p>{ledger.register.closedAt && <p>Contado: {money(ledger.register.counted || 0)} · Diferença: {money(ledger.register.difference || 0)}</p>}<div className="pos-ledger">{ledger.entries.map(e => <div key={e.id}><span><strong>{{ opening: "Abertura", sale: "Venda", refund: "Devolução", supply: "Suprimento", withdraw: "Sangria" }[e.kind]}</strong><small>{e.reason} · {e.actorName} · {date(e.createdAt)}</small></span><b>{money(e.amount)}</b></div>)}</div><Pager page={ledger.page} total={ledger.total} busy={busy} onPage={p => void execute(() => viewRegister(ledger.register.id, p))}/>
 {!ledger.register.closedAt && (ledger.register.id === active?.id || overview.capabilities.manageCash) && <>{overview.capabilities.manageCash && <form className="pos-form pos-cash-adjust" onSubmit={e => { e.preventDefault(); void execute(async () => { await write("registers/adjust", { registerId: ledger.register.id, kind: cashKind, amount: cashAmount, reason: cashReason }); await viewRegister(ledger.register.id); await refresh(); await loadRegisters(registers.page); setCashAmount(""); setCashReason(""); epoch.current = crypto.randomUUID(); }); }}><h3>Movimentar caixa</h3><label>Operação<select value={cashKind} onChange={e => setCashKind(e.target.value)}><option value="supply">Suprimento</option><option value="withdraw">Sangria</option></select></label><label>Valor (R$)<input type="number" step="0.01" min="0.01" required value={cashAmount} onChange={e => setCashAmount(e.target.value)}/></label><label>Motivo<input required minLength={3} maxLength={300} value={cashReason} onChange={e => setCashReason(e.target.value)}/></label><button disabled={busy}>Registrar movimentação</button></form>}
 <form className="pos-form pos-close" onSubmit={e => { e.preventDefault(); void execute(async () => { await write("registers/close", { registerId: ledger.register.id, counted, notes: cashReason }); await viewRegister(ledger.register.id); await refresh(); await loadRegisters(registers.page); setNotice("Caixa fechado. Diferença registrada no histórico."); }); }}><h3>Conferir e fechar caixa</h3><p>Resolva pagamentos pendentes antes de fechar.</p><label>Dinheiro contado (R$)<input required type="number" min="0" step="0.01" value={counted} onChange={e => setCounted(e.target.value)}/></label><label>Observação do fechamento<input value={cashReason} maxLength={300} onChange={e => setCashReason(e.target.value)}/></label><button className="pos-gold" disabled={busy}>Fechar caixa conferido</button></form></>}
 </div></> : <p className="pos-empty">Selecione um caixa para conferir lançamentos e fechamento.</p>}</section></div>}
 {sale && tab !== "cash" && <section className="panel pos-sale-detail"><div className="pos-heading"><h2><ReceiptText />{sale.number}</h2><span className={"pos-badge " + sale.status}>{SALE_STATUSES[sale.status]}</span></div>
 {tab === "history" && <div className="pos-form"><p>{sale.operatorName} · {date(sale.createdAt)} · {sale.unit.unitName}</p>{sale.items.map(i => <div className="pos-detail-item" key={i.id}><span>{i.name} · {i.quantity} {i.baseUnit}</span><strong>{money(i.total)}</strong></div>)}<strong>Total: {money(sale.total)} · Desconto: {money(sale.discount)}</strong></div>}
 {sale.status === "draft" && overview.capabilities.sell && <div className="pos-form"><h3>Pagamento de teste</h3><p>Escolha até quatro formas. A soma precisa ser {money(sale.total)}.</p>{methods.map((m, index) => <div className="pos-method" key={index}><label>Forma<select value={m.method} onChange={e => setMethods(ms => ms.map((x, i) => i === index ? { ...x, method: e.target.value as PaymentMethod } : x))}>{Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label>Valor (R$)<input type="number" min="0.01" step="0.01" value={m.amount} onChange={e => setMethods(ms => ms.map((x, i) => i === index ? { ...x, amount: e.target.value } : x))}/></label>{m.method === "cash" && <label>Recebido (R$)<input type="number" min="0" step="0.01" value={m.tendered} onChange={e => setMethods(ms => ms.map((x, i) => i === index ? { ...x, tendered: e.target.value } : x))}/></label>}{methods.length > 1 && <button aria-label={"Remover forma " + (index + 1)} onClick={() => setMethods(ms => ms.filter((_, i) => i !== index))}><Trash2 size={18}/></button>}</div>)}<div className="pos-actions"><button disabled={busy || methods.length >= 4} onClick={() => setMethods(ms => [...ms, { method: (["cash", "pix", "debit", "credit"] as PaymentMethod[]).find(k => !ms.some(x => x.method === k))!, amount: "", tendered: "" }])}>Adicionar forma</button><button className="pos-gold" disabled={busy} onClick={prepare}>Preparar pagamento de teste</button></div></div>}
 {payment && <div className="pos-payment-state"><strong>Pagamento simulado: {payment.state === "confirmed" ? "confirmado" : payment.state === "authorized" ? "autorizado" : payment.state === "pending" ? "pendente" : payment.state === "declined" ? "recusado" : payment.state === "refunded" ? "devolvido" : "cancelado"}</strong><span>{payment.methods.map(m => PAYMENT_METHODS[m.method] + ": " + money(m.amount)).join(" · ")} · Troco: {money(payment.changeAmount)}</span><small>Referência de teste: {payment.id}</small>{sale.status === "pending" && overview.capabilities.sell && <div className="pos-actions"><button className="pos-gold" disabled={busy} onClick={() => settle("confirmed")}><Check size={18}/>Confirmar venda de teste</button><button disabled={busy} onClick={() => settle("authorized")}>Simular autorização</button><button disabled={busy} onClick={() => settle("declined")}>Simular recusa</button></div>}</div>}
 {((['draft', 'pending'].includes(sale.status) && overview.capabilities.sell) || (sale.status === "confirmed" && overview.capabilities.refund)) && <div className="pos-form"><label>Motivo do cancelamento ou devolução<input value={reason} minLength={3} maxLength={300} onChange={e => setReason(e.target.value)}/></label>{sale.status === "confirmed" ? <button disabled={busy || !active || reason.trim().length < 3} onClick={refund}>Confirmar devolução integral de teste</button> : <button disabled={busy || reason.trim().length < 3} onClick={cancel}>Cancelar venda</button>}</div>}
 {sale.reason && <p className="pos-form">Motivo registrado: {sale.reason}</p>}
 <details className="pos-receipt-details"><summary>Comprovante de teste</summary><div id="pos-receipt" className="pos-receipt"><strong>INVICTUS ERP COMERCIAL</strong><h3>Comprovante de teste</h3><b>SEM VALOR FISCAL · PAGAMENTO SIMULADO</b><p>{sale.unit.companyName}<br />{sale.unit.unitName} · {sale.unit.unitCode}<br />{sale.unit.cnpj}</p><p>{sale.number} · {SALE_STATUSES[sale.status]}<br />{date(sale.createdAt)} · {sale.operatorName}</p>{sale.items.map(i => <div key={i.id}><span>{i.name}<small>{i.quantity} {i.baseUnit} × {money(i.unitPrice)}</small></span><b>{money(i.total)}</b></div>)}<p>Desconto: {money(sale.discount)}</p><h3>Total: {money(sale.total)}</h3>{payment && <p>{payment.methods.map(m => PAYMENT_METHODS[m.method] + " " + money(m.amount)).join(" · ")}<br />Troco: {money(payment.changeAmount)}</p>}<p>Não comprova cobrança ou pagamento real.</p></div><button onClick={() => window.print()}>Imprimir comprovante de teste</button></details>
 <details className="pos-attempts"><summary>Histórico de pagamentos ({selected.payments.length})</summary>{selected.payments.map(p => <p key={p.id}>{date(p.createdAt)} · {p.state} · {money(p.total)}<small>{p.id}</small></p>)}</details>
 </section>}
 </>}
 </div>;
}
function ShieldIcon() { return <Check size={19}/>; }
function Pager({ page, total, busy, onPage }: {
    page: number;
    total: number;
    busy: boolean;
    onPage: (p: number) => void;
}) { return <div className="pos-pager"><span>{total} registros · Página {page + 1}</span><button aria-label="Página anterior" disabled={busy || page === 0} onClick={() => onPage(page - 1)}>Anterior</button><button aria-label="Próxima página" disabled={busy || (page + 1) * 20 >= total} onClick={() => onPage(page + 1)}>Próxima</button></div>; }
