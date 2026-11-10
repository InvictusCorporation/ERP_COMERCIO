"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Users, Wallet, Gift, ShoppingBag, Truck, RefreshCw, Plus, Search, Package, Check, History, X } from 'lucide-react';
import { weighedTotal, ORDER_STATUSES, DELIVERY_STATUSES, type AuthSession, type Customer, type CustomerDetail, type CustomerAddress, type CustomerOrder, type CustomerDelivery, type CrmOverview, type CrmPage, type LoyaltyEvent } from '@invictus/contracts';
import { crmRequest as request } from '../lib/crm-client';
import { financeRequest } from '../lib/finance-client';
const money = (v: string | number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), when = (v: string) => new Date(v).toLocaleString('pt-BR');
const addressText=(a:CustomerAddress)=>[a.street,a.number,a.complement,a.district,a.city,a.state,a.postalCode].filter(Boolean).join(' · ');
const previewOrderItem=(q:string,p:string)=>{try{return weighedTotal(q,p);}catch{return '0.00';}};
const emptyAddress: CustomerAddress = { street: '', number: '', complement: '', district: '', city: '', state: '', postalCode: '' };
type Tab = 'customers' | 'credit' | 'loyalty' | 'orders' | 'deliveries';
type Ctx = {
    session: AuthSession;
    overview: CrmOverview;
    revision: number;
    busy: boolean;
    task: (fn: () => Promise<void>) => void;
    write: (path: string, input: Record<string, unknown>, keyed?: boolean) => Promise<{
        id: string;
    }>;
    fail: (e: unknown) => void;
};
type Product = {
    id: string;
    name: string;
    code: string;
    baseUnit: string;
    price: string;
};
export function CrmPanel({ session, initialTab = 'customers' }: {
    session: AuthSession;
    initialTab?: Tab;
}) {
    const [tab, setTab] = useState<Tab>(initialTab), [overview, setOverview] = useState<CrmOverview | null>(null), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const live = useRef(true), lock = useRef(false), keys = useRef(new Map<string, string>()), used = useRef(new Set<string>());
    const allowed = session.permissions.includes('crm.read');
    const fail = useCallback((e: unknown) => { if (!live.current)
        return; setError(e instanceof Error ? e.message : 'Não foi possível concluir.'); if ([401, 403].includes((e as {
        status?: number;
    }).status || 0))
        setOverview(null); }, []);
    const refresh = useCallback(async () => { const o = await request<CrmOverview>('overview'); if (live.current)
        setOverview(o); }, []);
    useEffect(() => { live.current = true; if (allowed && session.activeUnitId)
        void refresh().catch(fail); return () => { live.current = false; }; }, [allowed, session.activeUnitId, refresh, fail]);
    const task = async (fn: () => Promise<void>) => { if (lock.current)
        return; lock.current = true; used.current.clear(); setBusy(true); setError(''); setNotice(''); try {
        await fn();
        await refresh();
        for (const key of used.current)
            keys.current.delete(key);
        if (live.current) {
            setRevision(v => v + 1);
            setNotice('Operação registrada.');
        }
    }
    catch (e) {
        fail(e);
    }
    finally {
        lock.current = false;
        if (live.current)
            setBusy(false);
    } };
    const write = async (path: string, input: Record<string, unknown>, keyed = true) => { const signature = path + JSON.stringify(input); if (keyed && !keys.current.has(signature))
        keys.current.set(signature, crypto.randomUUID()); const result = await request<{
        id: string;
    }>(path, { ...input, ...(keyed ? { requestKey: keys.current.get(signature) } : {}) }, session.csrf); if (keyed)
        used.current.add(signature); return result; };
    if (!allowed)
        return <section className="panel pos-empty">Seu perfil não permite consultar clientes.</section>;
    if (!session.activeUnitId)
        return <section className="panel pos-empty">Selecione uma filial no cabeçalho para iniciar o atendimento.</section>;
    const c: Ctx = { session, overview: overview!, revision, busy, task, write, fail };
    const tabs = [['customers', 'Clientes', Users], ['credit', 'Crediário', Wallet], ['loyalty', 'Fidelidade', Gift], ['orders', 'Pedidos', ShoppingBag], ['deliveries', 'Entregas', Truck]] as const;
    return <div className="pos-root fin-root crm-root"><div className="crm-intro"><div><span className="crm-eyebrow">RELACIONAMENTO & ATENDIMENTO</span><h1>Relacionamento com clientes</h1><p>Cadastro, compras, crédito e entregas em um só lugar.</p></div><Users size={60}/></div>
    {error && <p className="pos-error" role="alert">{error}</p>}{notice && <p className="pos-notice" role="status">{notice}</p>}
        {overview ? <><div className="pos-stats crm-stats">{[[Users, 'Clientes ativos', overview.summary.customers], [ShoppingBag, 'Pedidos em aberto', overview.summary.orders], [Package, 'Pedidos reservados', overview.summary.reserved], [Truck, 'Entregas pendentes', overview.summary.deliveries]].map(([Icon, label, n], i) => { const I = Icon as typeof Users; return <article key={i}><I /><span>{label as string}<strong>{n as number}</strong></span></article>; })}</div>
        <div className="pos-tabs fin-tabs crm-tabs" role="navigation" aria-label="Relacionamento">{tabs.filter(([key]) => !['orders', 'deliveries'].includes(key) || session.permissions.includes('orders.read')).map(([key, label, Icon]) => <button key={key} disabled={busy} aria-pressed={tab === key} onClick={() => { setTab(key); setNotice(''); setError(''); }}><Icon size={18}/>{label}</button>)}<button disabled={busy} aria-label="Atualizar relacionamento" onClick={() => void task(async () => { })}><RefreshCw size={17}/></button></div>
        {tab === 'customers' && <Customers c={c}/>} {tab === 'credit' && <Relationship c={c} kind="credit"/>}{tab === 'loyalty' && <Relationship c={c} kind="loyalty"/>}{tab === 'orders' && <Orders c={c}/>} {tab === 'deliveries' && <Deliveries c={c}/>}
        <p className="crm-foot">Dados e operações limitados à filial selecionada. <Link href="/auditoria">Consultar histórico de alterações</Link></p></> : !error && <p className="pos-empty" role="status">Carregando relacionamento…</p>}</div>;
}
function Card({ title, icon, children, action }: {
    title: string;
    icon: ReactNode;
    children: ReactNode;
    action?: ReactNode;
}) { return <section className="panel crm-card"><div className="pos-heading"><h2>{icon}{title}</h2>{action}</div>{children}</section>; }
function Pager({ page, total, busy, change }: {
    page: number;
    total: number;
    busy: boolean;
    change: (p: number) => void;
}) { return <div className="crm-pager"><span>{total} registros · página {page + 1}</span><button disabled={busy || !page} onClick={() => change(page - 1)}>Anterior</button><button disabled={busy || (page + 1) * 20 >= total} onClick={() => change(page + 1)}>Próxima</button></div>; }
export function CustomerPicker({ onSelect, disabled, searchLabel }: {
    onSelect: (c: Customer) => void;
    searchLabel?: string;
    disabled: boolean;
}) { return <Picker<Customer> path="customers" label="Buscar cliente" searchLabel={searchLabel} disabled={disabled} render={x => <><strong>{x.name}</strong><small>{x.code} · {x.active ? 'Ativo' : 'Inativo'}</small></>} choose={onSelect}/>; }
function Picker<T extends {
    id: string;
}>({ path, label, render, choose, disabled, searchLabel }: {
    path: string;
    searchLabel?: string;
    label: string;
    render: (x: T) => ReactNode;
    choose: (x: T) => void;
    disabled: boolean;
}) { const [query, setQuery] = useState(''), [data, setData] = useState<CrmPage<T> | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false); const load = async (p = 0) => { setLoading(true); setError(''); try {
    setData(await request<CrmPage<T>>(path + '?query=' + encodeURIComponent(query) + '&page=' + p));
}
catch (e) {
    setData(null);
    setError(e instanceof Error ? e.message : 'Consulta indisponível.');
}
finally {
    setLoading(false);
} }; return <div className="crm-picker"><div className="crm-search"><label>{label}<input maxLength={100} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') {
    e.preventDefault();
    void load();
} }}/></label><button type="button" disabled={disabled || loading} onClick={() => void load()}><Search size={17}/>{searchLabel || 'Buscar'}</button></div>{error && <p role="alert">{error}</p>}{data && <><div className="crm-picker-results">{data.items.map(x => <button type="button" key={x.id} disabled={disabled} onClick={() => choose(x)}>{render(x)}<Plus size={16}/></button>)}{!data.total && <p>Nenhum registro encontrado.</p>}</div><Pager page={data.page} total={data.total} busy={disabled || loading} change={p => void load(p)}/></>}</div>; }
function AddressFields({ value, onChange }: {
    value: CustomerAddress;
    onChange: (a: CustomerAddress) => void;
}) { return <div className="crm-fields">{Object.entries({ street: 'Logradouro', number: 'Número', complement: 'Complemento', district: 'Bairro', city: 'Cidade', state: 'UF', postalCode: 'CEP' }).map(([k, label]) => <label key={k}>{label}<input maxLength={k === 'state' ? 2 : k === 'postalCode' ? 9 : k === 'street' ? 160 : k === 'number' ? 20 : 80} value={value[k as keyof CustomerAddress]} onChange={e => onChange({ ...value, [k]: e.target.value })}/></label>)}</div>; }
function Customers({ c }: {
    c: Ctx;
}) {
    const [data, setData] = useState<CrmPage<Customer>>({ items: [], total: 0, page: 0 }), [query, setQuery] = useState(''), [detail, setDetail] = useState<CustomerDetail | null>(null), [editing, setEditing] = useState(false), [history, setHistory] = useState<CrmPage<{
        id: string;
        number: string;
        status: string;
        total: string;
        createdAt: string;
        source: string;
    }> | null>(null);
    const load = useCallback(async (p = 0, q = '') => setData(await request<CrmPage<Customer>>('customers?query=' + encodeURIComponent(q) + '&page=' + p)), []);
    useEffect(() => { let live = true; void request<CrmPage<Customer>>('customers?query=' + encodeURIComponent(query) + '&page=' + data.page).then(r => { if (live)
        setData(r); }).catch(c.fail); return () => { live = false; }; }, [c.revision]);
    const open = async (id: string, p = 0) => { const [d, h] = await Promise.all([request<CustomerDetail>('customers/' + id), request<NonNullable<typeof history>>('customers/' + id + '/history?page=' + p)]); setDetail(d); setHistory(h); setEditing(false); };
    return <div className={'crm-grid ' + (editing || detail ? 'has-detail' : '')}><Card title="Cadastro de clientes" icon={<Users />} action={c.overview.canManage && <button className="pos-gold" disabled={c.busy} onClick={() => { setDetail(null); setHistory(null); setEditing(true); }}><Plus size={17}/>Novo cliente</button>}><form className="pos-filters" onSubmit={e => { e.preventDefault(); c.task(() => load(0, query)); }}><label>Nome, código ou documento<input value={query} onChange={e => setQuery(e.target.value)} maxLength={100}/></label><button disabled={c.busy}><Search size={17}/>Consultar clientes</button></form><div className="pos-table-wrap"><table><thead><tr><th>Cliente</th><th>Contato</th><th>Fidelidade</th><th>Situação</th><th>Detalhes</th></tr></thead><tbody>{data.items.map(x => <tr key={x.id}><td><strong>{x.name}</strong><small>{x.code}</small></td><td>{x.phone || '—'}<small>{x.email}</small></td><td>{x.loyaltyOptIn ? 'Participante' : 'Não participante'}</td><td><span className={'fin-status ' + (x.active ? 'paid' : 'cancelled')}>{x.active ? 'Ativo' : 'Inativo'}</span></td><td><button disabled={c.busy} onClick={() => c.task(() => open(x.id))}>Abrir cliente</button></td></tr>)}</tbody></table>{!data.items.length && <p className="pos-empty">Nenhum cliente encontrado. Comece um novo cadastro.</p>}</div><Pager page={data.page} total={data.total} busy={c.busy} change={p => c.task(() => load(p, query))}/></Card>
    {editing ? <CustomerForm key={detail?.customer.id || 'new'} c={c} value={detail?.customer} close={() => { setEditing(false); setDetail(null); }} saved={async (id) => { await load(data.page, query); await open(id); }}/> : detail && <Card title="Perfil do cliente" icon={<Users />} action={<button aria-label="Fechar cliente" onClick={() => setDetail(null)}><X size={17}/></button>}><div className="pos-form"><div className="crm-profile"><span>{detail.customer.name.slice(0, 2).toUpperCase()}</span><div><h3>{detail.customer.name}</h3><small>{detail.customer.code} · {detail.customer.active ? 'Ativo' : 'Inativo'}</small></div></div><p>{detail.customer.document || 'Documento não informado'}<br />{detail.customer.phone || 'Telefone não informado'}<br />{detail.customer.email}</p><p>{addressText(detail.customer.address) || 'Endereço não informado'}</p><div className="crm-points"><Gift /><span>Pontos disponíveis<strong>{detail.points}</strong></span></div>{detail.credit && <p>Limite aprovado: <b>{money(detail.credit.limit)}</b><br />Disponível: <b>{money(detail.credit.available)}</b></p>}{detail.customer.notes && <p>{detail.customer.notes}</p>}{c.overview.canManage && <button disabled={c.busy} onClick={() => setEditing(true)}>Editar cadastro</button>}<h3><History size={18}/>Histórico de compras</h3>{history?.items.map(x => <div className="crm-history" key={x.id}><strong>{x.number}</strong><span>{x.source === 'sandbox' ? 'PDV · teste simulado' : 'Pedido manual'} · {ORDER_STATUSES[x.status as keyof typeof ORDER_STATUSES] || x.status}</span><b>{money(x.total)}</b><small>{when(x.createdAt)}</small></div>)}{history && !history.total && <p>Este cliente ainda não possui compras vinculadas.</p>}{history && <Pager page={history.page} total={history.total} busy={c.busy} change={p => c.task(() => open(detail.customer.id, p))}/>}</div></Card>}</div>;
}
function CustomerForm({ c, value, close, saved }: {
    c: Ctx;
    value?: Customer;
    close: () => void;
    saved: (id: string) => Promise<void>;
}) { const [form, setForm] = useState({ name: value?.name || '', document: value?.document || '', phone: value?.phone || '', email: value?.email || '', address: value?.address || emptyAddress, notes: value?.notes || '', active: value?.active ?? true, loyaltyOptIn: value?.loyaltyOptIn ?? false }); return <Card title={value ? 'Editar cliente' : 'Novo cliente'} icon={<Users />} action={<button aria-label="Fechar cadastro" onClick={close}><X size={17}/></button>}><form className="pos-form" onSubmit={e => { e.preventDefault(); c.task(async () => { const r = await c.write('customers', { ...form, unitId: c.overview.unitId, ...(value ? { id: value.id, version: value.version } : {}) }); await saved(r.id); }); }}><fieldset disabled={c.busy}><label>Nome do cliente *<input required minLength={2} maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label><div className="crm-fields">{(['document', 'phone', 'email'] as const).map(k => <label key={k}>{{ document: 'CPF ou CNPJ (opcional)', phone: 'Telefone', email: 'E-mail' }[k]}<input type={k === 'email' ? 'email' : 'text'} maxLength={k === 'email' ? 254 : 20} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}/></label>)}</div><h3>Endereço</h3><AddressFields value={form.address} onChange={address => setForm({ ...form, address })}/><label>Observações<textarea maxLength={1000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></label><label className="crm-check"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })}/>Cliente ativo</label><label className="crm-check"><input type="checkbox" checked={form.loyaltyOptIn} onChange={e => setForm({ ...form, loyaltyOptIn: e.target.checked })}/>Cliente deseja participar do programa de pontos</label><button className="pos-gold"><Check size={18}/>Salvar cliente</button></fieldset></form></Card>; }
function Relationship({ c, kind }: {
    c: Ctx;
    kind: 'credit' | 'loyalty';
}) { const [selected, setSelected] = useState<CustomerDetail | null>(null), [events, setEvents] = useState<CrmPage<LoyaltyEvent>>({ items: [], total: 0, page: 0 }); const open = async (id: string, p = 0) => { const [d, e] = await Promise.all([request<CustomerDetail>('customers/' + id), request<CrmPage<LoyaltyEvent>>('loyalty?customerId=' + id + '&page=' + p)]); setSelected(d); setEvents(e); }; return <div className="crm-grid has-detail"><Card title={kind === 'credit' ? 'Crediário por cliente' : 'Programa de fidelidade'} icon={kind === 'credit' ? <Wallet /> : <Gift />}><div className="pos-form">{kind === 'loyalty' && <ProgramForm key={c.overview.program?.version || 'new'} c={c}/>}<p>{kind === 'credit' ? 'O limite considera parcelas pendentes e pedidos já reservados. Títulos vencidos bloqueiam novas compras a prazo.' : 'Pontos são gerados sobre os produtos de pedidos manuais concluídos. Taxas de entrega e vendas simuladas do PDV não geram pontos.'}</p><CustomerPicker disabled={c.busy} onSelect={x => c.task(() => open(x.id))}/>{!selected && <p className="pos-empty">Busque um cliente para consultar {kind === 'credit' ? 'seu crédito' : 'o extrato de pontos'}.</p>}</div></Card>{selected && <Card title={selected.customer.name} icon={kind === 'credit' ? <Wallet /> : <Gift />}><div className="pos-form">{kind === 'credit' ? <><CreditForm key={selected.customer.id + '/' + selected.credit?.version} c={c} d={selected} refresh={() => open(selected.customer.id)}/><p>As baixas e os estornos das parcelas são registrados no <Link href="/financeiro">financeiro</Link>. A liberação do limite acompanha o principal ainda pendente.</p></> : <><div className="crm-points"><Gift /><span>Saldo de pontos<strong>{selected.points}</strong></span></div><p>{selected.customer.loyaltyOptIn ? 'Cliente participante do programa.' : 'Cliente não aderiu ao programa.'}</p>{c.overview.canLoyalty && <PointsForm c={c} d={selected} refresh={() => open(selected.customer.id)}/>}<h3>Extrato de pontos</h3>{events.items.map(x => <div className="crm-history" key={x.id}><strong>{{ earn: 'Pontos por compra', reversal: 'Estorno por devolução', adjust: 'Ajuste autorizado', redeem: 'Resgate registrado' }[x.kind] || x.kind}</strong><b>{Number(x.points) > 0 ? '+' : ''}{x.points}</b><span>{x.reason}</span><small>{when(x.createdAt)} · {x.actorName}</small></div>)}{!events.total && <p>Nenhum movimento de pontos.</p>}<Pager page={events.page} total={events.total} busy={c.busy} change={p => c.task(() => open(selected.customer.id, p))}/></>}</div></Card>}</div>; }
function ProgramForm({ c }: {
    c: Ctx;
}) { const p = c.overview.program, [cents, setCents] = useState(String(p?.centsPerPoint ?? 100)), [active, setActive] = useState(p?.active ?? false); return <form className="crm-inset" onSubmit={e => { e.preventDefault(); c.task(async () => { await c.write('program', { unitId: c.overview.unitId, centsPerPoint: Number(cents), active, ...(p ? { version: p.version } : {}) }, false); }); }}><h3>Regra de pontos da filial</h3><fieldset disabled={c.busy || !c.overview.canLoyalty}><label>Centavos em produtos para ganhar 1 ponto<input type="number" required min={1} max={1000000000} step={1} value={cents} onChange={e => setCents(e.target.value)}/></label><small>Exemplo: 100 centavos = 1 ponto a cada R$ 1,00. As frações não acumulam entre pedidos.</small><label className="crm-check"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/>Programa ativo</label>{c.overview.canLoyalty && <button>Salvar programa</button>}</fieldset></form>; }
function CreditForm({ c, d, refresh }: {
    c: Ctx;
    d: CustomerDetail;
    refresh: () => Promise<void>;
}) { const [limit, setLimit] = useState(d.credit?.limit || '0'), [enabled, setEnabled] = useState(d.credit?.enabled ?? false), [reason, setReason] = useState(''); return <><div className="crm-credit-values">{[['Limite aprovado', d.credit?.limit || '0'], ['Comprometido', d.credit?.exposure || '0'], ['Pedidos reservados', d.credit?.held || '0'], ['Vencido', d.credit?.overdue || '0'], ['Disponível', d.credit?.available || '0']].map(([label, v]) => <div key={label}><span>{label}</span><strong>{money(v || 0)}</strong></div>)}</div>{d.credit && <small>Aprovação: {d.credit.approvedBy} · {d.credit.enabled ? 'Habilitado' : 'Bloqueado'}</small>}{c.overview.canCredit ? <form className="crm-inset" onSubmit={e => { e.preventDefault(); c.task(async () => { await c.write('credit', { customerId: d.customer.id, limit, enabled, reason, ...(d.credit ? { version: d.credit.version } : {}) }, false); await refresh(); }); }}><fieldset disabled={c.busy}><label>Limite autorizado (R$)<input type="number" required min="0" step="0.01" value={limit} onChange={e => setLimit(e.target.value)}/></label><label className="crm-check"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/>Habilitar compras no crediário</label><label>Motivo da aprovação ou bloqueio *<input required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)}/></label><button className="pos-gold">Registrar aprovação</button></fieldset></form> : <p>Seu perfil não permite aprovar limites. Valores disponíveis somente com acesso ao crédito ou financeiro.</p>}</>; }
function PointsForm({ c, d, refresh }: {
    c: Ctx;
    d: CustomerDetail;
    refresh: () => Promise<void>;
}) { const [kind, setKind] = useState('redeem'), [points, setPoints] = useState(''), [reason, setReason] = useState(''); return <form className="crm-inset" onSubmit={e => { e.preventDefault(); c.task(async () => { await c.write('loyalty', { customerId: d.customer.id, kind, points, reason }); await refresh(); setPoints(''); setReason(''); }); }}><h3>Registrar benefício ou ajuste</h3><fieldset disabled={c.busy}><label>Operação<select aria-label="Operação" value={kind} onChange={e => setKind(e.target.value)}><option value="redeem">Resgate de pontos</option><option value="adjust">Ajuste autorizado</option></select></label><label>Pontos (inteiros)<input required type="number" min={kind === 'redeem' ? 1 : -999999999} max={999999999} step={1} value={points} onChange={e => setPoints(e.target.value)}/></label><label>Benefício entregue ou motivo do ajuste *<input required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)}/></label><small>O resgate registra o benefício informado. Não gera desconto automático, dinheiro ou cashback.</small><button>Registrar movimento de pontos</button></fieldset></form>; }
function Orders({ c }: {
    c: Ctx;
}) { const [data, setData] = useState<CrmPage<CustomerOrder>>({ items: [], total: 0, page: 0 }), [query, setQuery] = useState(''), [creating, setCreating] = useState(false), [detail, setDetail] = useState<(CustomerOrder & {
    titles: {
        id: string;
        number: string;
        amount: string;
        paid: string;
        dueDate: string;
        cancelled: boolean;
        installment: number;
        installments: number;
    }[];
}) | null>(null); const load = async (p = 0) => setData(await request<CrmPage<CustomerOrder>>('orders?query=' + encodeURIComponent(query) + '&page=' + p)); useEffect(() => { let live = true; void request<CrmPage<CustomerOrder>>('orders?page=' + data.page + '&query=' + encodeURIComponent(query)).then(r => { if (live)
    setData(r); }).catch(c.fail); return () => { live = false; }; }, [c.revision]); const open = async (id: string) => { setDetail(await request<NonNullable<typeof detail>>('orders/' + id)); setCreating(false); }; return <div className={'crm-grid ' + (creating || detail ? 'has-detail' : '')}><Card title="Pedidos de clientes" icon={<ShoppingBag />} action={c.overview.canOrders && <button className="pos-gold" disabled={c.busy} onClick={() => { setCreating(true); setDetail(null); }}><Plus size={17}/>Novo pedido</button>}><form className="pos-filters" onSubmit={e => { e.preventDefault(); c.task(() => load()); }}><label>Pedido ou cliente<input value={query} maxLength={100} onChange={e => setQuery(e.target.value)}/></label><button disabled={c.busy}>Consultar pedidos</button></form><div className="pos-table-wrap"><table><thead><tr><th>Pedido / cliente</th><th>Atendimento</th><th>Situação</th><th>Total</th><th>Detalhes</th></tr></thead><tbody>{data.items.map(x => <tr key={x.id}><td><strong>{x.number}</strong><small>{x.customer.name}</small></td><td>{x.mode === 'delivery' ? 'Entrega' : 'Retirada'}<small>{x.payment === 'credit' ? 'Crediário' : 'Recebimento manual'}</small></td><td><span className={'fin-status ' + (x.status === 'fulfilled' ? 'paid' : '')}>{ORDER_STATUSES[x.status]}</span></td><td>{money(x.total)}</td><td><button disabled={c.busy} onClick={() => c.task(() => open(x.id))}>Abrir pedido</button></td></tr>)}</tbody></table>{!data.total && <p className="pos-empty">Nenhum pedido encontrado.</p>}</div><Pager page={data.page} total={data.total} busy={c.busy} change={p => c.task(() => load(p))}/></Card>{creating ? <OrderForm c={c} close={() => setCreating(false)} saved={async (id) => { await load(data.page); await open(id); }}/> : detail && <OrderDetail key={detail.id + '/' + detail.version} c={c} d={detail} refresh={async () => { await open(detail.id); await load(data.page); }} close={() => setDetail(null)}/>}</div>; }
