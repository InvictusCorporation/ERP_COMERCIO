/** Preparation only. These capabilities do not authorize payments or host routing. */
export type CommercialIntegrationStatus = {
  billing: { state: 'disabled'; provider: null; automaticCharges: false };
  domains: { state: 'disabled'; provider: null; customRouting: false };
};

export type SubscriptionChargeRequest = {
  tenantId: string;
  subscriptionVersion: number;
  /** Stable per tenant + contract version + billing period, never regenerated on retry. */
  idempotencyKey: string;
  amountCents: number;
  currency: 'BRL';
  dueOn: string;
};

export type SubscriptionChargeReference = { externalId: string; state: 'pending' };
export type CustomDomainRequest = { tenantId: string; hostname: string; idempotencyKey: string };
export type DomainVerification = { externalId: string; state: 'pending_verification' };
