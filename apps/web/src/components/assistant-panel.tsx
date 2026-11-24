'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Sparkles, BrainCircuit, ShieldCheck, FileText, RefreshCw, ArrowRight, MessageSquare, Eraser } from 'lucide-react';
import { ASSISTANT_TOPICS, type AssistantTopic, type AssistantOverview, type AssistantDraft, type AuthSession } from '@invictus/contracts';
import { assistantRequest } from '../lib/assistant-client';

export function AssistantPanel({ session }: { session: AuthSession }) {
  const [data, setData] = useState<AssistantOverview | null>(null), [error, setError] = useState('');
  const [unitId, setUnit] = useState(session.activeUnitId || ''), [topic, setTopic] = useState<AssistantTopic | ''>('');
  const [question, setQuestion] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [draft, setDraft] = useState<AssistantDraft | null>(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const live = useRef(true), lock = useRef(false);
  const allowed = session.permissions.includes('reports.read') && session.permissions.includes('organizations.read');
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    let current = true; setData(null); setDraft(null); setError(''); setLoading(true);
    if (!allowed) { setLoading(false); return; }
    assistantRequest<AssistantOverview>('overview').then(value => {
      if (!current) return;
      setData(value); setFrom(value.from); setTo(value.to);
      setUnit(value.units.some(u => u.id === session.activeUnitId) ? session.activeUnitId! : value.units[0]?.id || '');
      setTopic(''); setQuestion('');
    }).catch(e => { if (current) setError(e.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [allowed, revision, session.activeTenantId, session.activeUnitId]);
  const topics = data?.topics.filter(t => t.unitIds.includes(unitId)) || [];
  function choose(id: AssistantTopic) { setTopic(id); setQuestion(ASSISTANT_TOPICS[id].question); setDraft(null); setError(''); }
  async function prepare(event: FormEvent) {
    event.preventDefault(); if (lock.current || !topic) return;
    lock.current = true; setBusy(true); setError(''); setDraft(null);
    try {
      const result = await assistantRequest<AssistantDraft>('draft', { topic, question, unitId, from, to }, session.csrf);
      if (live.current) setDraft(result);
    } catch (e) {
      if (live.current) {
        setError(e instanceof Error ? e.message : 'Não foi possível preparar a pergunta.');
        if ([401, 403, 404].includes((e as { status?: number }).status || 0)) setData(null);
      }
    } finally { lock.current = false; if (live.current) setBusy(false); }
  }
  if (!allowed) return <section className="panel pos-empty">Seu perfil não permite acessar a IA gerencial.</section>;
  return <div className="assistant-root">
    <header className="assistant-hero"><div><small>INVICTUS · INTELIGÊNCIA GERENCIAL</small><h2>Decisões com mais contexto.</h2><p>Prepare perguntas sobre a sua operação e consulte os relatórios disponíveis.</p><span><span className="assistant-dot"/>IA aguardando integração</span></div><BrainCircuit size={64} aria-hidden="true"/></header>
    <section className="panel assistant-note"><ShieldCheck size={23}/><div><strong>Preparação de perguntas</strong><p>Os rascunhos ficam somente nesta tela. Nenhuma pergunta é enviada a uma IA, e nenhuma resposta é gerada nesta etapa.</p></div><button type="button" disabled={busy || loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={17}/>Atualizar</button></section>
    {error && <p className="pos-error" role="alert">{error}</p>}
    {loading && <p role="status" className="panel pos-empty">Consultando temas e filiais autorizados…</p>}
    {data && <>
      <section className="panel assistant-scope"><h3>Contexto da análise</h3><fieldset disabled={busy}><label>Filial da análise<select value={unitId} onChange={e => { setUnit(e.target.value); setTopic(''); setQuestion(''); setDraft(null); }}><option value="">Selecione uma filial</option>{data.units.map(u => <option key={u.id} value={u.id}>{u.companyName} · {u.name}</option>)}</select></label><label>Data inicial<input type="date" value={from} max={to || undefined} onChange={e => { setFrom(e.target.value); setDraft(null); }}/></label><label>Data final<input type="date" value={to} min={from || undefined} onChange={e => { setTo(e.target.value); setDraft(null); }}/></label></fieldset><p>Temas disponíveis conforme o seu perfil, os módulos contratados e o acesso à filial.</p></section>
      <div className="assistant-layout"><section><h3 className="assistant-heading"><Sparkles size={20}/>Como podemos ajudar?</h3>
        <div className="assistant-topics">{topics.map(({ id }) => <button type="button" key={id} disabled={busy} aria-pressed={topic === id} onClick={() => choose(id)}><MessageSquare size={21}/><strong>{ASSISTANT_TOPICS[id].title}</strong><span>{ASSISTANT_TOPICS[id].description}</span><small>Preparar pergunta <ArrowRight size={14}/></small></button>)}</div>
        {!topics.length && <p className="panel pos-empty">Nenhum tema disponível para esta filial no seu acesso atual.</p>}
      </section><section className="panel assistant-composer"><header><MessageSquare size={21}/><h3>Sua pergunta</h3><span>Rascunho</span></header>
        <form aria-label="Preparar pergunta gerencial" onSubmit={prepare}><fieldset disabled={busy || !topic}><label>Pergunta para o assistente<textarea required minLength={5} maxLength={2000} rows={6} value={question} placeholder="Selecione um tema para começar." onChange={e => { setQuestion(e.target.value); setDraft(null); }}/></label><small>{question.length}/2000 caracteres · sem envio externo</small><div className="assistant-actions"><button className="pos-gold" disabled={!unitId || !from || !to || question.trim().length < 5}><FileText size={17}/>{busy ? 'Preparando…' : 'Preparar pergunta'}</button><button type="button" onClick={() => { setQuestion(''); setDraft(null); }}><Eraser size={17}/>Limpar</button></div></fieldset></form>
        <div className="assistant-response" aria-live="polite">{draft ? <><span className="assistant-status">Rascunho preparado · IA desconectada</span><h4>{ASSISTANT_TOPICS[draft.topic].title}</h4><p className="assistant-question">{draft.question}</p><dl><dt>Filial</dt><dd>{draft.companyName} · {draft.unitName}</dd><dt>Período</dt><dd>{draft.from.split('-').reverse().join('/')} a {draft.to.split('-').reverse().join('/')}</dd></dl><p>Nenhuma análise foi gerada. A conexão da IA será feita em uma próxima etapa.</p><Link href={ASSISTANT_TOPICS[draft.topic].href}>Consultar módulo disponível <ArrowRight size={15}/></Link></> : <><BrainCircuit size={32}/><h4>Seu espaço de análise</h4><p>Selecione um tema, confira a filial e prepare sua pergunta. As respostas estarão disponíveis após a integração.</p></>}</div>
      </section></div>
    </>}
    <section className="panel assistant-note"><ShieldCheck size={24}/><div><strong>Você continua no controle</strong><p>A base está preparada para sugestões. Não executa compras, pagamentos, alterações de preço ou movimentações de estoque. Não há histórico salvo de perguntas nesta etapa.</p></div><Link href="/relatorios">Abrir relatórios <ArrowRight size={16}/></Link></section>
  </div>;
}