function OrderForm({ c, close, saved }: {
    c: Ctx;
    close: () => void;
    saved: (id: string) => Promise<void>;
}) { const [customer, setCustomer] = useState<Customer | null>(null), [items, setItems] = useState<{
    product: Product;
    quantity: string;
}[]>([]), [mode, setMode] = useState('pickup'), [payment, setPayment] = useState('paid'), [channel, setChannel] = useState('counter'), [address, setAddress] = useState(emptyAddress), [fee, setFee] = useState('0'), [due, setDue] = useState(c.overview.today), [installments, setInstallments] = useState('1'), [interval, setInterval] = useState('30'), [notes, setNotes] = useState(''); const total = Number(items.reduce((sum,x)=>sum+BigInt(previewOrderItem(x.quantity,x.product.price).replace('.','')),0n))/100 + (mode === 'delivery' ? Number(fee) : 0); return <Card title="Novo pedido" icon={<ShoppingBag />} action={<button onClick={close} aria-label="Fechar pedido"><X size={17}/></button>}><div className="pos-form"><CustomerPicker disabled={c.busy} onSelect={x => { setCustomer(x); setAddress(x.address); }}/>{customer && <div className="crm-selected"><Users size={20}/><strong>{customer.name}</strong><small>{customer.active ? 'Cliente ativo' : 'Cliente inativo'}</small></div>}<Picker<Product> path="products" label="Buscar produto para pedido" disabled={c.busy || items.length >= 50} render={x => <><strong>{x.name}</strong><small>{x.code} · {money(x.price)} / {x.baseUnit}</small></>} choose={p => setItems(old => old.some(x => x.product.id === p.id) ? old : old.concat({ product: p, quantity: '1' }))}/><form onSubmit={e => { e.preventDefault(); c.task(async () => { if (!customer)
    throw Error('Selecione um cliente.'); const r = await c.write('orders', { unitId: c.overview.unitId, customerId: customer.id, mode, payment, channel, address, deliveryFee: mode === 'delivery' ? fee : '0', dueDate: due, installments: Number(installments), intervalDays: Number(interval), notes, items: items.map(x => ({ productId: x.product.id, quantity: x.quantity, expectedPrice: x.product.price })) }); await saved(r.id); }); }}><fieldset disabled={c.busy}>{items.map(x => <div className="crm-order-line" key={x.product.id}><div><strong>{x.product.name}</strong><small>{money(x.product.price)} / {x.product.baseUnit}</small></div><label>Quantidade<input required aria-label={'Quantidade de ' + x.product.name} type="number" min="0.001" step="0.001" value={x.quantity} onChange={e => setItems(items.map(y => y === x ? { ...y, quantity: e.target.value } : y))}/></label><button type="button" aria-label={'Remover ' + x.product.name} onClick={() => setItems(items.filter(y => y !== x))}><X size={16}/></button></div>)}<div className="crm-fields"><label>Atendimento<select aria-label="Atendimento" value={mode} onChange={e => setMode(e.target.value)}><option value="pickup">Retirada na loja</option><option value="delivery">Entrega</option></select></label><label>Origem do pedido<select aria-label="Origem do pedido" value={channel} onChange={e => setChannel(e.target.value)}><option value="counter">Balcão</option><option value="seller">Vendedor</option><option value="mobile">Celular · registro manual</option></select></label><label>Recebimento<select aria-label="Recebimento" value={payment} onChange={e => setPayment(e.target.value)}><option value="paid">Recebimento manual na conclusão</option><option value="credit">Crediário aprovado</option></select></label></div>{mode === 'delivery' && <><h3>Endereço da entrega *</h3><AddressFields value={address} onChange={setAddress}/><label>Taxa de entrega (R$)<input required type="number" min="0" step="0.01" value={fee} onChange={e => setFee(e.target.value)}/></label></>}{payment === 'credit' && <div className="crm-fields"><label>Primeiro vencimento<input required type="date" min={c.overview.today} value={due} onChange={e => setDue(e.target.value)}/></label><label>Parcelas<input required type="number" min={1} max={36} step={1} value={installments} onChange={e => setInstallments(e.target.value)}/></label><label>Intervalo em dias<input required type="number" min={1} max={365} step={1} value={interval} onChange={e => setInterval(e.target.value)}/></label></div>}<label>Observações<textarea maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)}/></label><div className="fin-net"><span>Total do pedido</span><strong>{money(total)}</strong></div><p>O rascunho não reserva estoque. A reserva e a conclusão conferem saldo, preços e crédito novamente.</p><button className="pos-gold" disabled={!items.length || !customer?.active}><Check size={18}/>Criar rascunho do pedido</button></fieldset></form></div></Card>; }
