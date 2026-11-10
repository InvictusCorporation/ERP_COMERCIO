'use client';
import { useEffect, useRef, useState, type FormEvent, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, Palette, Layers, CreditCard, Building2, Check, RefreshCw, ChevronRight, History, Upload, LockKeyhole } from 'lucide-react';
import { COMMERCIAL_MODULES, SUBSCRIPTION_STATES, type CommercialModule, type CommercialPlan, type CommercialLimits, type CommercialOverview, type CommercialSubscription, type CommercialEvent, type TenantBrand, type AuthSession } from '@invictus/contracts';
import { commercialRequest as request } from '../lib/commercial-client';
type Task = (work: () => Promise<void>, message?: string) => Promise<void>;
type Page<T> = {
    items: T[];
    total: number;
    page: number;
};
type Tenant = {
    id: string;
    name: string;
    active: boolean;
    state: string | null;
    planName: string;
};
type TenantDetail = {
    tenantId: string;
    subscription: CommercialSubscription | null;
    usage: CommercialLimits;
    branding: TenantBrand | null;
};
const defaultBrand: TenantBrand = { displayName: 'Invictus ERP Comercial', tagline: 'Gestão completa para o seu negócio', accent: '#ffcc00', logoPng: '', slug: '', version: 0 };
const colorNames: Record<string, string> = { '#ffcc00': 'Ouro Invictus', '#7dd3fc': 'Azul céu', '#6ee7b7': 'Verde jade', '#fda4af': 'Rosa claro', '#c4b5fd': 'Violeta' };
const limitsNames: Record<keyof CommercialLimits, string> = { users: 'Usuários ativos', units: 'Unidades ativas', products: 'Produtos ativos' };
const day = (v: string) => v.split('-').reverse().join('/');
const money = (v: string | null) => v === null ? 'Preço a definir' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' / mês';
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir a consulta.';
function ModuleTags({ items }: {
    items: CommercialModule[];
}) { return <div className="commercial-tags">{items.map(id => <span key={id}><Check size={12}/>{COMMERCIAL_MODULES[id]}</span>)}</div>; }
function ModulePicker({ value, onChange }: {
    value: CommercialModule[];
    onChange: (v: CommercialModule[]) => void;
}) { return <div className="commercial-module-picker">{(Object.keys(COMMERCIAL_MODULES) as CommercialModule[]).map(id => <label key={id}><input type="checkbox" checked={value.includes(id)} onChange={e => onChange(e.target.checked ? [...value, id] : value.filter(x => x !== id))}/>{COMMERCIAL_MODULES[id]}</label>)}</div>; }
function Pager({ page, total, go, busy = false }: {
    page: number;
    total: number;
    go: (v: number) => void;
    busy?: boolean;
}) { return <div className="commercial-pager"><span>{total} registro(s) · página {page + 1}</span><button disabled={busy || page === 0} onClick={() => go(page - 1)}>Anterior</button><button disabled={busy || (page + 1) * 20 >= total} onClick={() => go(page + 1)}>Próxima</button></div>; }
function Usage({ usage, limits }: {
    usage: CommercialLimits | null;
    limits?: CommercialLimits;
}) { if (!usage)
    return null; return <div className="commercial-usage">{(Object.keys(limitsNames) as (keyof CommercialLimits)[]).map(k => <div key={k}><span>{limitsNames[k]}</span><strong>{usage[k]} <small>/ {limits?.[k] ?? 'não definido'}</small></strong>{limits?.[k] && <progress max={limits[k]!} value={usage[k] || 0} aria-label={limitsNames[k]}/>}</div>)}</div>; }
