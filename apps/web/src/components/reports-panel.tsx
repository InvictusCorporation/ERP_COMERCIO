"use client";
import { useState, useEffect, useRef, useCallback, useId, type ReactNode, type MutableRefObject } from 'react';
import Link from 'next/link';
import { BarChart3, TrendingUp, Wallet, Boxes, ShoppingCart, RefreshCw, Download, Filter, Search, AlertTriangle, Trophy, Package, ArrowUpRight, CalendarDays, ClipboardList } from 'lucide-react';
import { REPORT_KINDS, type ReportKind, type ReportFilters, type ReportPage, type ReportExport, type ReportRow, type ReportColumn, type ReportsOverview, type AuthSession, type ReportUnit } from '@invictus/contracts';
import { reportsRequest as request } from '../lib/reports-client';
const money = (v: string | number | null | undefined) => v === null || v === undefined ? 'Sem acesso' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), number = (v: string | number) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 }), day = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR'), stamp = (v: string) => new Date(v).toLocaleString('pt-BR');
const params = (f: ReportFilters, page?: number) => new URLSearchParams(Object.entries({ ...f, ...(page === undefined ? {} : { page: String(page) }) }).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
type Tab = 'overview' | 'sales' | 'finance' | 'stock' | 'operations';
type Draft = {
    from: string;
    to: string;
    unitId: string;
    companyId: string;
    category: string;
    source: 'manual' | 'sandbox';
};
const reportGroups: Record<Exclude<Tab, 'overview'>, ReportKind[]> = { sales: ['transactions', 'products', 'units', 'sellers'], finance: ['cashflow', 'receivables', 'payables', 'closings'], stock: ['stock'], operations: ['purchases', 'losses'] };
export function ReportsPanel({ session, initialTab = 'overview' }: {
    session: AuthSession;
    initialTab?: Tab;
}) {
    const initial: Draft = { from: '', to: '', unitId: session.activeUnitId || '', companyId: '', category: '', source: 'manual' }, [filtersOpen, setFiltersOpen] = useState(false), [draft, setDraft] = useState(initial), [applied, setApplied] = useState<ReportFilters>({ unitId: session.activeUnitId || undefined, source: 'manual' }), [tab, setTab] = useState<Tab>(initialTab), [data, setData] = useState<ReportsOverview | null>(null), [options, setOptions] = useState<ReportUnit[]>([]), [categories, setCategories] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [revision, setRevision] = useState(0), [exportBusy, setExportBusy] = useState(false), [notice, setNotice] = useState('');
    const allowed = session.permissions.includes('reports.read'), live = useRef(true), exporting = useRef(false), boot = useRef(false);
    const fail = useCallback((e: unknown) => { if (!live.current)
        return; setError(e instanceof Error ? e.message : 'Consulta indisponível.'); if ([401, 403].includes((e as {
        status?: number;
    }).status || 0)) {
        setData(null);
        setOptions([]);
    } }, []);
    useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
    useEffect(() => { let active = true; if (!allowed)
        return; setBusy(true); setError(''); setNotice(''); setData(null); void request<ReportsOverview>('overview?' + params(applied)).then(r => { if (!active || !live.current)
        return; setData(r); setTab(t => t === 'sales' && !r.capabilities.sales || t === 'finance' && !r.capabilities.finance || t === 'stock' && !r.capabilities.stock || t === 'operations' && !r.capabilities.stock && !r.capabilities.purchases ? 'overview' : t); setOptions(r.units); setCategories(r.categories); if (!boot.current) {
        boot.current = true;
        setDraft(v => ({ ...v, from: r.from, to: r.to }));
    } }).catch(e => { if (active)
        fail(e); }).finally(() => { if (active && live.current)
        setBusy(false); }); return () => { active = false; }; }, [allowed, applied, revision, fail]);
    if (!allowed)
        return <section className="panel pos-empty">Seu perfil não permite consultar relatórios gerenciais.</section>;
    const companies = [...new Map(options.map(u => [u.companyId, u.companyName])).entries()], units = options.filter(u => !draft.companyId || u.companyId === draft.companyId), effective = data ? { ...applied, from: data.from, to: data.to } : applied;
    const tabs = [['overview', 'Visão geral', BarChart3, true], ['sales', 'Vendas', ShoppingCart, data?.capabilities.sales], ['finance', 'Financeiro', Wallet, data?.capabilities.finance], ['stock', 'Estoque', Boxes, data?.capabilities.stock], ['operations', 'Compras e perdas', ClipboardList, data?.capabilities.purchases || data?.capabilities.stock]] as const;
    return <div className="pos-root fin-root reports-root"><header className="reports-intro"><div><span>INVICTUS · VISÃO GERENCIAL</span><h1>Os números da sua operação</h1><p>Resultados por período, posição atual e decisões com contexto.</p></div><BarChart3 size={52}/></header>
    <button type="button" className="reports-filter-toggle" aria-expanded={filtersOpen} disabled={busy || exportBusy} onClick={() => setFiltersOpen(v => !v)}><Filter size={18}/>Ajustar filtros</button><form className={"reports-filters panel " + (filtersOpen ? "is-open" : "")} onSubmit={e => { e.preventDefault(); setApplied({ ...draft, unitId: draft.unitId || undefined, companyId: draft.companyId || undefined }); setFiltersOpen(false); }}><div className="reports-filter-title"><Filter size={18}/><strong>Filtrar indicadores</strong><span>{data ? stamp(data.generatedAt) : 'Atualização sob consulta'}</span></div><fieldset disabled={busy || exportBusy}><label>Empresa<select aria-label="Empresa do relatório" value={draft.companyId} onChange={e => setDraft({ ...draft, companyId: e.target.value, unitId: '' })}><option value="">Todas as empresas autorizadas</option>{companies.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label><label>Filial<select aria-label="Filial do relatório" value={draft.unitId} onChange={e => setDraft({ ...draft, unitId: e.target.value })}><option value="">Consolidado autorizado</option>{units.map(u => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label><label>Data inicial<input aria-label="Data inicial do relatório" type="date" required value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })}/></label><label>Data final<input aria-label="Data final do relatório" type="date" required value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })}/></label><label>Categoria atual do produto<select aria-label="Categoria do relatório" disabled={tab === 'finance'} value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}><option value="">Todas as categorias</option>{categories.map(k => <option key={k}>{k}</option>)}</select></label><label>Origem das vendas<select aria-label="Origem das vendas" value={draft.source} onChange={e => setDraft({ ...draft, source: e.target.value as Draft['source'] })}><option value="manual">Pedidos manuais</option>{session.permissions.includes('pos.read') && <option value="sandbox">PDV · simulado</option>}</select></label><button className="pos-gold"><Filter size={17}/>Aplicar filtros</button><button type="button" aria-label="Atualizar indicadores" onClick={() => setRevision(v => v + 1)}><RefreshCw size={17}/></button></fieldset><p>Categoria aplica-se a vendas, estoque, compras e perdas. Financeiro utiliza empresa, filial e período. O filtro de fornecedor está na tabela de compras.</p></form>
    {error && <p className="pos-error" role="alert">{error}</p>}{notice && <p className="pos-notice" role="status">{notice}</p>}{busy && <p className="pos-empty" role="status">Atualizando indicadores…</p>}
        {data && <><div className="reports-context"><CalendarDays size={17}/><span>{day(data.from)} a {day(data.to)} · {data.selectedUnitIds.length} filial(is) autorizada(s)</span><b>{applied.source === 'sandbox' ? 'Vendas do PDV simuladas' : 'Vendas de pedidos manuais'}</b></div>{applied.source === 'sandbox' && <p className="reports-warning"><AlertTriangle size={18}/>Vendas e pagamentos do PDV são simulados. Os indicadores financeiros permanecem vinculados aos registros manuais.</p>}
        <nav className="pos-tabs fin-tabs reports-tabs" aria-label="Relatórios gerenciais">{tabs.filter(([, , , visible]) => visible).map(([key, label, Icon]) => <button key={key} aria-pressed={tab === key} disabled={busy || exportBusy} onClick={() => { setTab(key); setNotice(''); setError(''); }}><Icon size={18}/>{label}</button>)}</nav>
        {!data.units.length && <p className="reports-warning">Nenhuma filial ativa disponível neste acesso. {session.permissions.includes('organizations.manage') && <Link href="/empresas">Cadastrar empresa e filiais</Link>}</p>}
        {tab === 'overview' ? <Dashboard data={data} source={applied.source || 'manual'} open={(t) => setTab(t)}/> : <ReportTable key={tab + JSON.stringify(effective)} tab={tab} filters={effective} overview={data} session={session} fail={fail} exporting={exporting} setExportBusy={setExportBusy} setNotice={setNotice}/>}
        <details className="reports-method panel"><summary>Como ler estes indicadores</summary><div><p>Vendas seguem a data de conclusão e devoluções seguem a data da devolução. Rascunhos e cancelamentos anteriores à conclusão não entram no faturamento. Resultado bruto e margem consideram somente produtos e seu custo histórico; a taxa de entrega é separada.</p><p>Recebimentos e pagamentos são lançamentos do financeiro manual. Saldos de contas, pendências e estoque são atuais, mesmo quando o período selecionado é passado. Quantidades de produtos com unidades-base diferentes não são somadas.</p><p>Categoria, nomes de produtos, lojas e fornecedores correspondem ao cadastro atual. Estes relatórios não representam DRE contábil ou lucro líquido. “—” indica ausência de base para cálculo ou de autorização. Nenhum dado ilustrativo é incluído na operação.</p></div></details></>}
    </div>;
}
function Metric({ label, value, detail, icon, highlight = false }: {
    label: string;
    value: string;
    detail: ReactNode;
    icon: ReactNode;
    highlight?: boolean;
}) { return <article className={'reports-metric ' + (highlight ? 'highlight' : '')}><div>{icon}<span>{label}</span></div><strong>{value}</strong><small>{detail}</small></article>; }
function Dashboard({ data: d, source, open }: {
    data: ReportsOverview;
    source: string;
    open: (t: Tab) => void;
}) {
    const s = d.sales, f = d.finance, stock = d.stock;
    return <><section className="reports-metrics" aria-label="Indicadores principais"><Metric label="Vendas líquidas no período" value={money(s?.net)} icon={<ShoppingCart />} highlight detail={s ? (s.change === null ? 'Sem base positiva no período anterior' : (Number(s.change) > 0 ? '+' : '') + s.change + '% sobre período anterior') : 'Consulta de vendas não autorizada'}/><Metric label="Resultado bruto dos produtos" value={money(s?.profit)} icon={<TrendingUp />} detail={s?.margin ? `Margem de ${s.margin}% · exclui entrega` : 'Exige custo autorizado e base para margem'}/><Metric label="Recebimentos no período" value={money(f?.receipts)} icon={<Wallet />} detail="Financeiro manual · líquido de estornos"/><Metric label="Valor atual do estoque" value={money(stock?.value)} icon={<Boxes />} detail={stock ? number(stock.positions) + ' posições de produto/filial' : 'Consulta de estoque não autorizada'}/><Metric label="Contas a receber atuais" value={money(f?.receivable)} icon={<ClipboardList />} detail={f ? 'Vencido: ' + money(f.overdueReceivable) : 'Consulta financeira não autorizada'}/><Metric label="Posições em falta" value={stock ? number(stock.missing) : 'Sem acesso'} icon={<AlertTriangle />} detail={stock ? 'Saldo vendável zero · ' + stock.low + ' no mínimo ou abaixo' : 'Consulta de estoque não autorizada'}/></section>
    <div className="reports-dashboard-grid"><section className="panel"><div className="pos-heading"><h2><BarChart3 />Vendas por dia</h2><span>{source === 'sandbox' ? 'PDV simulado' : 'Pedidos manuais'}</span></div>{s ? <SalesChart key={d.from + d.to + source} rows={d.daily}/> : <p className="pos-empty">Seu perfil não permite consultar esta origem de vendas.</p>}</section><section className="panel reports-ranking"><div className="pos-heading"><h2><Trophy />Ranking de lojas</h2><span>Receita líquida</span></div><div>{d.ranking.map((r, i) => <article key={String(r.id)}><b>{i + 1}</b><div><span>{String(r.unit_name)}</span><strong>{money(String(r.revenue))}</strong><i style={{ width: Math.max(0, Math.min(100, Number(r.revenue) / Math.max(...d.ranking.map(x => Math.max(0, Number(x.revenue))), 1) * 100)) + '%' }}/></div></article>)}{!d.ranking.length && <p className="pos-empty">{s ? 'Nenhuma venda no período selecionado.' : 'Consulta de vendas não autorizada.'}</p>}<button disabled={!s} onClick={() => open('sales')}>Consultar relatórios de vendas<ArrowUpRight size={16}/></button></div></section></div>
    <section className="reports-secondary">{[['Vendas no último dia do período', s ? money(s.lastDay) : 'Sem acesso'], ['Ticket médio dos documentos concluídos', s?.ticket ? money(s.ticket) : 'Sem base'], ['Devoluções no período', s ? money(s.returns) + ' · ' + s.returned : 'Sem acesso'], ['Pagamentos no período', f ? money(f.payments) : 'Sem acesso'], ['Saldo atual de contas', f ? money(f.balance) : 'Sem acesso'], ['Contas a pagar atuais', f ? money(f.payable) : 'Sem acesso']].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="panel reports-alerts"><div className="pos-heading"><h2><AlertTriangle />Alertas gerenciais</h2><span>Condições registradas na operação</span></div><div>{d.alerts.map(a => <Link key={a.kind} href={a.href}><AlertTriangle size={20}/><span>{a.title}</span><b>{a.kind === 'overdue' ? 'Conferir' : a.count}</b><ArrowUpRight size={17}/></Link>)}{!d.alerts.length && <p>Sem alertas entre os indicadores autorizados. Consulte os módulos para detalhes.</p>}</div></section></>;
}
function SalesChart({ rows }: {
    rows: ReportsOverview['daily'];
}) { const id = useId().replace(/:/g, ''), [index, setIndex] = useState(Math.max(0, rows.length - 1)); const values = rows.map(r => Number(r.net)), min = Math.min(0, ...values), max = Math.max(1, ...values), y = (n: number) => 190 - (n - min) / (max - min) * 160, x = (i: number) => 55 + i * 825 / Math.max(1, rows.length - 1), points = values.map((v, i) => x(i) + ',' + y(v)).join(' '), selected = rows[index]; return <div className="reports-chart"><svg viewBox="0 0 930 240" role="img" aria-labelledby={id + 'title'}><title id={id + 'title'}>Vendas líquidas por dia, com devoluções em sua própria data</title><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffcc16" stopOpacity=".55"/><stop offset="100%" stopColor="#ffcc16" stopOpacity=".02"/></linearGradient></defs>{[0, 1, 2, 3, 4].map(n => { const v = min + (max - min) * n / 4; return <g key={n}><line x1="55" y1={y(v)} x2="880" y2={y(v)} stroke="#3b3c3f"/><text x="48" y={y(v) + 4} textAnchor="end" fill="#c4c7cf" fontSize="11">{Number(v).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}</text></g>; })}<polygon points={x(0) + ',' + y(0) + ' ' + points + ' ' + x(values.length - 1) + ',' + y(0)} fill={'url(#' + id + ')'}/><polyline points={points} fill="none" stroke="#ffcf21" strokeWidth="3"/>{values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === index ? 5 : 2} fill="#ffe36c"><title>{day(rows[i]!.day)}: {money(v)}</title></circle>)}{[0, Math.floor((rows.length - 1) / 2), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => <text key={i} x={x(i)} y="221" textAnchor="middle" fill="#d7d8dc" fontSize="11">{day(rows[i]!.day)}</text>)}</svg><label>Explorar dia do gráfico<input aria-label="Explorar dia do gráfico" type="range" min="0" max={Math.max(0, rows.length - 1)} value={index} onChange={e => setIndex(Number(e.target.value))}/></label><p>{selected ? day(selected.day) : 'Sem período'}<strong>{money(selected?.net)}</strong></p></div>; }
function cell(value: string | number | null | undefined, column: ReportColumn) { if (value === null || value === undefined || value === '')
    return '—'; if (column.type === 'money')
    return money(value); if (column.type === 'date')
    return day(String(value)); if (column.type === 'percent')
    return number(value) + '%'; if (column.type === 'quantity' || column.type === 'integer')
    return number(value); return String(value); }
function Pager({ page, total, busy, change }: {
    page: number;
    total: number;
    busy: boolean;
    change: (p: number) => void;
}) { return <div className="reports-pager"><span>{total} registro(s) · página {page + 1}</span><button disabled={busy || !page} onClick={() => change(page - 1)}>Anterior</button><button disabled={busy || (page + 1) * 20 >= total} onClick={() => change(page + 1)}>Próxima</button></div>; }
function ReportTable({ tab, filters, overview, session, fail, exporting, setExportBusy, setNotice }: {
    tab: Exclude<Tab, 'overview'>;
    filters: ReportFilters;
    overview: ReportsOverview;
    session: AuthSession;
    fail: (e: unknown) => void;
    exporting: MutableRefObject<boolean>;
    setExportBusy: (v: boolean) => void;
    setNotice: (s: string) => void;
}) {
    const available = reportGroups[tab].filter(k => k === 'purchases' ? overview.capabilities.purchases : k === 'losses' ? overview.capabilities.stock : true), [kind, setKind] = useState<ReportKind>(available[0] || 'transactions'), [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [supplier, setSupplier] = useState<{
        id: string;
        name: string;
    } | null>(null), [local, setLocal] = useState<{
        query: string;
        status: NonNullable<ReportFilters['status']>;
        supplierId: string | undefined;
    }>({ query: '', status: 'all', supplierId: undefined }), [page, setPage] = useState(0), [data, setData] = useState<ReportPage | null>(null), [busy, setBusy] = useState(false), [exportBusy, setExporting] = useState(false), [error, setError] = useState('');
    const live = useRef(true), lock = useRef(false);
    useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
    const effective: ReportFilters = { ...filters, ...local, source: filters.source || 'manual', ...(['cashflow', 'receivables', 'payables', 'closings'].includes(kind) ? { category: undefined } : {}), ...(kind !== 'purchases' ? { supplierId: undefined } : {}) };
    const signature = params(effective, page);
    useEffect(() => { let active = true; if (!available.length)
        return; setBusy(true); setError(''); setData(null); void request<ReportPage>('data/' + kind + '?' + signature).then(r => { if (active && live.current)
        setData(r); }).catch(e => { if (active && live.current) {
        setError(e instanceof Error ? e.message : 'Relatório indisponível.');
        if ([401, 403].includes((e as {
            status?: number;
        }).status || 0))
            fail(e);
    } }).finally(() => { if (active && live.current)
        setBusy(false); }); return () => { active = false; }; }, [kind, signature]);
    const download = async () => { if (lock.current || !data)
        return; lock.current = true; exporting.current = true; setExportBusy(true); setExporting(true); setError(''); setNotice(''); try {
        const file = await request<ReportExport>('export', { ...effective, kind }, session.csrf);
        if (!live.current)
            return;
        const object = URL.createObjectURL(new Blob([file.csv], { type: 'text/csv;charset=utf-8' })), anchor = document.createElement('a');
        anchor.href = object;
        anchor.download = file.filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(object), 1000);
        setNotice('CSV gerado: ' + file.rows + ' registro(s), todas as páginas da seleção.');
    }
    catch (e) {
        if (live.current) {
            setError(e instanceof Error ? e.message : 'Não foi possível exportar.');
            if ([401, 403].includes((e as {
                status?: number;
            }).status || 0))
                fail(e);
        }
    }
    finally {
        lock.current = false;
        exporting.current = false;
        setExportBusy(false);
        if (live.current)
            setExporting(false);
    } };
    if (!available.length)
        return <p className="pos-empty">Nenhum relatório autorizado nesta seção.</p>;
    return <section className="panel reports-table-panel"><div className="pos-heading"><h2><ClipboardList />{REPORT_KINDS[kind]}</h2>{overview.canExport && <button className="pos-gold" disabled={busy || exportBusy || !data} onClick={() => void download()}><Download size={17}/>{exportBusy ? 'Gerando CSV…' : 'Exportar CSV'}</button>}</div><form className="reports-local-filters" onSubmit={e => { e.preventDefault(); setPage(0); setLocal({ query, status: status as NonNullable<ReportFilters['status']>, supplierId: supplier?.id }); }}><fieldset disabled={busy || exportBusy}><label>Relatório<select aria-label="Tipo de relatório" value={kind} onChange={e => { setKind(e.target.value as ReportKind); setPage(0); setQuery(''); setStatus('all'); setSupplier(null); setLocal({ query: '', status: 'all', supplierId: undefined }); }}>{available.map(k => <option value={k} key={k}>{REPORT_KINDS[k]}</option>)}</select></label><label>Buscar no relatório<input aria-label="Buscar no relatório" maxLength={100} value={query} onChange={e => setQuery(e.target.value)}/></label>{(kind === 'stock' || kind === 'receivables' || kind === 'payables') && <label>Situação<select aria-label="Situação do relatório" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todas</option>{kind === 'stock' ? <><option value="missing">Em falta</option><option value="low">No mínimo ou abaixo</option><option value="near_expiry">Próximo do vencimento</option><option value="expired">Há lote vencido</option><option value="no_movement">Sem movimento físico no período</option></> : <option value="overdue">Vencidas atualmente</option>}</select></label>}<button><Search size={17}/>Consultar relatório</button></fieldset>{kind === 'purchases' && <div className="reports-supplier"><SupplierPicker busy={busy || exportBusy} onSelect={setSupplier}/>{supplier && <p>Fornecedor selecionado: <strong>{supplier.name}</strong><button type="button" disabled={busy || exportBusy} onClick={() => setSupplier(null)}>Remover filtro</button></p>}<small>Após selecionar ou remover, use Consultar relatório.</small></div>}</form>
    {error && <p className="pos-error" role="alert">{error}</p>}{busy && <p className="pos-empty" role="status">Consultando registros autorizados…</p>}{data && <><div className="reports-table-caption"><span>{data.total} registro(s) · atualização {stamp(data.generatedAt)}</span><small>CSV inclui todas as páginas da seleção, até 5.000 registros, 100 filiais e 8 MB. Excesso exige refinar os filtros.</small></div><div className="pos-table-wrap"><table><caption className="reports-sr-only">{data.title}</caption><thead><tr>{data.columns.map(col => <th key={col.key} scope="col">{col.label}</th>)}</tr></thead><tbody>{data.items.map((r, i) => <tr key={String(r.id || '') + '/' + String(r.day || '') + '/' + i}>{data.columns.map(col => <td key={col.key} className={['money', 'quantity', 'integer', 'percent'].includes(col.type) ? 'numeric' : ''}>{col.key === 'abc' ? <b className={'reports-abc ' + String(r[col.key])}>{cell(r[col.key], col)}</b> : cell(r[col.key], col)}</td>)}</tr>)}</tbody></table>{!data.total && <p className="pos-empty">Nenhum registro encontrado na seleção autorizada.</p>}</div><Pager page={data.page} total={data.total} busy={busy || exportBusy} change={setPage}/><details className="reports-notes"><summary>Critérios deste relatório</summary>{data.notes.map((n, i) => <p key={i}>{n}</p>)}</details></>}
    </section>;
}
function SupplierPicker({ busy, onSelect }: {
    busy: boolean;
    onSelect: (s: {
        id: string;
        name: string;
    }) => void;
}) { const [query, setQuery] = useState(''), [data, setData] = useState<{
    items: {
        id: string;
        name: string;
    }[];
    total: number;
    page: number;
} | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false); const search = async (page = 0) => { setLoading(true); setError(''); try {
    setData(await request<NonNullable<typeof data>>('suppliers?query=' + encodeURIComponent(query) + '&page=' + page));
}
catch (e) {
    setData(null);
    setError(e instanceof Error ? e.message : 'Fornecedores indisponíveis.');
}
finally {
    setLoading(false);
} }; return <div><div className="reports-supplier-search"><label>Fornecedor da compra<input aria-label="Fornecedor da compra" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') {
    e.preventDefault();
    void search();
} }}/></label><button type="button" disabled={busy || loading} onClick={() => void search()}>Buscar fornecedor</button></div>{error && <p role="alert">{error}</p>}{data && <><div className="reports-supplier-options">{data.items.map(s => <button key={s.id} type="button" disabled={busy} onClick={() => onSelect(s)}>{s.name}</button>)}</div><Pager page={data.page} total={data.total} busy={busy || loading} change={p => void search(p)}/></>}</div>; }
