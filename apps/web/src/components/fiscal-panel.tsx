"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Building2, Package, ShoppingCart, RefreshCw, Search, X, ShieldCheck, Download, Clock3, TriangleAlert } from 'lucide-react';
import { FISCAL_STATES, type AuthSession, type FiscalOverview, type FiscalPage, type FiscalDocument, type FiscalDetail, type FiscalProduct, type FiscalSource, type FiscalIssuerData, type FiscalProductData, type FiscalRecipient, type FiscalDraftInput } from '@invictus/contracts';
import { fiscalRequest } from '../lib/fiscal-client';
const money = (s: string) => Number(s).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (s: string) => new Date(s).toLocaleString('pt-BR');
const recipient: FiscalRecipient = { name: '', document: '', ieIndicator: '9', ie: '', uf: '', municipalityCode: '', city: '', street: '', number: '', district: '', postalCode: '' };
const emptyIssuer: Omit<FiscalIssuerData, 'crt'> & {
    crt: string;
} = { uf: '', crt: '', ie: '', municipalityCode: '', city: '', street: '', number: '', district: '', postalCode: '', reviewed: false };
// Empty selections require a deliberate classification by the responsible reviewer.
type TaxForm = {
    [K in Exclude<keyof FiscalProductData, "reviewed">]: string;
} & {
    reviewed: boolean;
};
const emptyTax: TaxForm = { ncm: '', cest: '', cfop: '', origin: '', icmsCode: '', icmsRate: '', pisCode: '', pisRate: '', cofinsCode: '', cofinsRate: '', rtc: '', ibsCode: '', classification: '', ibsStateRate: '', ibsCityRate: '', cbsRate: '', reviewed: false };
type Form = Omit<FiscalDraftInput, 'requestKey'>;
const states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
function Field({ label, value, onChange, options, maxLength = 60, numeric = false, required = true }: {
    label: string | undefined;
    value: string;
    onChange: (v: string) => void;
    options?: [
        string,
        string
    ][];
    maxLength?: number;
    numeric?: boolean;
    required?: boolean;
}) { return <label>{label}{options ? <select required={required} value={value} onChange={e => onChange(e.target.value)}><option value="">Selecione</option>{options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> : <input required={required} maxLength={maxLength} inputMode={numeric ? 'decimal' : 'text'} value={value} onChange={e => onChange(e.target.value)}/>}</label>; }
function Pager({ page, total, busy, go }: {
    page: number;
    total: number;
    busy: boolean;
    go: (p: number) => void;
}) { return <div className="pos-pagination"><span>{total} registros · página {page + 1}</span><button disabled={busy || page === 0} onClick={() => go(page - 1)}>Anterior</button><button disabled={busy || (page + 1) * 20 >= total} onClick={() => go(page + 1)}>Próxima</button></div>; }
export function FiscalPanel({ session }: {
    session: AuthSession;
}) {
    const [tab, setTab] = useState('documents'), [overview, setOverview] = useState<FiscalOverview | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
    const [docs, setDocs] = useState<FiscalPage<FiscalDocument>>({ items: [], total: 0, page: 0 }), [products, setProducts] = useState<FiscalPage<FiscalProduct>>({ items: [], total: 0, page: 0 }), [sources, setSources] = useState<FiscalPage<FiscalSource>>({ items: [], total: 0, page: 0 });
    const [query, setQuery] = useState(''), [model, setModel] = useState('all'), [state, setState] = useState('all'), [detail, setDetail] = useState<FiscalDetail | null>(null), [form, setForm] = useState<Form | null>(null), [reason, setReason] = useState('');
    const [issuer, setIssuer] = useState(emptyIssuer), [product, setProduct] = useState<FiscalProduct | null>(null), [tax, setTax] = useState(emptyTax);
    const live = useRef(true), lock = useRef(false), keys = useRef(new Map<string, string>());
    const allowed = session.permissions.includes('fiscal.read');
    useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
    const report = (e: unknown) => {
        if (!live.current)
            return;
        setError(e instanceof Error ? e.message : 'Não foi possível concluir.');
        if ([401, 403].includes((e as {
            status?: number;
        }).status || 0)) {
            setOverview(null);
            setDocs({ items: [], total: 0, page: 0 });
            setSources({ items: [], total: 0, page: 0 });
            setProducts({ items: [], total: 0, page: 0 });
            setDetail(null);
            setForm(null);
            setProduct(null);
            setIssuer(emptyIssuer);
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
            report(e);
        }
        finally {
            lock.current = false;
            if (live.current)
                setBusy(false);
        }
    };
    const refresh = useCallback(async () => {
        const o = await fiscalRequest<FiscalOverview>('overview');
        if (live.current) {
            setOverview(o);
        }
        return o;
    }, []);
    const load = async (next = tab, page = 0) => {
        const path = next === 'products' ? 'products' : next === 'sources' ? 'sources' : 'documents';
        const r = await fiscalRequest<FiscalPage<never>>(path + '?query=' + encodeURIComponent(query) + '&page=' + page + (path === 'documents' ? '&model=' + model + '&state=' + state : ''));
        if (!live.current)
            return;
        if (path === 'products')
            setProducts(r);
        else if (path === 'sources')
            setSources(r);
        else
            setDocs(r);
    };
    useEffect(() => {
        if (!allowed)
            return;
        void refresh().catch(report);
        const f = () => void refresh().catch(report);
        window.addEventListener('focus', f);
        return () => window.removeEventListener('focus', f);
    }, [allowed, refresh]);
    useEffect(() => {
        if (overview?.unitId && tab !== 'issuer')
            void execute(() => load()); /* navigation */ // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [overview?.unitId, tab]);
    useEffect(() => {
        if (overview)
            setIssuer(overview.issuer?.data || emptyIssuer);
    }, [overview?.issuer?.version, overview?.unitId]);
    const write = async (path: string, input: Record<string, unknown>, keyed = false) => {
        const signature = path + JSON.stringify(input);
        let key = keys.current.get(signature);
        if (!key) {
            key = crypto.randomUUID();
            keys.current.set(signature, key);
        }
        return fiscalRequest<{
            id: string;
        }>(path, keyed ? { ...input, requestKey: key } : input, session.csrf);
    };
    const open = async (id: string) => {
        const d = await fiscalRequest<FiscalDetail>('documents/' + id);
        if (live.current) {
            setDetail(d);
            setForm(null);
            setReason('');
        }
    };
    const edit = (d: FiscalDetail) => { keys.current.clear(); setForm({ id: d.document.id, version: d.document.version, saleId: d.document.saleId, model: d.document.model, nature: d.snapshot.nature, recipient: d.snapshot.recipient, bases: d.snapshot.items.map(i => d.snapshot.bases.find(b => b.productId === i.productId) || { productId: i.productId, icmsBase: "", pisBase: "", cofinsBase: "", ibsBase: "" }), additional: d.snapshot.additional }); };
    const prepare = () => execute(async () => {
        if (!form)
            return;
        const r = await write('documents/prepare', form, true);
        await open(r.id);
        setTab('documents');
        await refresh();
        await load('documents');
        setNotice('Conferência salva. Confira as pendências antes de transmitir em homologação.');
    });
    const operation = (kind: 'issue' | 'consult' | 'cancel') => execute(async () => {
        if (!detail)
            return;
        await write('operations', { documentId: detail.document.id, version: detail.document.version, kind, reason: kind === 'cancel' ? reason : '' }, true);
        await open(detail.document.id);
        await refresh();
        await load('documents');
        setNotice('Retorno registrado. Confira a situação e o histórico abaixo.');
    });
    const download = (kind: 'xml' | 'danfe' | 'cancelXml') => execute(async () => {
        if (!detail)
            return;
        const r = await fetch('/api/v1/fiscal/documents/' + detail.document.id + '/files/' + kind, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(35000) });
        if (!r.ok) {
            const e = await r.json().catch(() => null);
            throw new Error(e?.message || 'Arquivo indisponível.');
        }
        const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
        a.href = url;
        a.download = r.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || ('homologacao-' + kind);
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice('Arquivo de homologação recebido do provedor.');
    });
    const navigate = (t: string) => {
        if (busy)
            return;
        setTab(t);
        setDetail(null);
        setForm(null);
        setProduct(null);
        setQuery('');
        setError('');
        setNotice('');
    };
    const patchRecipient = (k: keyof FiscalRecipient, v: string) => setForm(f => f ? { ...f, recipient: { ...f.recipient, [k]: v } } : f);
    if (!allowed)
        return <div className="panel pos-empty">Seu perfil não permite consultar o módulo fiscal.</div>;
    return <div className="pos-root fin-root fiscal-root"><div className="fin-banner"><ShieldCheck /><span><strong>Homologação · sem valor fiscal</strong> · NF-e e NFC-e de teste. Vendas do PDV são simuladas. A emissão em produção está bloqueada.</span></div>
 <nav className="pos-tabs fin-tabs" aria-label="Módulo fiscal">{[['documents', 'Documentos', FileText], ...(overview?.capabilities.pos ? [['sources', 'Nova emissão', ShoppingCart]] : []), ['issuer', 'Emitente', Building2], ...(overview?.capabilities.products ? [['products', 'Tributação', Package]] : [])].map(([k, label, Icon]) => { const I = Icon as typeof FileText; return <button key={String(k)} aria-pressed={tab === k} disabled={busy} onClick={() => navigate(String(k))}><I size={18}/>{String(label)}</button>; })}<button aria-label="Atualizar fiscal" disabled={busy} onClick={() => void execute(async () => {
            await refresh();
            if (tab !== 'issuer')
                await load();
            if (detail)
                await open(detail.document.id);
        })}><RefreshCw size={18}/></button></nav>
 {error && <p role="alert" className="pos-error">{error} Se houve envio, consulte o documento e o histórico antes de uma nova operação.</p>}{notice && <p role="status" className="pos-notice">{notice}</p>}
 {!overview?.unitId ? <div className="panel pos-empty">{overview ? 'Selecione uma filial no topo para consultar o fiscal.' : 'Carregando fiscal…'}</div> : <>
 <div className="pos-stats fin-stats">{[[FileText, 'Rascunhos', overview.summary.draft], [Clock3, 'Em processamento', overview.summary.processing], [ShieldCheck, 'Autorizados · homologação', overview.summary.authorized], [TriangleAlert, 'Rejeitados / a conciliar', overview.summary.rejected + overview.summary.uncertain]].map(([Icon, label, n]) => { const I = Icon as typeof FileText; return <div key={String(label)}><I /><span>{String(label)}<strong>{String(n)}</strong></span></div>; })}</div>
 <div className={'fiscal-integration ' + (overview.integration.ready ? 'ready' : '')}><span className="fiscal-dot"/><div><strong>{overview.integration.ready ? 'Conexão de homologação configurada' : 'Emissão externa não habilitada'}</strong><p>{overview.integration.message}</p></div><span className="fiscal-environment">AMBIENTE 2</span></div>
 {(tab === 'documents' || tab === 'sources' || tab === 'products') && <form className="pos-filters" onSubmit={e => { e.preventDefault(); void execute(() => load()); }}><label>{tab === 'products' ? 'Buscar produto' : tab === 'sources' ? 'Buscar venda' : 'Buscar referência, venda ou chave'}<input maxLength={100} value={query} onChange={e => setQuery(e.target.value)}/></label>{tab === 'documents' && <><label>Modelo<select value={model} onChange={e => setModel(e.target.value)}><option value="all">Todos</option><option value="55">NF-e · 55</option><option value="65">NFC-e · 65</option></select></label><label>Situação<select value={state} onChange={e => setState(e.target.value)}><option value="all">Todas</option>{Object.entries(FISCAL_STATES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></>}<button className="pos-gold" disabled={busy}><Search size={16}/>Filtrar</button></form>}
 <div className={'fin-grid ' + ((detail || form || product) ? 'has-editor' : '')}>
 {tab === 'documents' && <section className="panel"><div className="pos-heading"><h2><FileText />Documentos fiscais</h2><span>NF-e / NFC-e</span></div><div className="pos-table-wrap"><table><thead><tr><th>Documento / referência interna</th><th>Situação</th><th>Total</th><th></th></tr></thead><tbody>{docs.items.map(d => <tr key={d.id}><td><strong>{d.model === '55' ? 'NF-e' : 'NFC-e'} · {d.number || 'Sem número fiscal'}</strong><small>{d.reference}</small><small>{date(d.createdAt)}</small></td><td><span className={'fin-status ' + (d.state === 'authorized' ? 'paid' : d.state === 'rejected' || d.state === 'uncertain' ? 'overdue' : 'open')}>{FISCAL_STATES[d.state]}</span></td><td>{money(d.total)}</td><td><button disabled={busy} aria-label={'Abrir documento ' + d.reference} onClick={() => void execute(() => open(d.id))}>Detalhes</button></td></tr>)}</tbody></table>{!docs.items.length && <p className="pos-empty">Nenhum documento nesta consulta.</p>}</div><Pager {...docs} busy={busy} go={p => void execute(() => load('documents', p))}/></section>}
 {tab === 'sources' && <section className="panel"><div className="pos-heading"><h2><ShoppingCart />Vendas disponíveis</h2></div><p className="fin-caption">Vendas confirmadas da filial sem documento fiscal ativo. Preparar não movimenta estoque nem caixa novamente.</p><div className="fin-account-list">{sources.items.map(s => <button key={s.id} disabled={busy || !overview.capabilities.manage} onClick={() => { keys.current.clear(); setDetail(null); setForm({ saleId: s.id, model: '65', nature: 'VENDA DE MERCADORIA', recipient: { ...recipient }, bases: s.items.map(i => ({ productId: i.productId, icmsBase: '', pisBase: '', cofinsBase: '', ibsBase: '' })), additional: '' }); }}><FileText /><span><strong>{s.number}</strong><small>{date(s.createdAt)} · {s.items.length} produtos</small></span><b>{money(s.total)}</b></button>)}{!sources.items.length && <p className="pos-empty">Nenhuma venda disponível nesta consulta. Confirme uma venda no PDV para preparar seu documento.</p>}</div><Pager {...sources} busy={busy} go={p => void execute(() => load('sources', p))}/></section>}
 {tab === 'issuer' && <section className="panel fiscal-config"><div className="pos-heading"><h2><Building2 />Emitente da filial</h2><span>Versão {overview.issuer?.version || 'inicial'}</span></div><div className="pos-form"><div className="fin-source-note"><strong>{overview.issuerName}</strong><p>CNPJ: {overview.issuerCnpj || 'Não cadastrado'}</p><small>Identificação vinculada ao cadastro da empresa e da filial.</small></div><form className="pos-form" onSubmit={e => { e.preventDefault(); void execute(async () => { await write('issuer', { unitId: overview.unitId, ...(overview.issuer ? { version: overview.issuer.version } : {}), data: issuer }); await refresh(); setNotice('Emitente salvo para esta filial. Prepare novamente os rascunhos anteriores.'); }); }}><fieldset disabled={busy || !overview.capabilities.manage}><div className="fiscal-fields"><Field label="UF do emitente" value={issuer.uf} options={states.map(s => [s, s])} onChange={uf => setIssuer(f => ({ ...f, uf }))}/><Field label="Regime tributário (CRT)" value={issuer.crt} options={['1', '3'].map(s => [s, s === '1' ? '1 · Simples Nacional' : '3 · Regime normal'])} onChange={crt => setIssuer(f => ({ ...f, crt: crt as '1' | '3' }))}/>{(['ie', 'municipalityCode', 'city', 'street', 'number', 'district', 'postalCode'] as const).map((k, i) => <Field key={k} label={['Inscrição estadual', 'Código IBGE do município', 'Município', 'Logradouro', 'Número', 'Bairro', 'CEP (8 dígitos)'][i]} value={issuer[k]} onChange={v => setIssuer(f => ({ ...f, [k]: v }))}/>)}</div><label className="fin-checkbox"><input type="checkbox" checked={issuer.reviewed} onChange={e => setIssuer(f => ({ ...f, reviewed: e.target.checked }))}/>Cadastro conferido pelo responsável fiscal</label>{overview.capabilities.manage && <button className="pos-gold">Salvar emitente</button>}</fieldset></form><p className="fin-caption">Neste incremento: venda interna, presencial e a consumidor final; CRT 1 ou 3. Certificado A1, CSC e credenciais são configurados no provedor e no servidor.</p></div></section>}
 {tab === 'products' && <section className="panel"><div className="pos-heading"><h2><Package />Tributação por produto</h2></div><p className="fin-caption">Enquadramento específico desta filial. NCM, CFOP e alíquotas precisam de conferência fiscal.</p><div className="pos-table-wrap"><table><thead><tr><th>Produto</th><th>NCM / CFOP</th><th>Revisão</th><th></th></tr></thead><tbody>{products.items.map(p => <tr key={p.id}><td><strong>{p.name}</strong><small>{p.code} · {p.baseUnit}{!p.active ? ' · Inativo' : ''}</small></td><td>{p.profile?.data.ncm || 'Pendente'}<small>{p.profile?.data.cfop || '—'}</small></td><td>{p.profile?.data.reviewed ? 'Conferido · v' + p.profile.version : 'Pendente'}</td><td><button disabled={busy} onClick={() => { setProduct(p); setTax(p.profile?.data || { ...emptyTax }); }}>Configurar</button></td></tr>)}</tbody></table>{!products.items.length && <p className="pos-empty">Nenhum produto nesta consulta.</p>}</div><Pager {...products} busy={busy} go={p => void execute(() => load('products', p))}/></section>}
 {product && tab === 'products' && <section className="panel fin-editor"><div className="pos-heading"><h2><Package />{product.name}</h2><button aria-label="Fechar tributação" onClick={() => setProduct(null)}><X size={18}/></button></div><form className="pos-form" onSubmit={e => { e.preventDefault(); void execute(async () => { await write('products', { unitId: overview.unitId, productId: product.id, ...(product.profile ? { version: product.profile.version } : {}), data: tax }); await load('products', products.page); setProduct(null); setNotice('Tributação salva nesta filial. Prepare novamente os rascunhos afetados.'); }); }}><fieldset disabled={busy || !overview.capabilities.manage}><div className="fiscal-fields"><Field label="NCM (8 dígitos)" value={tax.ncm} maxLength={8} onChange={ncm => setTax(t => ({ ...t, ncm }))}/><Field label="CEST (se aplicável)" value={tax.cest} maxLength={7} required={false} onChange={cest => setTax(t => ({ ...t, cest }))}/><Field label="CFOP" value={tax.cfop} options={['5101', '5102'].map(s => [s, s])} onChange={cfop => setTax(t => ({ ...t, cfop }))}/><Field label="Origem da mercadoria" value={tax.origin} options={['0', '1', '2', '3', '4', '5', '6', '7', '8'].map(s => [s, s])} onChange={origin => setTax(t => ({ ...t, origin: origin as FiscalProductData['origin'] }))}/><Field label="ICMS · CST / CSOSN" value={tax.icmsCode} options={['102', '00'].map(s => [s, s === '102' ? '102 · Simples, sem crédito' : '00 · Tributação integral'])} onChange={icmsCode => setTax(t => ({ ...t, icmsCode: icmsCode as '102' | '00' }))}/><Field label="Alíquota ICMS (%)" value={tax.icmsRate} numeric onChange={icmsRate => setTax(t => ({ ...t, icmsRate }))}/><Field label="PIS · CST" value={tax.pisCode} options={['01', '07', '08', '09'].map(s => [s, s])} onChange={pisCode => setTax(t => ({ ...t, pisCode: pisCode as FiscalProductData['pisCode'] }))}/><Field label="Alíquota PIS (%)" numeric value={tax.pisRate} onChange={pisRate => setTax(t => ({ ...t, pisRate }))}/><Field label="COFINS · CST" value={tax.cofinsCode} options={['01', '07', '08', '09'].map(s => [s, s])} onChange={cofinsCode => setTax(t => ({ ...t, cofinsCode: cofinsCode as FiscalProductData['cofinsCode'] }))}/><Field label="Alíquota COFINS (%)" numeric value={tax.cofinsRate} onChange={cofinsRate => setTax(t => ({ ...t, cofinsRate }))}/><Field label="IBS / CBS" value={tax.rtc} options={[['standard', 'Tributação padrão · CST 000'], ['not_applicable', 'Não aplicável, após revisão']]} onChange={rtc => setTax(t => ({ ...t, rtc: rtc as FiscalProductData['rtc'] }))}/>{(['ibsCode', 'classification', 'ibsStateRate', 'ibsCityRate', 'cbsRate'] as const).map((k, i) => <Field key={k} label={['CST IBS / CBS', 'Classificação tributária (6 dígitos)', 'Alíquota IBS estadual (%)', 'Alíquota IBS municipal (%)', 'Alíquota CBS (%)'][i]} value={tax[k]} required={i > 1 || tax.rtc === 'standard'} onChange={v => setTax(t => ({ ...t, [k]: v }))}/>)}</div><p className="fin-caption">Informe zero nas alíquotas sem destaque. Não aplicável exige CST e classificação vazios e alíquotas IBS/CBS zero. Códigos e taxas não são sugeridos pelo sistema.</p><label className="fin-checkbox"><input type="checkbox" checked={tax.reviewed} onChange={e => setTax(t => ({ ...t, reviewed: e.target.checked }))}/>Tributação conferida pelo responsável fiscal</label>{overview.capabilities.manage && <button className="pos-gold">Salvar tributação</button>}</fieldset></form></section>}
 {form && <section className="panel fin-editor"><div className="pos-heading"><h2><FileText />Conferência para homologação</h2><button aria-label="Fechar conferência" onClick={() => setForm(null)}><X size={18}/></button></div><form className="pos-form" onSubmit={e => { e.preventDefault(); prepare(); }}><Field label="Modelo do documento" value={form.model} options={[['65', 'NFC-e · modelo 65'], ['55', 'NF-e · modelo 55']]} onChange={model => setForm(f => f ? { ...f, model: model as '55' | '65' } : f)}/><Field label="Natureza da operação" value={form.nature} onChange={nature => setForm(f => f ? { ...f, nature } : f)}/><h3>Destinatário {form.model === '65' ? '(opcional)' : ''}</h3><p className="fin-caption">NF-e exige identificação e endereço completos. Em homologação, o nome enviado recebe a indicação obrigatória de documento sem valor fiscal.</p><div className="fiscal-fields">{(['name', 'document', 'ie', 'municipalityCode', 'city', 'street', 'number', 'district', 'postalCode'] as const).map((k, i) => <Field key={k} label={['Nome do destinatário', 'CPF / CNPJ do destinatário', 'IE do destinatário', 'IBGE do destinatário', 'Município do destinatário', 'Logradouro do destinatário', 'Número do destinatário', 'Bairro do destinatário', 'CEP do destinatário'][i]} value={form.recipient[k]} required={false} onChange={v => patchRecipient(k, v)}/>)}<Field label="UF do destinatário" value={form.recipient.uf} required={false} options={states.map(s => [s, s])} onChange={v => patchRecipient('uf', v)}/><Field label="Indicador da IE" value={form.recipient.ieIndicator} options={[['9', '9 · Não contribuinte'], ['1', '1 · Contribuinte'], ['2', '2 · Isento']]} onChange={v => patchRecipient('ieIndicator', v)}/></div><h3>Bases tributárias por produto (R$)</h3><p className="fin-caption">Preencha as bases dos tributos destacados após conferência. Elas não são presumidas pelo valor da venda.</p>{form.bases.map((b, i) => <fieldset className="fiscal-base" key={b.productId}><legend>{detail?.snapshot.items.find(x => x.productId === b.productId)?.name || sources.items.find(s => s.id === form.saleId)?.items.find(x => x.productId === b.productId)?.name || 'Produto ' + (i + 1)}</legend><div className="fiscal-fields">{(['icmsBase', 'pisBase', 'cofinsBase', 'ibsBase'] as const).map((k, j) => <Field key={k} label={['Base ICMS', 'Base PIS', 'Base COFINS', 'Base IBS / CBS'][j]} value={b[k]} numeric required={false} onChange={v => setForm(f => f ? { ...f, bases: f.bases.map((x, n) => n === i ? { ...x, [k]: v } : x) } : f)}/>)}</div></fieldset>)}<label>Informações complementares<textarea maxLength={2000} value={form.additional} onChange={e => setForm(f => f ? { ...f, additional: e.target.value } : f)}/></label><button className="pos-gold" disabled={busy}>Salvar conferência</button></form></section>}
 {detail && !form && <section className="panel fin-editor"><div className="pos-heading"><h2><FileText />{detail.document.model === '55' ? 'NF-e' : 'NFC-e'} · homologação</h2><button aria-label="Fechar documento" onClick={() => setDetail(null)}><X size={18}/></button></div><div className="pos-form"><span className="fin-status open">{FISCAL_STATES[detail.document.state]}</span><div className="fiscal-reference"><strong>Referência interna</strong><span>{detail.document.reference}</span><small>Venda {detail.snapshot.saleNumber} · total {money(detail.document.total)}</small></div>{detail.document.validationErrors.length > 0 && <div className="pos-error"><strong>Pendências de conferência ({detail.document.validationErrors.length})</strong><ul>{detail.document.validationErrors.slice(0, 25).map((s, i) => <li key={i}>{s}</li>)}</ul></div>}{detail.document.message && <p className="fin-source-note">{detail.document.sefazCode && 'SEFAZ ' + detail.document.sefazCode + ' · '}{detail.document.message}</p>}
 <dl className="fiscal-protocol"><dt>Número / série</dt><dd>{detail.document.number ? detail.document.number + ' / ' + (detail.document.series || '—') : 'Aguardando retorno do provedor'}</dd><dt>Chave de acesso</dt><dd>{detail.document.key || 'Não disponibilizada'}</dd><dt>Protocolo de autorização</dt><dd>{detail.document.protocol || 'Não disponibilizado'}</dd>{detail.document.cancelProtocol && <><dt>Protocolo de cancelamento</dt><dd>{detail.document.cancelProtocol}</dd></>}</dl>
 <details><summary>Dados conferidos e itens da venda</summary><div className="fiscal-snapshot"><p>{detail.snapshot.issuerName} · versão do emitente {detail.snapshot.issuerVersion || 'pendente'}</p><p>{detail.snapshot.nature} · {detail.snapshot.recipient.name || 'Consumidor não identificado'}</p>{detail.snapshot.items.map(i => <article key={i.id}><strong>{i.name}</strong><span>{i.quantity} {i.baseUnit} × {money(i.unitPrice)} · desconto {money(i.discount)} · total {money(i.total)}</span><small>ICMS {money(i.taxes.icms || '0')} · PIS {money(i.taxes.pis || '0')} · COFINS {money(i.taxes.cofins || '0')} · IBS {money(i.taxes.ibs || '0')} · CBS {money(i.taxes.cbs || '0')}</small></article>)}<p>{detail.snapshot.additional}</p></div></details>
 {overview.capabilities.manage && ['draft', 'rejected'].includes(detail.document.state) && <button disabled={busy} onClick={() => edit(detail)}>Revisar conferência</button>}
 {overview.capabilities.issue && ['draft', 'rejected'].includes(detail.document.state) && <button className="pos-gold" disabled={busy || !overview.integration.ready || detail.document.validationErrors.length > 0 || detail.document.state !== 'draft'} onClick={() => operation('issue')}>Transmitir em homologação</button>}
 {overview.capabilities.issue && ['processing', 'uncertain', 'cancel_pending', 'authorized', 'cancelled'].includes(detail.document.state) && <button disabled={busy || !overview.integration.ready} onClick={() => operation('consult')}><RefreshCw size={16}/>Consultar retorno</button>}
 {['processing', 'uncertain', 'cancel_pending'].includes(detail.document.state) && <p className="fin-caption">Consulte a mesma referência para conciliar o retorno. Não crie outro documento para repetir um envio pendente.</p>}
 <div className="fiscal-downloads">{(Object.keys(detail.document.artifacts) as ('xml' | 'danfe' | 'cancelXml')[]).filter(k => detail.document.artifacts[k] && ['authorized', 'cancelled'].includes(detail.document.state)).map(k => <button disabled={busy} key={k} onClick={() => download(k)}><Download size={16}/>{k === 'xml' ? 'XML autorizado' : k === 'danfe' ? 'DANFE do provedor' : 'XML de cancelamento'}</button>)}</div>{detail.document.qrUrl && <a href={detail.document.qrUrl} target="_blank" rel="noopener noreferrer">Consultar QR Code de homologação</a>}
 {((overview.capabilities.cancel && detail.document.state === 'authorized') || (overview.capabilities.manage && ['draft', 'rejected'].includes(detail.document.state))) && <div className="fiscal-cancel"><label>Justificativa (15 a 255 caracteres)<textarea minLength={15} maxLength={255} value={reason} onChange={e => setReason(e.target.value)}/></label>{detail.document.state === 'authorized' ? <><p>O cancelamento fiscal não estorna a venda, o estoque ou o caixa automaticamente.</p><button className="fin-danger" disabled={busy || reason.trim().length < 15 || !overview.integration.ready} onClick={() => operation('cancel')}>Solicitar cancelamento em homologação</button></> : <button disabled={busy || reason.trim().length < 15} onClick={() => void execute(async () => { await write('documents/discard', { documentId: detail.document.id, version: detail.document.version, reason }); await open(detail.document.id); await refresh(); await load('documents'); setNotice('Documento descartado localmente. Histórico preservado.'); })}>Descartar conferência local</button>}</div>}
 <h3>Histórico de operações</h3>{!detail.operations.length && <p>Nenhum envio realizado.</p>}{detail.operations.map(o => <article className="fin-payment" key={o.id}><div><strong>{{ issue: 'Emissão', consult: 'Consulta', cancel: 'Cancelamento' }[o.kind]} · {{ started: 'Em andamento', done: 'Concluída', uncertain: 'A conciliar' }[o.state]}</strong><small>{date(o.createdAt)} · {o.actorName}</small><p>{o.result?.message}</p></div></article>)}
 </div></section>}
 </div></>}
 </div>;
}
