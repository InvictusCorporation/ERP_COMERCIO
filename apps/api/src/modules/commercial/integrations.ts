import { ServiceUnavailableException } from '@nestjs/common';
import { isIP } from 'node:net';
import type {
  CommercialIntegrationStatus, SubscriptionChargeRequest, SubscriptionChargeReference,
  CustomDomainRequest, DomainVerification,
} from '@invictus/contracts';

/** Server-only ports. A future adapter must not mark a payment received on creation. */
export interface SubscriptionBillingGateway {
  createCharge(input: SubscriptionChargeRequest): Promise<SubscriptionChargeReference>;
}
export interface CustomDomainGateway {
  requestVerification(input: CustomDomainRequest): Promise<DomainVerification>;
}

export class DisabledSubscriptionBilling implements SubscriptionBillingGateway {
  async createCharge(_input: SubscriptionChargeRequest): Promise<SubscriptionChargeReference> {
    throw new ServiceUnavailableException('Cobrança automática aguardando integração.');
  }
}
export class DisabledCustomDomains implements CustomDomainGateway {
  async requestVerification(_input: CustomDomainRequest): Promise<DomainVerification> {
    throw new ServiceUnavailableException('Domínio personalizado aguardando integração.');
  }
}

export function integrationStatus(): CommercialIntegrationStatus {
  // No environment flag or credential can activate an adapter in this increment.
  return {
    billing: { state: 'disabled', provider: null, automaticCharges: false },
    domains: { state: 'disabled', provider: null, customRouting: false },
  };
}

/** Syntax only: this NEVER verifies ownership, DNS, TLS or tenant association.
 * ASCII hostnames (including explicit punycode) only; no URL parsing shortcuts.
 */
export function normalizeCustomHostname(input: string): string {
  const host = input.trim().toLowerCase();
  const labels = host.split('.');
  if (host.length > 253 || labels.length < 2 || isIP(host) ||
      !/[a-z]/.test(labels.at(-1) || '') ||
      labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
      ['localhost', 'local', 'internal', 'lan', 'home', 'test', 'invalid', 'example', 'onion'].includes(labels.at(-1)!)) {
    throw new Error('Informe somente um domínio público, sem protocolo, caminho, porta ou curinga.');
  }
  return host;
}
