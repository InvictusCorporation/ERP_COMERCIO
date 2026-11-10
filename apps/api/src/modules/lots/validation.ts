import { BadRequestException } from '@nestjs/common';
import { LOT_LOSS_KINDS, type LotCommand } from '@invictus/contracts';
import { body, uuid } from '../identity/auth.controller';
import { decimal } from '../inventory/validation';
import { field, date, version } from '../purchasing/validation';
export function lotInput(v: unknown): LotCommand {
    const i = body(v, ['unitId', 'productId', 'action', 'lotId', 'version', 'quantity', 'code', 'manufacturedOn', 'expiresOn', 'reason', 'lossKind', 'movementId', 'alertDays', 'requestKey']);
    const action = field(i.action, 20, true) as LotCommand['action'];
    if (!['allocate', 'withdraw', 'block', 'unblock', 'loss', 'reverse', 'settings'].includes(action))
        throw new BadRequestException('Ação de lote inválida.');
    const lotId = i.lotId ? uuid(i.lotId) : undefined;
    if (action !== 'allocate' && action !== 'settings' && !lotId)
        throw new BadRequestException('Selecione um lote.');
    if (action === 'settings' && lotId)
        throw new BadRequestException('Configuração é por produto e filial.');
    const code = field(i.code, 60).toUpperCase(), manufacturedOn = date(i.manufacturedOn), expiresOn = date(i.expiresOn);
    if (action === 'allocate' && !lotId && (!/^[A-Z0-9][A-Z0-9._/ -]{0,59}$/.test(code) || !expiresOn || (manufacturedOn && manufacturedOn > expiresOn)))
        throw new BadRequestException('Confira código, fabricação e vencimento do lote.');
    const lossKind = field(i.lossKind, 20) as LotCommand['lossKind'];
    if (action === 'loss' && !Object.hasOwn(LOT_LOSS_KINDS, lossKind))
        throw new BadRequestException('Selecione o tipo de perda.');
    const alertDays = i.alertDays ?? 30;
    if (!Number.isInteger(alertDays) || Number(alertDays) < 1 || Number(alertDays) > 365)
        throw new BadRequestException('Antecedência deve ser de 1 a 365 dias.');
    const reason = field(i.reason, 300, true);
    if (reason.length < 3)
        throw new BadRequestException('Informe um motivo com pelo menos três caracteres.');
    return { unitId: uuid(i.unitId), productId: uuid(i.productId), action, ...(lotId ? { lotId, version: version(i.version) } : i.version === undefined ? {} : { version: version(i.version) }), quantity: ['allocate', 'withdraw', 'loss'].includes(action) ? decimal(i.quantity, 3, 999999999, true) : '', code, manufacturedOn, expiresOn, reason, lossKind: action === 'loss' ? lossKind : '', movementId: action === 'reverse' ? uuid(i.movementId) : '', alertDays: Number(alertDays), requestKey: uuid(i.requestKey) };
}
