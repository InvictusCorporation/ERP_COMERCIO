"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Store, Scale, Barcode, ChefHat, Layers, Package, RefreshCw, Plus, X, Printer, Search } from 'lucide-react';
import { ean13Pattern, quantityMilli, quantityText, weighedTotal, type AuthSession, type MarketOverview, type MarketSector, type MarketScale, type MarketProduct, type MarketRecipe, type MarketWeighing, type MarketRun, type MarketPage } from '@invictus/contracts';
import { supermarketRequest as request } from '../lib/supermarket-client';
const money = (v: string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), qty = (v: string) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 }), day = (v: string | null) => v ? new Date(v + 'T12:00:00Z').toLocaleDateString('pt-BR') : '—';
type Props = {
    unitLabel:string;
    overview: MarketOverview;
    sectors: MarketSector[];
    scales: MarketScale[];
    revision: number;
    busy: boolean;
    task: (fn: () => Promise<void>) => void;
    write: (route: string, input: Record<string, unknown>) => Promise<{
        id: string;
    }>;
    fail: (e: unknown) => void;
};
const tabs = [['sectors', 'Setores', Store], ['products', 'Produtos por peso', Package], ['scales', 'Balanças', Scale], ['weighings', 'Pesagem e etiquetas', Barcode], ['recipes', 'Fichas técnicas', ChefHat], ['runs', 'Produção', Layers]] as const;
export function SupermarketPanel({ session }: {
    session: AuthSession;
}) {
    const [tab, setTab] = useState('sectors'), [overview, setOverview] = useState<MarketOverview | null>(null), [sectors, setSectors] = useState<MarketSector[]>([]), [scales, setScales] = useState<MarketScale[]>([]), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const lock = useRef(false), mounted = useRef(true), keys = useRef(new Map<string, string>());
    const allowed = session.permissions.includes('products.read') && session.permissions.includes('stock.read');
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const fail = useCallback((e: unknown) => { if (!mounted.current)
        return; setError(e instanceof Error ? e.message : 'Não foi possível concluir.'); if ([401, 403].includes((e as {
        status?: number;
    }).status || 0)) {
        setOverview(null);
        setSectors([]);
        setScales([]);
    } }, []);
    const refresh = useCallback(async () => { const o = await request<MarketOverview>('overview'); if (!mounted.current)
        return; setOverview(o); if (o.unitId) {
        const [s, b] = await Promise.all([request<{
                items: MarketSector[];
            }>('sectors'), request<{
                items: MarketScale[];
            }>('scales')]);
        if (mounted.current) {
            setSectors(s.items);
            setScales(b.items);
        }
    } }, []);
    useEffect(() => { if (allowed)
        void refresh().catch(fail); }, [allowed, refresh, fail]);
    const taskKeys=useRef(new Set<string>());
    const task = async (fn: () => Promise<void>) => { if (lock.current)
        return; lock.current = true; setBusy(true); setError(''); setNotice(''); taskKeys.current.clear(); try {
        await fn();
        await refresh();
        // Keep the confirmation through the follow-up read so a retry cannot create another record.
        for(const signature of taskKeys.current)keys.current.delete(signature);
        if (mounted.current) {
            setRevision(v => v + 1);
            setNotice('Operação registrada.');
        }
    }
    catch (e) {
        fail(e);
    }
    finally {
        lock.current = false;
        if (mounted.current)
            setBusy(false);
    } };
    const write = async (route: string, input: Record<string, unknown>) => { const payload = { ...(route === 'runs/reverse' ? {} : { unitId: overview!.unitId }), ...input }; const keyed = ['weighings', 'runs/confirm', 'runs/reverse'].includes(route), signature = route + JSON.stringify(payload); if (keyed && !keys.current.has(signature))
        keys.current.set(signature, crypto.randomUUID()); const result = await request<{
        id: string;
    }>(route, { ...payload, ...(keyed ? { requestKey: keys.current.get(signature) } : {}) }, session.csrf); if(keyed)taskKeys.current.add(signature); return result; };
    if (!allowed)
        return <div className="panel pos-empty">Seu perfil não permite consultar setores e produção.</div>;
    const unit=session.units.find(u=>u.id===overview?.unitId);
    const props = overview ? {unitLabel:unit?unit.companyName+' · '+unit.code+' · '+unit.name:'Filial selecionada', overview, sectors, scales, revision, busy, task, write, fail } : null;
    return <div className="pos-root fin-root lot-root market-root"><nav className="fin-tabs" aria-label="Supermercado">{tabs.map(([key, label, Icon]) => <button key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => { setTab(key); setError(''); setNotice(''); }}><Icon size={18}/>{label}</button>)}<button aria-label="Atualizar supermercado" disabled={busy} onClick={() => task(async () => { })}><RefreshCw size={18}/></button></nav>{error && <p role="alert" className="pos-error">{error}</p>}{notice && <p role="status" className="pos-notice">{notice}</p>}{!overview?.unitId ? <div className="panel pos-empty">{overview ? 'Selecione uma filial no topo.' : 'Carregando setores…'}</div> : props && <><div className="pos-stats fin-stats"><div><Store /><span>Setores ativos<strong>{overview.summary.sectors}</strong></span></div><div><Scale /><span>Produtos por peso<strong>{overview.summary.weighedProducts}</strong></span></div><div><Barcode /><span>Pesagens registradas<strong>{overview.summary.weighings}</strong></span></div><div><ChefHat /><span>Produções confirmadas<strong>{overview.summary.runs}</strong></span></div></div><div className="market-context"><span><Store size={17}/> Configuração e histórico da filial selecionada</span><span>{day(overview.today)} · Fortaleza</span></div>{tab === 'sectors' && <ConfigPanel {...props} kind="sectors"/>}{tab === 'scales' && <ConfigPanel {...props} kind="scales"/>}{tab === 'products' && <ProfilePanel {...props}/>}{tab === 'weighings' && <WeighPanel {...props}/>}{tab === 'recipes' && <RecipePanel {...props}/>}{tab === 'runs' && <RunPanel {...props}/>}</>}</div>;
}
function Heading({ children, action }: {
    children: ReactNode;
    action?: ReactNode;
}) { return <div className="pos-heading"><h2>{children}</h2>{action}</div>; }
function Pager({ page, total, go }: {
    page: number;
    total: number;
    go: (p: number) => void;
}) { return <div className="lot-pager"><span>{total} registros · página {page + 1}</span><button disabled={!page} onClick={() => go(page - 1)}>Anterior</button><button disabled={(page + 1) * 20 >= total} onClick={() => go(page + 1)}>Próxima</button></div>; }
function usePage<T>(route: string, revision: number, fail: Props['fail'], extra = '') { const [data, setData] = useState<MarketPage<T>>({ items: [], page: 0, total: 0 }), [page, setPage] = useState(0), [query, setQuery] = useState(''), [filter, setFilter] = useState(''); useEffect(() => { let live = true; request<MarketPage<T>>(route + '?page=' + page + '&query=' + encodeURIComponent(filter) + extra).then(d => { if (live)
    setData(d); }).catch(e => { if (live)
    fail(e); }); return () => { live = false; }; }, [route, page, filter, revision, fail, extra]); return { data, page, setPage, query, setQuery, search: () => { setPage(0); setFilter(query); } }; }
