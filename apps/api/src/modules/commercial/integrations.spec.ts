import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';
import { DisabledSubscriptionBilling, DisabledCustomDomains, integrationStatus, normalizeCustomHostname } from './integrations';

test('nenhuma operação externa pode simular pagamento ou domínio verificado', async () => {
  await assert.rejects(new DisabledSubscriptionBilling().createCharge({ tenantId: 'tenant', subscriptionVersion: 1, idempotencyKey: 'period', amountCents: 14990, currency: 'BRL', dueOn: '2026-11-10' }), ServiceUnavailableException);
  await assert.rejects(new DisabledCustomDomains().requestVerification({ tenantId: 'tenant', hostname: 'erp.cliente.com.br', idempotencyKey: 'domain' }), ServiceUnavailableException);
  const status = integrationStatus();
  assert.equal(status.billing.automaticCharges, false);
  assert.equal(status.domains.customRouting, false);
  // A caller cannot mutate the next response to activate capabilities.
  Object.assign(status.billing, { automaticCharges: true });
  assert.equal(integrationStatus().billing.automaticCharges, false);
});

test('endereço é normalizado sem aceitar URLs, IPs, portas ou hosts locais', () => {
  assert.equal(normalizeCustomHostname(' ERP.Cliente.COM.BR '), 'erp.cliente.com.br');
  for (const host of ['https://erp.cliente.com.br', 'a.com/path', 'user@a.com', '*.a.com', 'a.com:443', 'a.com.', 'a..com', '-a.com', 'a-.com', '127.0.0.1', '[::1]', 'localhost', 'erp.localhost', 'erp.internal', 'erp.test', 'a.123', 'á.com', 'a'.repeat(64) + '.com', 'a.com\n.evil.com']) {
    assert.throws(() => normalizeCustomHostname(host), Error, host);
  }
});