function AccountPicker({ disabled, onSelect }: {
    disabled: boolean;
    onSelect: (id: string, name: string) => void;
}) { const [data, setData] = useState<CrmPage<{
    id: string;
    name: string;
    active: boolean;
}> | null>(null), [error, setError] = useState(''); const load = async (p = 0) => { try {
    setData(await financeRequest<NonNullable<typeof data>>('accounts?page=' + p));
    setError('');
}
catch (e) {
    setData(null);
    setError(e instanceof Error ? e.message : 'Contas indisponíveis.');
} }; return <div className="crm-picker"><button type="button" disabled={disabled} onClick={() => void load()}>Consultar contas financeiras</button>{error && <p role="alert">{error}</p>}{data && <><div className="crm-picker-results">{data.items.filter(x => x.active).map(x => <button key={x.id} type="button" disabled={disabled} onClick={() => onSelect(x.id, x.name)}>{x.name}<Plus size={16}/></button>)}</div><Pager page={data.page} total={data.total} busy={disabled} change={p => void load(p)}/></>}</div>; }
function OrderDetail({ c, d, refresh, close }: {
    c: Ctx;
    d: CustomerOrder & {
        titles: {
            id: string;
            number: string;
            amount: string;
            paid: string;
            dueDate: string;
            cancelled: boolean;
            installment: number;
            installments: number;
        }[];
    };
    refresh: () => Promise<void>;
    close: () => void;
}) { const [action, setAction] = useState(''), [reason, setReason] = useState(''), [account, setAccount] = useState(''), [accountName, setAccountName] = useState(''), [method, setMethod] = useState('cash'), [confirmed, setConfirmed] = useState(false); const actions: Record<string, {
    label: string;
    allowed: boolean;
}> = { reserve: { label: 'Reservar estoque', allowed: d.status === 'draft' && d.capabilities.stock }, ready: { label: 'Confirmar separação', allowed: d.status === 'reserved' }, fulfill: { label: d.mode === 'delivery' ? 'Concluir e liberar entrega' : 'Concluir retirada', allowed: d.status === 'ready' && d.capabilities.stock && d.capabilities.finance && (d.payment === 'credit' || d.capabilities.settle) }, cancel: { label: 'Cancelar pedido', allowed: ['draft', 'reserved', 'ready'].includes(d.status) && (d.status === 'draft' || d.capabilities.stock) }, return: { label: 'Devolução integral', allowed: d.status === 'fulfilled' && d.capabilities.stock && d.capabilities.finance } }; return <Card title={d.number} icon={<ShoppingBag />} action={<button aria-label="Fechar detalhes do pedido" onClick={close}><X size={17}/></button>}><div className="pos-form"><div className="crm-selected"><Users /><strong>{d.customer.name}</strong><span>{ORDER_STATUSES[d.status]}</span></div><div className="crm-steps">{['Rascunho', 'Reserva', 'Separação', 'Conclusão'].map((s, i) => <span key={s} className={['draft', 'reserved', 'ready', 'fulfilled'].indexOf(d.status) >= i ? 'done' : ''}><b>{i + 1}</b>{s}</span>)}</div><p>{d.mode === 'delivery' ? 'Entrega' : 'Retirada'} · {d.payment === 'credit' ? 'Crediário' : 'Recebimento manual'} · {when(d.createdAt)}<br />{d.customer.phone}</p>{d.mode === 'delivery' && <div className="crm-inset"><strong>Endereço de entrega</strong><p>{addressText(d.address)}</p></div>}{d.items.map(x => <div className="crm-history" key={x.id}><strong>{x.name}</strong><span>{x.quantity} {x.baseUnit} × {money(x.unitPrice)}</span><b>{money(x.total)}</b>{x.lots?.map((l, i) => <small key={i}>Lote {l.code} · validade {l.expiresOn} · {l.quantity} {x.baseUnit}</small>)}</div>)}<div className="fin-net"><span>Total · entrega {money(d.deliveryFee)}</span><strong>{money(d.total)}</strong></div>{d.payment === 'credit' && <p>{d.installments} parcela(s) · primeiro vencimento {d.dueDate} · intervalo de {d.intervalDays} dias.</p>}{d.notes && <p>{d.notes}</p>}{d.titles.length > 0 && <><h3>Contas a receber vinculadas</h3>{d.titles.map(t => <div className="crm-history" key={t.id}><strong>{t.number} · {t.installment}/{t.installments}</strong><span>Vence {t.dueDate} · {t.cancelled ? 'Cancelada' : 'Recebido ' + money(t.paid)}</span><b>{money(t.amount)}</b></div>)}<Link href="/financeiro">Abrir financeiro para consultar baixas e estornos</Link></>}<p className="crm-note">Recebimentos são registros manuais, sem cobrança bancária automática. Este pedido não emite documento fiscal automaticamente.</p>{d.capabilities.manage && <><div className="crm-actions">{Object.entries(actions).filter(([, a]) => a.allowed).map(([key, a]) => <button key={key} disabled={c.busy} className={key === 'fulfill' ? 'pos-gold' : ''} onClick={() => { setAction(key); setConfirmed(false); }}>{a.label}</button>)}</div>{action && <form className="crm-inset" onSubmit={e => { e.preventDefault(); c.task(async () => { await c.write('orders/transition', { id: d.id, version: d.version, action, reason, ...(action === 'fulfill' && d.payment === 'paid' ? { accountId: account, method } : {}) }); await refresh(); }); }}><h3>{actions[action]!.label}</h3><fieldset disabled={c.busy}>{action === 'fulfill' && d.payment === 'paid' && <><AccountPicker disabled={c.busy} onSelect={(id, name) => { setAccount(id); setAccountName(name); }}/><p>Conta selecionada: <strong>{accountName || 'Nenhuma'}</strong></p><label>Forma recebida<select aria-label="Forma recebida" value={method} onChange={e => setMethod(e.target.value)}>{Object.entries({ cash: 'Dinheiro', pix: 'Pix', debit: 'Débito', credit: 'Crédito', transfer: 'Transferência', other: 'Outro' }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></>}{action === 'return' && <p>Confirme a devolução integral. Recebimentos precisam ser estornados no financeiro e entregas em rota precisam ser resolvidas antes. Os pontos ganhos serão revertidos, mesmo se já usados.</p>}<label>Motivo / conferência *<input required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)}/></label><label className="crm-check"><input required type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>Conferi a operação e seus efeitos no estoque e financeiro.</label><button className="pos-gold" disabled={!confirmed || action === 'fulfill' && d.payment === 'paid' && !account}>Confirmar operação do pedido</button></fieldset></form>}</>}</div></Card>; }
function Deliveries({ c }: {
    c: Ctx;
}) { const [data, setData] = useState<CrmPage<CustomerDelivery>>({ items: [], total: 0, page: 0 }), [query, setQuery] = useState(''), [detail, setDetail] = useState<CustomerDelivery | null>(null); const load = async (p = 0) => setData(await request<CrmPage<CustomerDelivery>>('deliveries?query=' + encodeURIComponent(query) + '&page=' + p)); useEffect(() => { let live = true; void request<CrmPage<CustomerDelivery>>('deliveries?page=' + data.page + '&query=' + encodeURIComponent(query)).then(r => { if (live)
    setData(r); }).catch(c.fail); return () => { live = false; }; }, [c.revision]); const open = async (id: string) => setDetail(await request<CustomerDelivery>('deliveries/' + id)); return <div className={'crm-grid ' + (detail ? 'has-detail' : '')}><Card title="Controle de entregas" icon={<Truck />}><form className="pos-filters" onSubmit={e => { e.preventDefault(); c.task(() => load()); }}><label>Pedido, cliente ou entregador<input maxLength={100} value={query} onChange={e => setQuery(e.target.value)}/></label><button disabled={c.busy}>Consultar entregas</button></form><div className="pos-table-wrap"><table><thead><tr><th>Pedido / cliente</th><th>Entregador</th><th>Previsão</th><th>Situação</th><th>Detalhes</th></tr></thead><tbody>{data.items.map(x => <tr key={x.id}><td><strong>{x.number}</strong><small>{x.customer.name}</small></td><td>{x.courier || 'Não designado'}</td><td>{x.scheduledOn || 'Sem data'}</td><td><span className={'fin-status ' + (x.status === 'delivered' ? 'paid' : x.status === 'failed' ? 'overdue' : '')}>{DELIVERY_STATUSES[x.status]}</span></td><td><button disabled={c.busy} onClick={() => c.task(() => open(x.id))}>Abrir entrega</button></td></tr>)}</tbody></table>{!data.total && <p className="pos-empty">As entregas aparecem quando um pedido de entrega é concluído.</p>}</div><Pager page={data.page} total={data.total} busy={c.busy} change={p => c.task(() => load(p))}/></Card>{detail && <DeliveryDetail key={detail.id + '/' + detail.version} c={c} d={detail} close={() => setDetail(null)} refresh={async () => { await open(detail.id); await load(data.page); }}/>}</div>; }
