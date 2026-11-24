import { BadRequestException } from '@nestjs/common';
import { ASSISTANT_TOPICS, type AssistantDraftInput, type AssistantTopic, type Permission } from '@invictus/contracts';
import { body, uuid } from '../identity/auth.controller';
import { field, date } from '../purchasing/validation';

export const TOPIC_PERMISSIONS: Record<AssistantTopic, Permission[]> = {
  sales: ['orders.read'], stock: ['stock.read', 'products.read'],
  margin: ['orders.read', 'stock.read'], purchasing: ['purchases.read'], finance: ['finance.read'],
};
export function draftInput(value: unknown): AssistantDraftInput {
  const i = body(value, ['topic', 'unitId', 'from', 'to', 'question']);
  if (typeof i.topic !== 'string' || !Object.hasOwn(ASSISTANT_TOPICS, i.topic))
    throw new BadRequestException('Selecione um tema disponível.');
  const from = date(i.from), to = date(i.to), question = field(i.question, 2000, true);
  if (!from || !to || from < '1900-01-01' || to > '9998-12-31' || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 366)
    throw new BadRequestException('Informe um período válido de até 367 dias.');
  if (question.length < 5 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(question))
    throw new BadRequestException('Escreva uma pergunta de 5 a 2000 caracteres.');
  return { topic: i.topic as AssistantTopic, unitId: uuid(i.unitId), from, to, question };
}
