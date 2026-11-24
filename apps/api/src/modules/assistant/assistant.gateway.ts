import { ServiceUnavailableException } from '@nestjs/common';
import type { AssistantDraft } from '@invictus/contracts';

/** Server-only boundary. No credentials, model, transport or tool execution in this increment. */
export interface ManagementAssistantGateway {
  analyze(context: { tenantId: string; draft: AssistantDraft }): Promise<{ answer: string }>;
}
export class DisabledManagementAssistant implements ManagementAssistantGateway {
  async analyze(_context: { tenantId: string; draft: AssistantDraft }): Promise<never> {
    throw new ServiceUnavailableException('IA gerencial aguardando integração.');
  }
}