function DeliveryDetail({ c, d, close, refresh }: {
    c: Ctx;
    d: CustomerDelivery;
    close: () => void;
    refresh: () => Promise<void>;
}) { const [action, setAction] = useState(''), [courier, setCourier] = useState(d.courier), [recipient, setRecipient] = useState(''), [scheduledOn, setScheduled] = useState(d.scheduledOn || c.overview.today), [reason, setReason] = useState(''); const options = d.status === 'pending' || d.status === 'failed' ? ['assigned'] : d.status === 'assigned' ? ['out'] : d.status === 'out' ? ['delivered', 'failed'] : []; return <Card title={'Entrega · ' + d.number} icon={<Truck />} action={<button aria-label="Fechar entrega" onClick={close}><X size={17}/></button>}><div className="pos-form"><span className="fin-status">{DELIVERY_STATUSES[d.status]}</span><h3>{d.customer.name}</h3><p>{d.customer.phone || 'Telefone não informado'}</p><div className="crm-inset"><strong>Destino</strong><p>{addressText(d.address)}</p></div><p>Entregador: {d.courier || 'Não designado'}<br />Previsão: {d.scheduledOn || 'Não definida'}{d.recipient && <><br />Recebido por: {d.recipient}</>}</p>{c.overview.canDeliver && d.orderStatus === 'fulfilled' && <><div className="crm-actions">{options.map(k => <button disabled={c.busy} className="pos-gold" key={k} onClick={() => setAction(k)}>{{ assigned: 'Designar entregador', out: 'Registrar saída para entrega', delivered: 'Confirmar recebimento', failed: 'Registrar tentativa sem entrega' }[k]}</button>)}</div>{action && <form className="crm-inset" onSubmit={e => { e.preventDefault(); c.task(async () => { await c.write('deliveries/transition', { id: d.id, version: d.version, action, courier, recipient, scheduledOn, reason }); await refresh(); }); }}><fieldset disabled={c.busy}>{action === 'assigned' && <><label>Nome do entregador *<input required minLength={2} maxLength={120} value={courier} onChange={e => setCourier(e.target.value)}/></label><label>Data prevista<input type="date" value={scheduledOn} onChange={e => setScheduled(e.target.value)}/></label></>}{action === 'delivered' && <label>Nome de quem recebeu *<input required minLength={2} maxLength={120} value={recipient} onChange={e => setRecipient(e.target.value)}/></label>}<label>Conferência ou motivo da tentativa *<input required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)}/></label><button className="pos-gold">Registrar atualização da entrega</button></fieldset></form>}</>}<h3>Histórico da entrega</h3>{d.history.map((x, i) => <div key={i} className="crm-history"><strong>{DELIVERY_STATUSES[x.status as keyof typeof DELIVERY_STATUSES] || x.status}</strong><span>{x.reason}</span><small>{when(x.at)} · {x.actor}</small></div>)}{!d.history.length && <p>Aguardando designação de entregador.</p>}<p className="crm-note">Acompanhamento manual. Sem rastreamento, envio de mensagens ou confirmação externa.</p></div></Card>; }