function SearchBar({ value, change, search, label = 'Buscar nome ou código' }: {
    value: string;
    change: (s: string) => void;
    search: () => void;
    label?: string;
}) { return <form className="pos-filters" onSubmit={e => { e.preventDefault(); search(); }}><label>{label}<input maxLength={100} value={value} onChange={e => change(e.target.value)}/></label><button><Search size={16}/>Buscar</button></form>; }
function ProductPicker({ label, value, onChange, weighted = false, fail }: {
    label: string;
    value: MarketProduct | null;
    onChange: (p: MarketProduct) => void;
    weighted?: boolean;
    fail: Props['fail'];
}) { const { data, page, setPage, query, setQuery, search } = usePage<MarketProduct>('products', 0, fail, weighted ? '&weighted=true' : ''); return <fieldset className="market-picker"><legend>{label}</legend>{value && <p className="market-selected"><Package size={16}/><strong>{value.name}</strong> · {value.baseUnit}</p>}<div className="market-picker-search"><input aria-label={'Buscar ' + label} value={query} maxLength={100} placeholder="Nome ou código do produto" onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') {
    e.preventDefault();
    search();
} }}/><button type="button" onClick={search}>Buscar</button></div><div className="market-options">{data.items.map(p => <button type="button" key={p.id} aria-pressed={value?.id === p.id} onClick={() => onChange(p)}><span>{p.name}<small>{p.code} · {p.baseUnit}{p.profile?.plu ? ' · PLU ' + p.profile.plu : ''}</small></span><b>Selecionar</b></button>)}{!data.items.length && <p>Nenhum produto nesta busca.</p>}</div><div className="market-picker-pages"><button type="button" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span>{data.total} produtos</span><button type="button" disabled={(page + 1) * 20 >= data.total} onClick={() => setPage(page + 1)}>Próxima</button></div></fieldset>; }
function SectorSelect({ sectors, value, onChange }: {
    sectors: MarketSector[];
    value: string;
    onChange: (s: string) => void;
}) { return <label>Setor<select aria-label="Setor" required value={value} onChange={e => onChange(e.target.value)}><option value="">Selecione o setor</option>{sectors.filter(s => s.active || s.id === value).map(s => <option key={s.id} value={s.id}>{s.name}{s.active ? '' : ' · Inativo'}</option>)}</select></label>; }
function ConfigPanel(p: Props & {
    kind: 'sectors' | 'scales';
}) {
    const isScale = p.kind === 'scales';
    const [edit, setEdit] = useState<MarketScale | MarketSector | null>(null), [name, setName] = useState(''), [active, setActive] = useState(true), [model, setModel] = useState(''), [mode, setMode] = useState('manual_kg'), [prefix, setPrefix] = useState(''), [capacity, setCapacity] = useState('15'), [resolution, setResolution] = useState('0.005'), [reviewed, setReviewed] = useState(false);
    const choose = (item: MarketSector | MarketScale | null) => { setEdit(item); setName(item?.name || ''); setActive(item?.active ?? true); const s = item as MarketScale | null; setModel(s?.model || ''); setMode(s?.mode || 'manual_kg'); setPrefix(s?.prefix || ''); setCapacity(s?.capacity || '15'); setResolution(s?.resolution || '0.005'); setReviewed(s?.reviewed || false); };
    const rows = isScale ? p.scales : p.sectors;
    return <div className="market-columns"><section className="panel"><Heading action={<button disabled={p.busy} onClick={() => choose(null)}><Plus size={16}/>Novo</button>}>{isScale ? <Scale /> : <Store />}{isScale ? 'Balanças da filial' : 'Setores da loja'}</Heading><div className="market-list">{rows.map(s => <button key={s.id} onClick={() => choose(s)}><span><strong>{s.name}</strong><small>{isScale ? (s as MarketScale).mode === 'ean13_weight' ? 'Etiqueta interna por peso' : 'Peso informado manualmente' : 'Área de operação da filial'}</small></span><span className={'fin-status ' + (s.active ? 'open' : 'cancelled')}>{s.active ? 'Ativo' : 'Inativo'}</span></button>)}{!rows.length && <p className="pos-empty">{isScale ? 'Cadastre a primeira configuração de balança.' : 'Cadastre os setores, como padaria, açougue e hortifruti.'}</p>}</div></section><section className="panel"><Heading>{isScale ? <Scale /> : <Store />}{edit ? 'Editar' : 'Cadastrar'} {isScale ? 'balança' : 'setor'}</Heading><form className="pos-form" onSubmit={e => { e.preventDefault(); p.task(async () => { await p.write(p.kind, { ...(edit ? { id: edit.id, version: edit.version } : {}), name, active, ...(isScale ? { model, mode, prefix, capacity, resolution, reviewed } : {}) }); choose(null); }); }}><fieldset disabled={p.busy || !p.overview.canManage}><label>Nome do {isScale ? 'equipamento' : 'setor'}<input required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)}/></label>{isScale && <><label>Marca / modelo (opcional)<input maxLength={80} value={model} onChange={e => setModel(e.target.value)}/></label><label>Modo de operação<select aria-label="Modo de operação" disabled={!!edit} value={mode} onChange={e => { setMode(e.target.value); setPrefix(e.target.value === 'ean13_weight' ? '20' : ''); }}><option value="manual_kg">Conferência manual de peso</option><option value="ean13_weight">Etiqueta interna EAN-13 por peso</option></select></label>{mode === 'ean13_weight' && <><label>Prefixo interno (20 a 29)<input required pattern="2[0-9]" maxLength={2} disabled={!!edit} value={prefix} onChange={e => setPrefix(e.target.value)}/></label><p className="market-note">Formato desta implantação: prefixo 2 + PLU 5 + gramas 5 + dígito. Prefixo e modo são permanentes. Confirme o formato antes de ativar.</p></>}<div className="fiscal-fields"><label>Capacidade (kg)<input required type="number" min="0.001" max="99.999" step="0.001" value={capacity} onChange={e => setCapacity(e.target.value)}/></label><label>Resolução (kg)<input required type="number" min="0.001" max="1" step="0.001" value={resolution} onChange={e => setResolution(e.target.value)}/></label></div><label className="fin-checkbox"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/>Conferi formato, capacidade e resolução.</label><p className="market-note">A leitura física do equipamento depende do modelo e da homologação. Neste fluxo, o operador informa e confirma o peso.</p></>}<label className="fin-checkbox"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/>{isScale ? 'Configuração ativa' : 'Setor ativo'}</label>{!isScale && <p className="market-note">Inativar o setor bloqueia seus produtos no PDV e suas fichas de produção.</p>}<button className="pos-gold" disabled={!p.overview.canManage}>Salvar {isScale ? 'balança' : 'setor'}</button></fieldset></form></section></div>;
}
function ProfilePanel(p: Props) { const [product, setProduct] = useState<MarketProduct | null>(null), [sectorId, setSector] = useState(''), [weighted, setWeighted] = useState(false), [plu, setPlu] = useState(''); return <div className="market-columns"><section className="panel"><Heading><Package />Produto e setor</Heading><div className="pos-form"><ProductPicker label="produto do setor" value={product} fail={p.fail} onChange={v => { setProduct(v); setSector(v.profile?.sectorId || ''); setWeighted(v.profile?.weighted || false); setPlu(v.profile?.plu || ''); }}/></div></section><section className="panel"><Heading><Scale />Configurar venda por peso</Heading><form className="pos-form" onSubmit={e => { e.preventDefault(); if (!product)
    return; p.task(async () => { await p.write('products', { productId: product.id, ...(product.profile ? { version: product.profile.version } : {}), sectorId, weighted, plu }); const r = await request<MarketPage<MarketProduct>>('products?query=' + encodeURIComponent(product.code)); setProduct(r.items.find(x => x.id === product.id) || null); }); }}><fieldset disabled={p.busy || !p.overview.canManage || !product}><strong>{product?.name || 'Selecione um produto'}</strong><SectorSelect sectors={p.sectors} value={sectorId} onChange={setSector}/><label className="fin-checkbox"><input type="checkbox" disabled={product?.baseUnit !== 'KG'} checked={weighted} onChange={e => setWeighted(e.target.checked)}/>Vendido por peso (unidade KG)</label><label>PLU de cinco dígitos<input pattern="[0-9]{5}" maxLength={5} required={weighted} disabled={!!product?.profile?.plu} value={plu} onChange={e => setPlu(e.target.value)}/></label><p className="market-note">O PLU é permanente nesta filial depois de atribuído. Produtos de unidade diferente de KG podem ser vinculados ao setor, mas não recebem pesagem.</p><button className="pos-gold">Salvar perfil do produto</button></fieldset></form></section></div>; }
