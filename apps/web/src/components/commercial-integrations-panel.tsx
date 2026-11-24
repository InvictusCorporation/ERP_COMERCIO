'use client';
import { useEffect, useState } from 'react';
import { CreditCard, Globe, LockKeyhole } from 'lucide-react';
import type { CommercialIntegrationStatus } from '@invictus/contracts';
import { commercialRequest } from '../lib/commercial-client';

export function CommercialIntegrationsPanel({ tenantId, revision }: { tenantId: string | null; revision: number }) {
  const [status, setStatus] = useState<CommercialIntegrationStatus | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setStatus(null); setError('');
    commercialRequest<CommercialIntegrationStatus>('integrations')
      .then(value => { if (live) setStatus(value); })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : 'Consulta indisponível.'); });
    return () => { live = false; };
  }, [tenantId, revision]);
  if (error) return <p className="pos-error" role="alert">{error}</p>;
  if (!status) return <section className="panel pos-empty" role="status">Consultando cobrança e domínios…</section>;
  return <div className="commercial-integrations">
    <section className="panel commercial-info"><LockKeyhole /><div><h3>Preparação para a próxima etapa</h3><p>A cobrança automática e o acesso por domínio próprio aguardam integração. A gestão manual da assinatura continua disponível.</p></div></section>
    <div className="commercial-columns">
      <section className="panel commercial-integration-card">
        <div className="commercial-section-title"><h2><CreditCard /> Cobrança automática</h2><span className="commercial-badge">Aguardando integração</span></div>
        <div className="commercial-integration-content"><p>Organize o plano, o preço e a vigência na assinatura. O recebimento das mensalidades será conectado em uma próxima etapa.</p>
          <dl><div><dt>Provedor de cobrança</dt><dd>A definir</dd></div><div><dt>Cobranças automáticas</dt><dd>Desativadas</dd></div><div><dt>Pagamento confirmado</dt><dd>Aguardando integração</dd></div></dl>
          <h3>Próximas etapas</h3><ol><li>Definir o provedor e testar as cobranças.</li><li>Configurar as formas de pagamento e autorizações.</li><li>Conferir recebimentos, atrasos e cancelamentos.</li></ol>
        </div>
      </section>
      <section className="panel commercial-integration-card">
        <div className="commercial-section-title"><h2><Globe /> Domínio personalizado</h2><span className="commercial-badge">Aguardando integração</span></div>
        <div className="commercial-integration-content"><p>A identidade visual já pode ser personalizada. O endereço reservado na identidade ainda não publica um domínio.</p>
          <dl><div><dt>Domínio da plataforma</dt><dd>A definir</dd></div><div><dt>Acesso por domínio próprio</dt><dd>Desativado</dd></div><div><dt>Login público</dt><dd>Identidade Invictus</dd></div></dl>
          <h3>Próximas etapas</h3><ol><li>Registrar o domínio e definir a hospedagem.</li><li>Comprovar o domínio e configurar o acesso seguro.</li><li>Validar o acesso à empresa correta no computador e no celular.</li></ol>
        </div>
      </section>
    </div>
  </div>;
}
