import { BadRequestException } from '@nestjs/common';
import type { ReportColumn, ReportRow } from '@invictus/contracts';
export const CSV_LIMIT = 5000;
export const CSV_BYTES = 8 * 1024 * 1024;
export function csv(columns: ReportColumn[], rows: ReportRow[]): string {
    if (rows.length > CSV_LIMIT)
        throw new BadRequestException('A exportação excede 5.000 registros. Refine os filtros.');
    const quote = (s: string) => '"' + s.replace(/"/g, '""') + '"';
    const text = (s: string) => quote(/^[\s\uFEFF]*[=+\-@\t\r]/u.test(s) ? "'" + s : s);
    const parts = ['\uFEFF' + columns.map(c => text(c.label)).join(';') + '\r\n'];
    let bytes = Buffer.byteLength(parts[0]!, 'utf8');
    for (const row of rows) {
        const line = columns.map(c => { const value = row[c.key]; if (value === null || value === undefined)
            return quote(''); const s = String(value); if (['money', 'quantity', 'percent', 'integer'].includes(c.type)) {
            if (!/^-?\d+(?:\.\d+)?$/.test(s))
                throw Error('Valor numérico inválido para exportação.');
            return quote(s.replace('.', ','));
        } return text(s); }).join(';') + '\r\n';
        bytes += Buffer.byteLength(line, 'utf8');
        if (bytes > CSV_BYTES)
            throw new BadRequestException('O CSV excede 8 MB. Refine o escopo ou os filtros.');
        parts.push(line);
    }
    if (!rows.length)
        parts.push('\r\n');
    return parts.join('');
}