export function CommercialPanel({ session }: {
    session: AuthSession;
}) {
    const router = useRouter(), [tab, setTab] = useState('subscription'), [data, setData] = useState<CommercialOverview | null>(null), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const live = useRef(true), lock = useRef(false);
    useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
    useEffect(() => { let current = true; setData(null); setLoading(true); setError(''); if (!session.activeTenantId) {
        setLoading(false);
        return;
    } request<CommercialOverview>('overview').then(d => { if (current)
        setData(d); }).catch(e => { if (current)
        setError(errorText(e)); }).finally(() => { if (current)
        setLoading(false); }); return () => { current = false; }; }, [session.activeTenantId, revision]);
    const task: Task = async (fn, message = 'Configuração salva.') => { if (lock.current)
        return; lock.current = true; setBusy(true); setError(''); setNotice(''); try {
        await fn();
        if (live.current) {
            setNotice(message);
            setRevision(v => v + 1);
            router.refresh();
        }
    }
    catch (e) {
        if (live.current)
            setError(errorText(e));
    }
    finally {
        lock.current = false;
        if (live.current)
            setBusy(false);
    } };
    const owner = data?.isOwner || session.tenants.some(t => t.id === session.activeTenantId && t.isOwner);
    return <div className="commercial-root"><section className="commercial-hero"><div><small>INVICTUS · PLATAFORMA COMERCIAL</small><h2>Sua marca. Uma gestão completa.</h2><p>Contrato, recursos e identidade da sua operação, no mesmo lugar.</p></div><ShieldCheck size={48}/></section>
 <nav aria-label="Plataforma comercial" className="commercial-tabs">{[['subscription', 'Assinatura', CreditCard], ...(owner ? [['branding', 'Identidade visual', Palette], ['events', 'Histórico', History]] : []), ...(session.platformOperator ? [['master', 'Master Invictus', ShieldCheck], ...(!owner ? [['events', 'Histórico', History]] : [])] : [])].map(([key, label, Icon]) => { const I = Icon as typeof CreditCard; return <button key={key as string} disabled={busy} aria-current={tab === key ? 'page' : undefined} onClick={() => { setTab(key as string); setError(''); setNotice(''); }}><I size={17}/>{label as string}</button>; })}<button aria-label="Atualizar plataforma comercial" disabled={busy} onClick={() => { setRevision(v => v + 1); router.refresh(); }}><RefreshCw size={17}/></button></nav>
 {error && <p className="pos-error" role="alert">{error}</p>}{notice && <p className="pos-notice" role="status">{notice}</p>}
 {tab === 'subscription' && (loading ? <div className="panel pos-empty">Carregando assinatura…</div> : data ? <>
 <section className="panel commercial-contract"><div className="commercial-section-title"><h2><CreditCard /> {data.license.planName}</h2><span className={'commercial-badge ' + (data.license.effective ? 'active' : 'inactive')}>{data.license.state === 'legacy' ? 'Sem contrato' : data.license.effective ? SUBSCRIPTION_STATES[data.license.state] : ['active', 'trial'].includes(data.license.state) ? 'Fora da vigência' : SUBSCRIPTION_STATES[data.license.state]}</span></div>
 {!data.license.managed ? <p>Implantação anterior preservada. A Invictus poderá registrar a contratação sem alterar os seus dados.</p> : <p>Disponibilidade conforme a situação e a vigência do contrato.</p>}
 {data.subscription && <dl className="commercial-contract-info"><div><dt>Vigência registrada</dt><dd>{day(data.subscription.startsOn)} a {day(data.subscription.endsOn)}</dd></div><div><dt>Referência mensal</dt><dd>{money(data.subscription.plan.monthlyPrice)}</dd></div><div><dt>Condições do plano</dt><dd>Versão {data.subscription.plan.version} · sem cobrança automática</dd></div></dl>}
 <h3>Módulos disponíveis na assinatura</h3>{data.license.modules.length ? <ModuleTags items={data.license.modules}/> : <p className="commercial-muted">Recursos operacionais indisponíveis. Consulte a administração da plataforma.</p>}
 <p className="commercial-muted">A contratação não substitui as permissões do seu perfil e das suas filiais.</p><Usage usage={data.usage} limits={data.subscription?.plan.limits}/>
 </section><section className="panel commercial-info"><LockKeyhole /><div><h3>Gestão do contrato</h3><p>Planos, vigência, suspensão e módulos são administrados pelo Master Invictus. Esta tela não realiza pagamentos ou renovação automática.</p></div></section></> : <div className="panel pos-empty">{session.activeTenantId ? "Consulta indisponível. Atualize a plataforma para tentar novamente." : "Selecione uma rede no cabeçalho para consultar a assinatura."}</div>)}
 {tab === 'branding' && data && <BrandForm key={data.license.branding?.version + '-' + session.activeTenantId} tenantId={session.activeTenantId!} value={data.license.branding} enabled={data.canCustomize} busy={busy} task={task} csrf={session.csrf}/>}
 {tab === 'events' && <EventList revision={revision} fail={e => setError(errorText(e))}/>}
 {tab === 'master' && session.platformOperator && <MasterPanel csrf={session.csrf} task={task} busy={busy} revision={revision} fail={e => setError(errorText(e))}/>}
 </div>;
}
function BrandForm({ tenantId, value, enabled, busy, task, csrf }: {
    tenantId: string;
    value: TenantBrand | null;
    enabled: boolean;
    busy: boolean;
    task: Task;
    csrf: string;
}) {
    const [brand, setBrand] = useState<TenantBrand>(value || defaultBrand), [fileError, setFileError] = useState('');
    const change = <K extends keyof TenantBrand>(key: K, v: TenantBrand[K]) => setBrand(b => ({ ...b, [key]: v }));
    const file = async (f: File | undefined) => { if (!f)
        return; setFileError(''); if (f.type !== 'image/png' || f.size > 204800) {
        setFileError('Use uma imagem PNG de até 200 KB e 1024 × 1024 pixels.');
        return;
    } try {
        const content = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onerror = reject; r.onload = () => resolve(String(r.result)); r.readAsDataURL(f); });
        change('logoPng', content);
    }
    catch {
        setFileError('Não foi possível ler o arquivo.');
    } };
    return <div className="commercial-columns"><section className="panel"><div className="commercial-section-title"><h2><Palette /> Identidade visual</h2></div><form aria-label="Personalização da rede" className="commercial-form" onSubmit={e => { e.preventDefault(); void task(async () => { await request('branding', { ...brand, tenantId }, csrf); }, 'Identidade visual salva.'); }}><fieldset disabled={!enabled || busy}>
 <label>Nome exibido<input required minLength={2} maxLength={64} value={brand.displayName} onChange={e => change('displayName', e.target.value)}/></label><label>Mensagem da marca<input maxLength={100} value={brand.tagline} onChange={e => change('tagline', e.target.value)}/></label>
 <label>Cor de destaque<select value={brand.accent} onChange={e => change('accent', e.target.value)}>{Object.entries(colorNames).map(([color, label]) => <option value={color} key={color}>{label}</option>)}</select></label>
 <label className="commercial-upload"><Upload size={20}/> Logomarca PNG<input type="file" accept="image/png" onChange={e => { void file(e.target.files?.[0]); e.target.value = ''; }}/></label><small>Até 200 KB, com dimensões de até 1024 × 1024 pixels.</small>
 {brand.logoPng && <button type="button" onClick={() => change('logoPng', '')}>Remover logomarca</button>}
 <label>Identificador do endereço<input maxLength={40} pattern="[a-z][a-z0-9-]{2,39}" placeholder="minha-empresa" value={brand.slug} onChange={e => change('slug', e.target.value.toLowerCase())}/></label><p className="commercial-muted">O identificador fica reservado. Acesso por domínio e identidade no login público dependem da configuração da infraestrutura.</p>
 <button className="pos-gold" type="submit">Salvar identidade</button></fieldset></form>{fileError && <p role="alert" className="pos-error">{fileError}</p>}{!enabled && <p className="commercial-muted">A personalização exige proprietário com MFA. <Link href="/seguranca">Configurar acesso</Link></p>}</section>
 <section className="panel commercial-brand-preview"><div className="commercial-section-title"><h2>Prévia da identidade</h2></div><div style={{ '--preview-accent': brand.accent } as CSSProperties} className="commercial-preview"><header>{brand.logoPng ? <img src={brand.logoPng} alt="Prévia da logomarca"/> : <ShieldCheck size={42}/>}<div><strong>{brand.displayName}</strong><small>{brand.tagline}</small></div></header><div><h3>Visão geral da sua operação</h3><p>Seu negócio, com a sua identidade.</p><span className="commercial-preview-button">Dashboard</span><div className="commercial-preview-cards"><span><Layers /> Estoque</span><span><CreditCard /> Financeiro</span></div></div></div><p className="commercial-muted">A personalização se aplica ao ambiente autenticado desta rede. Documentos fiscais e registros históricos mantêm sua identificação original.</p></section></div>;
}
function EventList({ revision, fail }: {
    revision: number;
    fail: (e: unknown) => void;
}) {
    const [page, setPage] = useState(0), [data, setData] = useState<Page<CommercialEvent> | null>(null);
    useEffect(() => { let live = true; setData(null); request<Page<CommercialEvent>>('events?page=' + page).then(d => { if (live)
        setData(d); }).catch(e => { if (live)
        fail(e); }); return () => { live = false; }; }, [page, revision]);
    const labels: Record<string, string> = { 'commercial_plans.created': 'Plano criado', 'commercial_plans.changed': 'Plano alterado', 'commercial_subscriptions.created': 'Assinatura registrada', 'commercial_subscriptions.changed': 'Assinatura alterada', 'commercial_brandings.created': 'Identidade registrada', 'commercial_brandings.changed': 'Identidade alterada', 'commercial_operator.changed': 'Acesso Master alterado' };
    return <section className="panel"><div className="commercial-section-title"><h2><History /> Histórico comercial</h2></div><div className="commercial-events">{!data ? <p>Carregando histórico…</p> : data.items.length ? data.items.map(e => <article key={e.id}><div><strong>{labels[e.action] || e.action}</strong><small>{e.actorName} · {new Date(e.createdAt).toLocaleString('pt-BR')}</small></div><details><summary>Detalhes da alteração</summary><pre>{JSON.stringify({ antes: e.before, depois: e.after }, null, 2)}</pre></details></article>) : <p>Nenhuma alteração comercial registrada.</p>}</div>{data && <Pager page={page} total={data.total} go={setPage}/>}</section>;
}
function MasterPanel({ csrf, task, busy, revision, fail }: {
    csrf: string;
    task: Task;
    busy: boolean;
    revision: number;
    fail: (e: unknown) => void;
}) {
    const [view, setView] = useState('plans'), [plans, setPlans] = useState<CommercialPlan[]>([]), [page, setPage] = useState(0), [query, setQuery] = useState(''), [filter, setFilter] = useState(''), [tenants, setTenants] = useState<Page<Tenant> | null>(null), [target, setTarget] = useState<Tenant | null>(null), [detail, setDetail] = useState<TenantDetail | null>(null), [edit, setEdit] = useState<CommercialPlan | null>(null);
    useEffect(() => { let live = true; request<CommercialPlan[]>('plans').then(d => { if (live)
        setPlans(d); }).catch(e => { if (live) {
        setPlans([]);
        fail(e);
    } }); return () => { live = false; }; }, [revision]);
    useEffect(() => { let live = true; setTenants(null); request<Page<Tenant>>('tenants?page=' + page + '&query=' + encodeURIComponent(filter)).then(d => { if (live)
        setTenants(d); }).catch(e => { if (live)
        fail(e); }); return () => { live = false; }; }, [page, filter, revision]);
    useEffect(() => { let live = true; setDetail(null); if (target)
        request<TenantDetail>('tenants/' + target.id).then(d => { if (live)
            setDetail(d); }).catch(e => { if (live)
            fail(e); }); return () => { live = false; }; }, [target?.id, revision]);
    return <><section className="panel commercial-master-note"><ShieldCheck /><div><strong>Master Invictus Systems</strong><p>Administração comercial com MFA. Acesso Master não concede consulta aos dados operacionais das empresas.</p></div></section><nav className="commercial-tabs" aria-label="Administração Master"><button disabled={busy} aria-current={view === 'plans' ? 'page' : undefined} onClick={() => setView('plans')}><Layers size={17}/>Planos</button><button disabled={busy} aria-current={view === 'subscriptions' ? 'page' : undefined} onClick={() => setView('subscriptions')}><Building2 size={17}/>Redes e assinaturas</button></nav>
 {view === 'plans' ? <><div className="commercial-plan-grid">{plans.map(plan => <article className="panel commercial-plan-card" key={plan.id}><div className="commercial-plan-icon"><Building2 /></div><h3>{plan.name}</h3><p>{plan.description}</p><strong>{money(plan.monthlyPrice)}</strong><small>{plan.active ? 'Disponível para contratação' : 'Inativo para novas contratações'} · versão {plan.version}</small><ModuleTags items={plan.modules}/><button disabled={busy} aria-label={'Editar plano ' + plan.name} onClick={() => setEdit(plan)}>Editar condições <ChevronRight size={15}/></button></article>)}</div><PlanForm key={edit?.id + '-' + edit?.version} value={edit} csrf={csrf} busy={busy} task={task} clear={() => setEdit(null)}/></> : <>
 <section className="panel"><div className="commercial-section-title"><h2>Redes e assinaturas</h2></div><form className="commercial-search" onSubmit={e => { e.preventDefault(); setPage(0); setFilter(query); }}><label>Buscar rede<input maxLength={100} value={query} onChange={e => setQuery(e.target.value)}/></label><button disabled={busy}>Consultar redes</button></form><div className="commercial-directory">{tenants ? tenants.items.map(t => <button key={t.id} disabled={busy} aria-pressed={target?.id === t.id} onClick={() => setTarget(t)}><Building2 size={22}/><span><strong>{t.name}</strong><small>{t.planName} · {t.active ? 'Rede ativa' : 'Rede inativa'}</small></span><ChevronRight size={18}/></button>) : <p>Consultando redes…</p>}</div>{tenants && <Pager busy={busy} page={page} total={tenants.total} go={setPage}/>}</section>
 {target && detail && <><section className="panel commercial-selected"><h2>{target.name}</h2>{detail.subscription && <p>Contrato vigente: {detail.subscription.plan.name} · condições da versão {detail.subscription.plan.version} · {money(detail.subscription.plan.monthlyPrice)}</p>}<Usage usage={detail.usage} limits={detail.subscription?.plan.limits}/></section><SubscriptionForm key={target.id + '-' + (detail.subscription?.version || 0)} tenant={target} value={detail.subscription} plans={plans} csrf={csrf} busy={busy} task={task}/><BrandForm key={'brand-' + target.id + '-' + detail.branding?.version} tenantId={target.id} value={detail.branding} enabled={true} csrf={csrf} busy={busy} task={task}/></>}
 </>}
 </>;
}
function PlanForm({ value, csrf, busy, task, clear }: {
    value: CommercialPlan | null;
    csrf: string;
    busy: boolean;
    task: Task;
    clear: () => void;
}) {
    const [name, setName] = useState(value?.name || ''), [description, setDescription] = useState(value?.description || ''), [price, setPrice] = useState(value?.monthlyPrice || ''), [active, setActive] = useState(value?.active ?? true), [mods, setMods] = useState<CommercialModule[]>(value?.modules || ['inventory', 'pos', 'finance', 'reports']), [limits, setLimits] = useState<Record<keyof CommercialLimits, string>>({ users: value?.limits.users?.toString() || '', units: value?.limits.units?.toString() || '', products: value?.limits.products?.toString() || '' });
    const save = (e: FormEvent) => { e.preventDefault(); void task(async () => { await request('plans', { ...(value ? { id: value.id } : {}), version: value?.version || 0, name, description, modules: mods, limits: Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, v === '' ? null : Number(v)])), monthlyPrice: price === '' ? null : price.replace(',', '.'), active }, csrf); clear(); }, 'Condições do plano salvas. Assinaturas existentes preservadas.'); };
    return <section className="panel"><div className="commercial-section-title"><h2>{value ? 'Editar plano: ' + value.name : 'Novo plano'}</h2>{value && <button disabled={busy} onClick={clear}>Novo plano</button>}</div><form className="commercial-form" aria-label="Condições do plano" onSubmit={save}><fieldset disabled={busy}><div className="commercial-form-grid"><label>Nome do plano<input required minLength={2} maxLength={60} value={name} onChange={e => setName(e.target.value)}/></label><label>Referência mensal (R$)<input inputMode="decimal" maxLength={13} placeholder="Preço a definir" value={price} onChange={e => setPrice(e.target.value)}/></label></div><label>Descrição do plano<textarea maxLength={500} value={description} onChange={e => setDescription(e.target.value)}/></label><div className="commercial-form-grid">{(Object.keys(limitsNames) as (keyof CommercialLimits)[]).map(k => <label key={k}>Limite de {limitsNames[k].toLowerCase()}<input type="number" min={1} max={1000000} step={1} placeholder="Não definido" value={limits[k]} onChange={e => setLimits(v => ({ ...v, [k]: e.target.value }))}/></label>)}</div><h3>Módulos do plano</h3><ModulePicker value={mods} onChange={setMods}/><p className="commercial-muted">PDV/compras/lotes exigem estoque; fiscal exige PDV; supermercado exige lotes; rede exige compras; clientes exige financeiro. Preço e limites vazios permanecem sem definição.</p><label className="commercial-checkbox"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/>Disponível para novas contratações</label><button className="pos-gold">Salvar plano</button></fieldset></form></section>;
}
function SubscriptionForm({ tenant, value, plans, csrf, busy, task }: {
    tenant: Tenant;
    value: CommercialSubscription | null;
    plans: CommercialPlan[];
    csrf: string;
    busy: boolean;
    task: Task;
}) {
    const [planId, setPlan] = useState(value?.plan.id || plans.find(p => p.name === 'Essencial')?.id || ''), [mods, setMods] = useState<CommercialModule[]>(value?.enabledModules || plans.find(p => p.name === 'Essencial')?.modules || []), [state, setState] = useState(value?.state || 'pending'), [startsOn, setStarts] = useState(value?.startsOn || ''), [endsOn, setEnds] = useState(value?.endsOn || ''), [reason, setReason] = useState('');
    const plan = plans.find(p => p.id === planId), preserve = !!value && value.plan.id === planId && ['suspended', 'cancelled'].includes(state), allowedModules = preserve ? value!.plan.modules : plan?.modules, save = (e: FormEvent) => { e.preventDefault(); if (!plan)
        return; void task(async () => { await request('subscriptions', { tenantId: tenant.id, version: value?.version || 0, planId, planVersion: plan.version, enabledModules: mods, state, startsOn, endsOn, reason }, csrf); }, 'Assinatura administrativa salva. Nenhuma cobrança foi executada.'); };
    return <section className="panel"><div className="commercial-section-title"><h2>Vigência e módulos · {tenant.name}</h2></div><form aria-label="Assinatura da rede" className="commercial-form" onSubmit={save}><fieldset disabled={busy || !tenant.active}><div className="commercial-form-grid"><label>Plano contratado<select required value={planId} onChange={e => { setPlan(e.target.value); setMods(plans.find(p => p.id === e.target.value)?.modules || []); }}><option value="">Selecione um plano</option>{plans.map(p => <option disabled={!p.active} key={p.id} value={p.id}>{p.name}{!p.active ? ' (inativo)' : ''} · versão {p.version}</option>)}</select></label><label>Situação da assinatura<select value={state} onChange={e => { setState(e.target.value as typeof state); if (value && value.plan.id === planId && ['suspended', 'cancelled'].includes(e.target.value)) {
        setStarts(value.startsOn);
        setEnds(value.endsOn);
    } }}>{Object.entries(SUBSCRIPTION_STATES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>Início da vigência<input required disabled={preserve} type="date" value={startsOn} onChange={e => setStarts(e.target.value)}/></label><label>Fim da vigência<input required disabled={preserve} min={startsOn || undefined} type="date" value={endsOn} onChange={e => setEnds(e.target.value)}/></label></div><h3>Módulos habilitados</h3><div className="commercial-module-picker">{allowedModules?.map(id => <label key={id}><input type="checkbox" checked={mods.includes(id)} onChange={e => setMods(v => e.target.checked ? [...v, id] : v.filter(x => x !== id))}/>{COMMERCIAL_MODULES[id]}</label>)}</div><label>Motivo da alteração<textarea required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)}/></label><p className="commercial-muted">Ativar/renovar copia as condições atuais do plano. Suspender/cancelar preserva as condições e datas anteriores. A vigência é inclusiva, pela data da operação em Fortaleza. Suspensão, cancelamento ou fim da vigência bloqueiam os módulos; os dados são preservados.</p><button disabled={!plan || (!plan.active && !preserve)} className="pos-gold">Salvar assinatura manual</button></fieldset></form></section>;
}