function Label({ value, unitLabel }: {
    unitLabel:string;
    value: MarketWeighing;
}) { const bits = value.barcode ? ean13Pattern(value.barcode) : ''; return <div id="market-label" className="market-label"><strong>INVICTUS · ETIQUETA INTERNA</strong><p>{unitLabel} · uso exclusivo nesta filial</p><h3>{value.snapshot.productName}</h3><div><span>Peso líquido <b>{qty(value.net)} kg</b></span><span>Preço / kg <b>{money(value.price)}</b></span><span>Total <b>{money(value.total)}</b></span></div>{value.snapshot.lotCode && <p>Lote {value.snapshot.lotCode} · Val.: {day(value.snapshot.expiresOn)}</p>}<small>Peso confirmado manualmente · {new Date(value.createdAt).toLocaleString('pt-BR')}</small>{value.barcode ? <><svg role="img" aria-label={'Código de barras ' + value.barcode} viewBox="0 0 117 34" shapeRendering="crispEdges" className="market-barcode"><rect width="117" height="34" fill="white"/>{[...bits].map((bit, i) => bit === '1' ? <rect key={i} x={i + 11} y={1} width="1" height={i < 3 || i > 91 || (i >= 45 && i <= 49) ? 31 : 29} fill="black"/> : null)}</svg><code>{value.barcode}</code></> : <p>Pesagem manual · sem código de barras</p>}<small>Sem valor fiscal · preço e disponibilidade conferidos no PDV.</small></div>; }
function WeighPanel(p: Props) {
    const list = usePage<MarketWeighing>('weighings', p.revision, p.fail);
    const [product, setProduct] = useState<MarketProduct | null>(null), [scaleId, setScale] = useState(''), [gross, setGross] = useState(''), [tare, setTare] = useState('0'), [stable, setStable] = useState(false), [lots, setLots] = useState<{
        id: string;
        code: string;
        expiresOn: string;
        quantity: string;
    }[]>([]), [lotId, setLot] = useState(''), [label, setLabel] = useState<MarketWeighing | null>(null);
    useEffect(() => { let live = true; setLot(''); setLots([]); if (product?.lotTracked)
        request<{
            items: typeof lots;
        }>('lots?productId=' + product.id).then(r => { if (live)
            setLots(r.items); }).catch(p.fail); return () => { live = false; }; }, [product, p.fail]);
    let net = '', total = '';
    try {
        const g = quantityMilli(gross), t = quantityMilli(tare || '0');
        if (g > t) {
            net = quantityText(g - t);
            if (product)
                total = weighedTotal(net, product.price);
        }
    }
    catch { /* Await valid operator input. */ }
    return <><div className="market-columns"><section className="panel"><Heading><Scale />Nova pesagem</Heading><form className="pos-form" onSubmit={e => { e.preventDefault(); if (!product)
        return; p.task(async () => { const r = await p.write('weighings', { productId: product.id, scaleId, gross, tare: tare || '0', stable, lotId }); setLabel(await request<MarketWeighing>('weighings/' + r.id)); setStable(false); }); }}><fieldset disabled={p.busy || !p.overview.canManage}><ProductPicker label="produto por peso" value={product} onChange={setProduct} weighted fail={p.fail}/><label>Balança configurada<select aria-label="Balança configurada" required value={scaleId} onChange={e => { setScale(e.target.value); setStable(false); }}><option value="">Selecione a configuração</option>{p.scales.filter(s => s.active && s.reviewed).map(s => <option key={s.id} value={s.id}>{s.name} · {qty(s.capacity)} kg / {qty(s.resolution)} kg</option>)}</select></label>{product?.lotTracked && <label>Lote físico separado<select aria-label="Lote físico separado" required value={lotId} onChange={e => setLot(e.target.value)}><option value="">Selecione lote válido</option>{lots.map(l => <option key={l.id} value={l.id}>{l.code} · {day(l.expiresOn)} · {qty(l.quantity)} kg</option>)}</select></label>}<div className="fiscal-fields"><label>Peso bruto (kg)<input type="number" required min="0.001" max="99.999" step="0.001" value={gross} onChange={e => { setGross(e.target.value); setStable(false); }}/></label><label>Tara (kg)<input type="number" required min="0" max="99.999" step="0.001" value={tare} onChange={e => { setTare(e.target.value); setStable(false); }}/></label></div><div className="market-weight"><span>Peso líquido<strong>{net ? qty(net) : '—'} kg</strong></span><span>Total previsto<strong>{total ? money(total) : '—'}</strong></span></div><label className="fin-checkbox"><input type="checkbox" required checked={stable} onChange={e => setStable(e.target.checked)}/>Conferi o peso estável no equipamento e informei bruto e tara.</label><p className="market-note">Registrar ou imprimir não baixa nem reserva estoque. Confira lote e validade na separação física; o código contém produto e peso.</p><button className="pos-gold" disabled={!product || !net || !stable}><Barcode size={17}/>Registrar pesagem</button></fieldset></form></section><section className="panel"><Heading action={label && <button onClick={() => window.print()}><Printer size={16}/>Imprimir etiqueta</button>}><Barcode />Etiqueta da pesagem</Heading>{label ? <div className="pos-form"><Label value={label} unitLabel={p.unitLabel}/><p className="market-note">Prévia para conferência. Ajuste papel, escala e margens na impressora antes de uso. Este formato interno precisa ser homologado no equipamento.</p></div> : <div className="market-label-placeholder"><Barcode size={56}/><strong>Da pesagem para a etiqueta</strong><p>Registre uma pesagem ou abra o histórico para conferir produto, peso e preço.</p></div>}</section></div><section className="panel"><Heading><Barcode />Histórico de pesagens</Heading><SearchBar value={list.query} change={list.setQuery} search={list.search} label="Buscar produto, lote ou balança"/><div className="pos-table-wrap"><table><thead><tr><th>Produto</th><th>Bruto / tara</th><th>Líquido</th><th>Total</th><th>Conferência</th><th></th></tr></thead><tbody>{list.data.items.map(w => <tr key={w.id}><td><strong>{w.snapshot.productName}</strong><small>{w.snapshot.lotCode || 'Sem lote'}</small></td><td>{qty(w.gross)} / {qty(w.tare)} kg</td><td>{qty(w.net)} kg</td><td>{money(w.total)}</td><td>{w.actorName}<small>{new Date(w.createdAt).toLocaleString('pt-BR')} · manual</small></td><td><button onClick={() => setLabel(w)}>Ver etiqueta</button></td></tr>)}</tbody></table>{!list.data.items.length && <p className="pos-empty">Nenhuma pesagem registrada nesta consulta.</p>}</div><Pager page={list.page} total={list.data.total} go={list.setPage}/></section></>;
}
function RecipePanel(p: Props) { const list = usePage<MarketRecipe>('recipes', p.revision, p.fail); const [edit, setEdit] = useState<MarketRecipe | null>(null), [name, setName] = useState(''), [sector, setSector] = useState(''), [output, setOutput] = useState<MarketProduct | null>(null), [yieldQty, setYield] = useState(''), [items, setItems] = useState<{
    product: MarketProduct;
    quantity: string;
}[]>([]), [notes, setNotes] = useState(''), [active, setActive] = useState(true), [reviewed, setReviewed] = useState(false); const choose = (r: MarketRecipe | null) => { setEdit(r); setName(r?.name || ''); setSector(r?.sectorId || ''); setYield(r?.yieldQuantity || ''); setNotes(r?.notes || ''); setActive(r?.active ?? true); setReviewed(r?.reviewed || false); setOutput(r ? { id: r.outputProductId, name: r.outputName, code: '', baseUnit: r.outputUnit, price: '0', lotTracked: false, profile: null } : null); setItems(r ? r.ingredients.map(i => ({ quantity: i.quantity, product: { id: i.productId, name: i.name || i.productId, code: i.code || '', baseUnit: i.baseUnit || '', price: '0', lotTracked: false, profile: null } })) : []); }; return <div className="market-columns"><section className="panel"><Heading action={<button onClick={() => choose(null)}><Plus size={16}/>Nova ficha</button>}><ChefHat />Fichas técnicas</Heading><SearchBar value={list.query} change={list.setQuery} search={list.search}/><div className="market-list">{list.data.items.map(r => <button key={r.id} onClick={() => choose(r)}><span><strong>{r.name}</strong><small>{r.outputName} · rendimento {qty(r.yieldQuantity)} {r.outputUnit} · versão {r.version}</small></span><span className={'fin-status ' + (r.active && r.reviewed ? 'open' : 'cancelled')}>{r.active ? (r.reviewed ? 'Revisada' : 'Em revisão') : 'Inativa'}</span></button>)}{!list.data.items.length && <p className="pos-empty">Cadastre uma ficha com insumos e rendimento conferidos.</p>}</div><Pager page={list.page} total={list.data.total} go={list.setPage}/></section><section className="panel"><Heading><ChefHat />{edit ? 'Editar ficha' : 'Nova ficha técnica'}</Heading><form className="pos-form" onSubmit={e => { e.preventDefault(); if (!output)
    return; p.task(async () => { await p.write('recipes', { ...(edit ? { id: edit.id, version: edit.version } : {}), name, sectorId: sector, outputProductId: output.id, yieldQuantity: yieldQty, ingredients: items.map(i => ({ productId: i.product.id, quantity: i.quantity })), notes, active, reviewed }); choose(null); }); }}><fieldset disabled={p.busy || !p.overview.canManage}><label>Nome da ficha<input required maxLength={100} value={name} onChange={e => { setName(e.target.value); setReviewed(false); }}/></label><SectorSelect sectors={p.sectors} value={sector} onChange={v => { setSector(v); setReviewed(false); }}/><ProductPicker label="produto acabado" value={output} fail={p.fail} onChange={v => { setOutput(v); setReviewed(false); }}/><label>Rendimento previsto ({output?.baseUnit || 'unidade do produto'})<input required type="number" min="0.001" step="0.001" value={yieldQty} onChange={e => { setYield(e.target.value); setReviewed(false); }}/></label><ProductPicker label="insumo da ficha" value={null} fail={p.fail} onChange={v => { if (v.id === output?.id || items.some(i => i.product.id === v.id)) {
    p.fail(Error('Insumo deve ser único e diferente da saída.'));
    return;
} setItems(x => [...x, { product: v, quantity: '' }]); setReviewed(false); }}/>{items.map((i, index) => <div className="market-ingredient" key={i.product.id}><strong>{i.product.name}<small>{i.product.code} · unidade {i.product.baseUnit}</small></strong><label>Quantidade ({i.product.baseUnit})<input required type="number" min="0.001" step="0.001" value={i.quantity} onChange={e => { setItems(x => x.map((v, j) => j === index ? { ...v, quantity: e.target.value } : v)); setReviewed(false); }}/></label><button type="button" aria-label={'Remover insumo ' + i.product.name} onClick={() => { setItems(x => x.filter((_, j) => j !== index)); setReviewed(false); }}><X size={16}/></button></div>)}<label>Modo de preparo e observações<textarea maxLength={2500} value={notes} onChange={e => { setNotes(e.target.value); setReviewed(false); }}/></label><label className="fin-checkbox"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/>Ficha ativa</label><label className="fin-checkbox"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/>Conferi insumos, unidades e rendimento.</label><p className="market-note">Cada quantidade usa a unidade de cadastro do insumo. A produção transfere o custo médio do consumo; mão de obra e despesas indiretas ainda não são rateadas.</p><button className="pos-gold" disabled={!output || !items.length}>Salvar ficha técnica</button></fieldset></form></section></div>; }
function RunPanel(p: Props) {
    const list = usePage<MarketRun>('runs', p.revision, p.fail), recipes = usePage<MarketRecipe>('recipes', p.revision, p.fail);
    const [recipe, setRecipe] = useState<MarketRecipe | null>(null), [factor, setFactor] = useState('1'), [actual, setActual] = useState(''), [lotCode, setLotCode] = useState(''), [expiry, setExpiry] = useState(''), [reason, setReason] = useState(''), [consent, setConsent] = useState(false), [detail, setDetail] = useState<MarketRun | null>(null), [reversal, setReversal] = useState('');
    const scaled = (q: string) => { try {
        const v = quantityMilli(q) * quantityMilli(factor);
        return v % 1000n ? 'Precisão maior que 3 casas' : quantityText(v / 1000n);
    }
    catch {
        return '—';
    } };
    return <><div className="market-columns"><section className="panel"><Heading><ChefHat />Preparar produção</Heading><div className="pos-form"><SearchBar value={recipes.query} change={recipes.setQuery} search={recipes.search} label="Buscar ficha técnica"/><div className="market-list">{recipes.data.items.filter(r => r.active && r.reviewed).map(r => <button key={r.id} aria-pressed={recipe?.id === r.id} onClick={() => { setRecipe(r); setConsent(false); setActual(''); }}><span><strong>{r.name}</strong><small>{r.outputName} · {qty(r.yieldQuantity)} {r.outputUnit} · versão {r.version}</small></span><Plus size={16}/></button>)}</div><Pager page={recipes.page} total={recipes.data.total} go={recipes.setPage}/></div></section><section className="panel"><Heading><Layers />Confirmar transformação</Heading><form className="pos-form" onSubmit={e => { e.preventDefault(); if (!recipe)
        return; p.task(async () => { const r = await p.write('runs/confirm', { recipeId: recipe.id, recipeVersion: recipe.version, factor, actualQuantity: actual, lotCode, expiresOn: expiry, reason }); setDetail(await request<MarketRun>('runs/' + r.id)); setRecipe(null); setActual(''); setLotCode(''); setConsent(false); setReason(''); }); }}><fieldset disabled={p.busy || !p.overview.canManage || !recipe}><strong>{recipe?.name || 'Selecione uma ficha revisada'}</strong><label>Fator da ficha<input required type="number" min="0.001" max="999.999" step="0.001" value={factor} onChange={e => { setFactor(e.target.value); setConsent(false); }}/></label>{recipe && <div className="market-consumption"><h3>Insumos a consumir</h3>{recipe.ingredients.map(i => <p key={i.productId}><span>{i.name}</span><strong>{scaled(i.quantity)} {i.baseUnit}</strong></p>)}<p><span>Rendimento previsto</span><strong>{scaled(recipe.yieldQuantity)} {recipe.outputUnit}</strong></p></div>}<label>Quantidade realmente produzida ({recipe?.outputUnit || 'unidade da saída'})<input required type="number" min="0.001" step="0.001" value={actual} onChange={e => { setActual(e.target.value); setConsent(false); }}/></label><div className="fiscal-fields"><label>Lote do produto acabado<input required maxLength={60} value={lotCode} onChange={e => setLotCode(e.target.value.toUpperCase())}/></label><label>Validade conferida<input required type="date" min={p.overview.today} value={expiry} onChange={e => setExpiry(e.target.value)}/></label></div><label>Motivo / referência da produção<input required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)}/></label><p className="market-note">Os insumos com controle de lotes seguem o primeiro vencimento válido. A saída não pode vencer depois do lote consumido. Rendimento menor concentra o custo consumido no produto acabado; a diferença fica no histórico da produção.</p><label className="fin-checkbox"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)}/>Conferi a separação, as quantidades, o lote e a validade.</label><button className="pos-gold" disabled={!recipe || !consent}>Confirmar produção e estoque</button></fieldset></form></section></div><section className="panel"><Heading><Layers />Histórico de produção</Heading><SearchBar value={list.query} change={list.setQuery} search={list.search}/><div className="pos-table-wrap"><table><thead><tr><th>Produto / ficha</th><th>Lote / validade</th><th>Rendimento real</th><th>Custo consumido</th><th>Situação</th><th></th></tr></thead><tbody>{list.data.items.map(r => <tr key={r.id}><td><strong>{r.snapshot.outputName}</strong><small>{r.snapshot.recipeName} · v{r.recipeVersion}</small></td><td>{r.lotCode}<small>{day(r.expiresOn)}</small></td><td>{qty(r.actualQuantity)} {r.snapshot.outputUnit}<small>Previsto: {qty(r.expectedQuantity)}</small></td><td>{money(r.totalCost)}</td><td><span className={'fin-status ' + (r.status === 'confirmed' ? 'open' : 'cancelled')}>{r.status === 'confirmed' ? 'Confirmada' : 'Estornada'}</span></td><td><button onClick={() => { setDetail(r); setReversal(''); }}>Ver produção</button></td></tr>)}</tbody></table>{!list.data.items.length && <p className="pos-empty">Nenhuma produção registrada nesta consulta.</p>}</div><Pager page={list.page} total={list.data.total} go={list.setPage}/></section>{detail && <section className="panel market-run-detail"><Heading action={<button aria-label="Fechar produção" onClick={() => setDetail(null)}><X size={18}/></button>}><Layers />{detail.snapshot.outputName} · {detail.lotCode}</Heading><div className="pos-form"><div className="lot-report-totals"><span>Produzido<strong>{qty(detail.actualQuantity)} {detail.snapshot.outputUnit}</strong></span><span>Diferença de rendimento<strong>{qty(detail.snapshot.yieldLoss)} {detail.snapshot.outputUnit}</strong></span><span>Custo total<strong>{money(detail.totalCost)}</strong></span><span>Custo por {detail.snapshot.outputUnit}<strong>{money(String(Number(detail.totalCost) / Number(detail.actualQuantity)))}</strong></span></div><p>{detail.actorName} · {new Date(detail.createdAt).toLocaleString('pt-BR')} · {detail.reason}</p><div className="market-consumption"><h3>Consumo confirmado</h3>{detail.inputItems.map(i => <article key={i.id}><p><span>{i.name} · {qty(i.quantity)} {i.baseUnit}</span><strong>{money(i.cost)}</strong></p>{i.lots.map(l => <small key={l.lotId}>Lote {l.code} · vence {day(l.expiresOn)} · {qty(l.quantity)} {i.baseUnit}</small>)}</article>)}</div><p className="market-note">Ficha v{detail.recipeVersion}: {detail.snapshot.recipeNotes || 'Sem observações.'} · Validade da saída: {day(detail.expiresOn)}.</p>{detail.status === 'reversed' ? <p className="pos-notice">Estornada por {detail.reversedBy} · {detail.reversalReason}</p> : p.overview.canManage && <form className="pos-form" onSubmit={e => { e.preventDefault(); p.task(async () => { await p.write('runs/reverse', { id: detail.id, reason: reversal }); setDetail(await request<MarketRun>('runs/' + detail.id)); setReversal(''); }); }}><p className="market-note">Estorno integral somente enquanto os movimentos da produção forem os últimos de cada produto na filial. A conferência é feita novamente ao confirmar.</p><label>Motivo do estorno integral<input required minLength={3} maxLength={300} value={reversal} onChange={e => setReversal(e.target.value)}/></label><button className="fin-danger" disabled={p.busy}>Estornar produção completa</button></form>}</div></section>}</>;
}
