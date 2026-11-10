"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Boxes, CalendarClock, Package, TriangleAlert, Search, RefreshCw, Plus, X, ClipboardList, ArrowDownToLine, ShieldCheck } from 'lucide-react';
import { LOT_LOSS_KINDS, type AuthSession, type LotOverview, type LotPage, type LotRow, type LotProduct, type LotDetail, type LotLossReport, type LotCommand } from '@invictus/contracts';
import { lotsRequest } from '../lib/lots-client';
const money = (s: string) => Number(s).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), qty = (s: string) => Number(s).toLocaleString('pt-BR', { maximumFractionDigits: 3 }), day = (s: string) => s ? new Date(s + 'T12:00:00Z').toLocaleDateString('pt-BR') : '—', when = (s: string) => new Date(s).toLocaleString('pt-BR');
const statusNames = { expired: 'Vencido', near: 'Próximo do vencimento', valid: 'Em dia', blocked: 'Bloqueado', empty: 'Esgotado' };
const eventNames: Record<string, string> = { allocate: 'Classificação de saldo', withdraw: 'Retirada de classificação', block: 'Bloqueio', unblock: 'Desbloqueio', settings: 'Configuração de alerta', sale: 'Saída de venda', sale_return: 'Devolução de venda', loss: 'Perda / descarte', reversal: 'Estorno de descarte', command: 'Confirmação da operação' };
const blank = { quantity: '', code: '', manufacturedOn: '', expiresOn: '', reason: '', lossKind: '' as LotCommand['lossKind'], movementId: '', alertDays: 30 };
function Pager({ page, total, busy, go }: {
    page: number;
    total: number;
    busy: boolean;
    go: (p: number) => void;
}) { return <div className="lot-pager"><span>{total} registros · página {page + 1}</span><button disabled={busy || page === 0} onClick={() => go(page - 1)}>Anterior</button><button disabled={busy || (page + 1) * 20 >= total} onClick={() => go(page + 1)}>Próxima</button></div>; }
export function LotsPanel({ session }: {
    session: AuthSession;
}) {
    const [tab, setTab] = useState('batches'), [overview, setOverview] = useState<LotOverview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [lots, setLots] = useState<LotPage<LotRow>>({ items: [], page: 0, total: 0 }), [products, setProducts] = useState<LotPage<LotProduct>>({ items: [], page: 0, total: 0 }), [report, setReport] = useState<LotLossReport | null>(null), [from, setFrom] = useState(''), [to, setTo] = useState('');
    const [detail, setDetail] = useState<LotDetail | null>(null), [product, setProduct] = useState<LotProduct | null>(null), [editor, setEditor] = useState<'allocate' | 'settings' | null>(null), [action, setAction] = useState<LotCommand['action']>('loss'), [form, setForm] = useState({ ...blank }), [consent, setConsent] = useState(false);
    const live = useRef(true), lock = useRef(false), keys = useRef(new Map<string, string>()), initialized = useRef(false);
    const allowed = session.permissions.includes('stock.read') && session.permissions.includes('products.read');
    useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
    const fail = (e: unknown) => {
        if (!live.current)
            return;
        setError(e instanceof Error ? e.message : 'Não foi possível concluir.');
        if ([401, 403].includes((e as {
            status?: number;
        }).status || 0)) {
            setOverview(null);
            setDetail(null);
            setProduct(null);
            setReport(null);
            setLots({ items: [], page: 0, total: 0 });
            setProducts({ items: [], page: 0, total: 0 });
        }
    };
    const execute = async (fn: () => Promise<void>) => {
        if (lock.current)
            return;
        lock.current = true;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await fn();
        }
        catch (e) {
            fail(e);
        }
        finally {
            lock.current = false;
            if (live.current)
                setBusy(false);
        }
    };
    const refresh = useCallback(async () => {
        const o = await lotsRequest<LotOverview>('overview');
        if (live.current)
            setOverview(o);
        return o;
    }, []);
    useEffect(() => {
        if (allowed)
            void refresh().catch(fail);
    }, [allowed, refresh]);
    useEffect(() => {
        if (!overview || initialized.current)
            return;
        initialized.current = true;
        setFrom(overview.today.slice(0, 7) + '-01');
        setTo(overview.today);
    }, [overview]);
    const load = async (next = tab, page = 0) => {
        if (next === 'losses') {
            const r = await lotsRequest<LotLossReport>('losses?from=' + from + '&to=' + to + '&query=' + encodeURIComponent(query) + '&page=' + page);
            if (live.current)
                setReport(r);
        }
        else if (next === 'batches') {
            const r = await lotsRequest<LotPage<LotRow>>('batches?query=' + encodeURIComponent(query) + '&status=' + status + '&page=' + page);
            if (live.current)
                setLots(r);
        }
        else {
            const r = await lotsRequest<LotPage<LotProduct>>('products?query=' + encodeURIComponent(query) + '&page=' + page + '&low=' + (next === 'replenish'));
            if (live.current)
                setProducts(r);
        }
    };
    useEffect(() => {
        if (!overview?.unitId)
            return;
        void execute(() => load()); /* navigate after initial context */ // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, overview?.unitId]);
    const navigate = (t: string) => {
        if (busy)
            return;
        setTab(t);
        setDetail(null);
        setProduct(null);
        setEditor(null);
        setError('');
        setNotice('');
        setQuery('');
    };
    const open = async (id: string, page = 0) => {
        const d = await lotsRequest<LotDetail>('batches/' + id + '?page=' + page);
        if (live.current) {
            setDetail(d);
            setProduct(null);
            setEditor(null);
            setForm({ ...blank });
            setAction('loss');
        }
    };
    const begin = (p: LotProduct, mode: 'allocate' | 'settings') => { keys.current.clear(); setProduct(p); setEditor(mode); setDetail(null); setForm({ ...blank, alertDays: p.alertDays }); setConsent(p.tracking); };
    const write = async (input: Omit<LotCommand, 'requestKey'>) => {
        const signature = JSON.stringify(input);
        let key = keys.current.get(signature);
        if (!key) {
            key = crypto.randomUUID();
            keys.current.set(signature, key);
        }
        return lotsRequest<{
            id: string | null;
        }>('commands', { ...input, requestKey: key }, session.csrf);
    };
    const submit = () => execute(async () => {
        if (!overview?.unitId)
            return;
        const b = detail?.lot;
        const input = { ...form, unitId: overview.unitId, productId: b?.productId || product!.id, action: b ? action : editor!, ...(b ? { lotId: b.id, version: b.version } : editor === 'settings' && product?.controlVersion ? { version: product.controlVersion } : {}) };
        const result = await write(input);
        await refresh();
        await load();
        if (result.id && editor !== 'settings') {
            await open(result.id);
        }
        else {
            setProduct(null);
            setEditor(null);
        }
        setNotice(input.action === 'allocate' ? 'Lote classificado no saldo existente. Nenhuma nova entrada de estoque foi criada.' : input.action === 'loss' ? 'Descarte registrado uma vez no lote e no estoque.' : input.action === 'reverse' ? 'Descarte estornado. Histórico preservado.' : 'Controle de lote atualizado.');
    });
    const resetAction = (a: LotCommand['action']) => { keys.current.clear(); setAction(a); setForm({ ...blank }); };
    const openLoss = async (lotId: string, id: string) => { await open(lotId); setAction('reverse'); setForm({ ...blank, movementId: id }); setTab('batches'); await load('batches'); };
    if (!allowed)
        return <div className="panel pos-empty">Seu perfil não permite consultar lotes e perdas.</div>;
    return <div className="pos-root fin-root lot-root"><div className="fin-banner"><ShieldCheck /><span><strong>Rastreabilidade por filial</strong> · Lotes organizam o estoque físico; o custo médio permanece no controle de estoque. O PDV de teste usa primeiro os lotes válidos com vencimento mais próximo.</span></div>
 <nav className="pos-tabs fin-tabs" aria-label="Lotes e validade">{[['batches', 'Lotes e validade', Boxes], ['classify', 'Classificar estoque', Package], ['losses', 'Relatório de perdas', ClipboardList], ['replenish', 'Reposição sugerida', ArrowDownToLine]].map(([k, label, Icon]) => { const I = Icon as typeof Boxes; return <button key={String(k)} aria-pressed={tab === k} disabled={busy || !overview?.unitId || !initialized.current} onClick={() => navigate(String(k))}><I size={17}/>{String(label)}</button>; })}<button aria-label="Atualizar lotes" disabled={busy} onClick={() => void execute(async () => {
            await refresh();
            await load();
            if (detail)
                await open(detail.lot.id, detail.page);
        })}><RefreshCw size={18}/></button></nav>
 {error && <p role="alert" className="pos-error">{error} Se a conexão caiu, confira o histórico antes de iniciar outra operação.</p>}{notice && <p role="status" className="pos-notice">{notice}</p>}
 {!overview?.unitId ? <div className="panel pos-empty">{overview ? 'Selecione uma filial no topo para consultar lotes.' : 'Carregando lotes…'}</div> : <>
 <div className="pos-stats fin-stats"><div><Boxes /><span>Lotes com saldo<strong>{overview.summary.lots}</strong></span></div><div><TriangleAlert /><span>Lotes vencidos<strong>{overview.summary.expired}</strong></span></div><div><CalendarClock /><span>Próximos do vencimento<strong>{overview.summary.near}</strong></span></div><div><Package /><span>Produtos a classificar<strong>{overview.summary.unclassifiedProducts}</strong></span></div></div>
 <p className="lot-context">Data de referência: {day(overview.today)} · America/Fortaleza · {overview.summary.blocked} lotes bloqueados. Vencidos e próximos incluem lotes bloqueados; consulte a data no detalhe.</p>
 <form className="pos-filters lot-filters" onSubmit={e => { e.preventDefault(); void execute(() => load()); }}><label>{tab === 'batches' ? 'Buscar lote, produto ou código' : tab === 'losses' ? 'Buscar produto, lote ou motivo' : 'Buscar produto ou código'}<input maxLength={100} value={query} onChange={e => setQuery(e.target.value)}/></label>{tab === 'batches' && <label>Situação do lote<select aria-label="Situação do lote" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todas</option>{Object.entries(statusNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}{tab === 'losses' && <><label>Período inicial<input type="date" required value={from} onChange={e => setFrom(e.target.value)}/></label><label>Período final<input type="date" required value={to} onChange={e => setTo(e.target.value)}/></label></>}<button className="pos-gold" disabled={busy}><Search size={16}/>Filtrar</button></form>
 <div className={'fin-grid ' + ((detail || product) ? 'has-editor' : '')}>
 {tab === 'batches' && <section className="panel"><div className="pos-heading"><h2><Boxes />Lotes da filial</h2><button disabled={busy} onClick={() => navigate('classify')}><Plus size={17}/>Classificar saldo</button></div><div className="pos-table-wrap"><table><thead><tr><th>Lote / produto</th><th>Vencimento</th><th>Saldo do lote</th><th>Situação</th><th></th></tr></thead><tbody>{lots.items.map(b => <tr key={b.id}><td><strong>{b.code}</strong><span>{b.productName}</span><small>{b.productCode}</small></td><td>{day(b.expiresOn)}</td><td>{qty(b.quantity)} {b.baseUnit}</td><td><span className={'fin-status ' + (b.status === 'expired' || b.blocked ? 'overdue' : b.status === 'near' ? 'partial' : 'open')}>{statusNames[b.status]}</span>{b.blocked && b.expiresOn < overview.today && <small>Também vencido</small>}</td><td><button aria-label={'Abrir lote ' + b.code + ' · ' + day(b.expiresOn)} disabled={busy} onClick={() => void execute(() => open(b.id))}>Detalhes</button></td></tr>)}</tbody></table>{!lots.items.length && <p className="pos-empty">Nenhum lote nesta consulta. Identifique o saldo existente em Classificar estoque.</p>}</div><Pager {...lots} busy={busy} go={p => void execute(() => load('batches', p))}/></section>}
 {(tab === 'classify' || tab === 'replenish') && <section className="panel"><div className="pos-heading"><h2>{tab === 'classify' ? <Package /> : <ArrowDownToLine />}{tab === 'classify' ? 'Estoque e classificação' : 'Reposição por saldo vendável'}</h2></div><p className="lot-caption">{tab === 'classify' ? 'Compras e entradas aumentam o saldo físico. Classificar distribui esse saldo entre lotes, sem outra entrada ou alteração de custo.' : 'Sugestão = estoque ideal menos saldo vendável após reservas. Em produtos controlados, exclui vencidos, bloqueados e não classificados. Não gera compra ou promoção automaticamente.'}</p><div className="pos-table-wrap"><table><thead><tr><th>Produto</th>{tab === 'classify' ? <><th>Físico / reservado</th><th>Não classificado</th><th>Controle</th></> : <><th>Vendável</th><th>Mínimo / ideal</th><th>Sugestão</th></>}<th></th></tr></thead><tbody>{products.items.map(p => <tr key={p.id}><td><strong>{p.name}</strong><small>{p.code} · {p.baseUnit}</small></td>{tab === 'classify' ? <><td>{qty(p.physical)} / {qty(p.reserved)}</td><td><strong>{qty(p.unallocated)} {p.baseUnit}</strong></td><td>{p.tracking ? 'Ativo · ' + p.alertDays + ' dias' : 'Sem controle por lote'}</td></> : <><td>{qty(p.sellable)} {p.baseUnit}</td><td>{qty(p.minimum)} / {qty(p.ideal)}</td><td><strong>{qty(p.suggestion)} {p.baseUnit}</strong></td></>}<td><div className="lot-row-actions">{overview.canManage && <><button aria-label={'Classificar ' + p.code} disabled={busy || Number(p.unallocated) <= 0} onClick={() => begin(p, 'allocate')}>Classificar</button><button aria-label={'Configurar lotes de ' + p.code} disabled={busy} onClick={() => begin(p, 'settings')}>Alertas</button></>}</div></td></tr>)}</tbody></table>{!products.items.length && <p className="pos-empty">{tab === 'classify' ? 'Nenhum produto ativo nesta consulta.' : 'Nenhum produto no mínimo ou abaixo dele nesta consulta.'}</p>}</div><Pager {...products} busy={busy} go={p => void execute(() => load(tab, p))}/>{tab === 'replenish' && session.permissions.includes('purchases.read') && <div className="lot-caption"><Link href="/compras">Conferir e criar pedido de compra</Link></div>}</section>}
 {tab === 'losses' && <section className="panel"><div className="pos-heading"><h2><ClipboardList />Perdas e descartes</h2></div><p className="lot-caption">Valores pelo custo histórico do movimento, inclusive perdas manuais sem lote. Estornos preservam o descarte original e são descontados do valor líquido do período de origem.</p>{report && <div className="lot-report-totals"><span>Descartes<strong>{report.summary.count}</strong></span><span>Custo bruto<strong>{money(report.summary.gross)}</strong></span><span>Estornado<strong>{money(report.summary.reversed)}</strong></span><span>Custo líquido<strong>{money(report.summary.net)}</strong></span></div>}<div className="pos-table-wrap"><table><thead><tr><th>Produto / lote</th><th>Data / responsável</th><th>Quantidade</th><th>Custo histórico</th><th>Motivo</th><th></th></tr></thead><tbody>{report?.items.map(r => <tr key={r.id}><td><strong>{r.productName}</strong><small>{r.lotCode || 'Sem lote'}</small></td><td>{when(r.createdAt)}<small>{r.actorName}</small></td><td>{qty(r.quantity)} {r.baseUnit}</td><td>{money(r.costValue)}<small>{r.reversed ? 'Estornado' : 'Registrado'}</small></td><td>{r.lossKind ? LOT_LOSS_KINDS[r.lossKind] : 'Perda manual'}<small>{r.reason}</small></td><td>{r.lotId && overview.canManage && !r.reversed && <button disabled={busy} aria-label={'Revisar descarte ' + r.id} onClick={() => void execute(() => openLoss(r.lotId!, r.id))}>Revisar / estornar</button>}</td></tr>)}</tbody></table>{!report?.items.length && <p className="pos-empty">Nenhuma perda neste período e filtro.</p>}</div>{report && <Pager {...report} busy={busy} go={p => void execute(() => load('losses', p))}/>}</section>}
 {product && editor && <section className="panel fin-editor"><div className="pos-heading"><h2><Package />{editor === 'settings' ? 'Alertas e controle' : 'Classificar saldo'}</h2><button aria-label="Fechar classificação" onClick={() => { setProduct(null); setEditor(null); }}><X size={18}/></button></div><form className="pos-form" onSubmit={e => { e.preventDefault(); submit(); }}><strong>{product.name}</strong><div className="lot-values"><span>Físico<strong>{qty(product.physical)} {product.baseUnit}</strong></span><span>Não classificado<strong>{qty(product.unallocated)} {product.baseUnit}</strong></span></div><fieldset disabled={busy || !overview.canManage}>{editor === 'allocate' ? <><label>Código do lote<input required maxLength={60} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}/></label><div className="fiscal-fields"><label>Data de fabricação (opcional)<input type="date" max={overview.today} value={form.manufacturedOn} onChange={e => setForm(f => ({ ...f, manufacturedOn: e.target.value }))}/></label><label>Data de vencimento<input type="date" required min={form.manufacturedOn || undefined} value={form.expiresOn} onChange={e => setForm(f => ({ ...f, expiresOn: e.target.value }))}/></label></div><label>Quantidade a classificar ({product.baseUnit})<input type="number" min="0.001" max={product.unallocated} step="0.001" required value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}/></label><p className="lot-caption">Datas e código não são alterados depois do cadastro. Correção exige retirar a classificação com motivo e cadastrar o lote correto.</p></> : <label>Alertar antes do vencimento (dias)<input type="number" min="1" max="365" required value={form.alertDays} onChange={e => setForm(f => ({ ...f, alertDays: Number(e.target.value) }))}/></label>}{!product.tracking && <label className="fin-checkbox"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)}/>Ativar controle permanente de lotes para este produto nesta filial. Vendas passarão a exigir saldo classificado e válido.</label>}<label>Motivo da classificação ou configuração<input required minLength={3} maxLength={300} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}/></label><button className="pos-gold" disabled={busy || !overview.canManage || !consent}>{editor === 'allocate' ? 'Confirmar classificação' : 'Salvar alertas'}</button></fieldset></form></section>}
 {detail && <section className="panel fin-editor"><div className="pos-heading"><h2><Boxes />Lote {detail.lot.code}</h2><button aria-label="Fechar lote" onClick={() => setDetail(null)}><X size={18}/></button></div><div className="pos-form"><strong>{detail.lot.productName}</strong><span className={'fin-status ' + (detail.lot.blocked || detail.lot.status === 'expired' ? 'overdue' : 'open')}>{statusNames[detail.lot.status]}</span><div className="lot-values"><span>Saldo do lote<strong>{qty(detail.lot.quantity)} {detail.lot.baseUnit}</strong></span><span>Vencimento<strong>{day(detail.lot.expiresOn)}</strong></span></div><p>Fabricação: {day(detail.lot.manufacturedOn)} · Alerta: {detail.lot.alertDays} dias</p><p className="lot-caption">Vencido quando a data é anterior ao dia de referência. Desbloquear não libera lote vencido para o PDV. Conferir a separação física dos lotes na ordem indicada.</p>
 {overview.canManage && <form className="pos-form lot-operation" onSubmit={e => { e.preventDefault(); submit(); }}><label>Operação no lote<select aria-label="Operação no lote" value={action} onChange={e => resetAction(e.target.value as LotCommand['action'])}><option value="loss">Registrar perda / descarte</option><option value="allocate">Adicionar classificação de saldo</option><option value="withdraw">Retirar classificação (mantém estoque)</option><option value={detail.lot.blocked ? 'unblock' : 'block'}>{detail.lot.blocked ? 'Desbloquear lote' : 'Bloquear lote'}</option>{action === 'reverse' && <option value="reverse">Estornar descarte selecionado</option>}</select></label>{['allocate', 'withdraw', 'loss'].includes(action) && <label>Quantidade da operação ({detail.lot.baseUnit})<input type="number" min="0.001" step="0.001" required value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}/></label>}{action === 'loss' && <label>Tipo de perda<select aria-label="Tipo de perda" required value={form.lossKind} onChange={e => setForm(f => ({ ...f, lossKind: e.target.value as LotCommand['lossKind'] }))}><option value="">Selecione</option>{Object.entries(LOT_LOSS_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}{action === 'reverse' && <p className="lot-caption">Somente o último movimento de estoque do produto nesta filial pode ser estornado. O descarte original será preservado.</p>}{action === 'withdraw' && <p className="lot-caption">Retira apenas a identificação de lote. O saldo físico e o custo não mudam; essa parcela deixa de ser vendável até nova classificação.</p>}<label>Motivo da operação<input required minLength={3} maxLength={300} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}/></label><button className={action === 'loss' ? 'fin-danger' : 'pos-gold'} disabled={busy}>{action === 'loss' ? 'Confirmar descarte' : action === 'reverse' ? 'Confirmar estorno de descarte' : 'Confirmar operação no lote'}</button></form>}
 <h3>Histórico do lote</h3>{detail.events.map(e => <article className="fin-payment" key={e.id}><div><strong>{eventNames[e.kind] || e.kind}{Number(e.quantityDelta) !== 0 ? ' · ' + qty(e.quantityDelta) + ' ' + detail.lot.baseUnit : ''}</strong><small>{when(e.createdAt)} · {e.actorName}</small><p>{e.lossKind ? LOT_LOSS_KINDS[e.lossKind] + ' · ' : ''}{e.reason}</p>{e.kind === 'loss' && overview.canManage && <button disabled={busy} onClick={() => { setAction('reverse'); setForm({ ...blank, movementId: e.movementId! }); }}>Selecionar descarte para estorno</button>}</div></article>)}<Pager page={detail.page} total={detail.total} busy={busy} go={p => void execute(() => open(detail.lot.id, p))}/>
 </div></section>}
 </div></>}
 </div>;
}
