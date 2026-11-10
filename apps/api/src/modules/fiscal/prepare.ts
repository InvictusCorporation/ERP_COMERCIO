import type { FiscalDraftInput, FiscalIssuerData, FiscalProductData, FiscalSnapshot } from '@invictus/contracts';
export function cents(s: string) { const [a, b = ''] = s.split('.'); return BigInt(a!) * 100n + BigInt((b + '00').slice(0, 2)); }
export function decimalMoney(n: bigint) { return String(n / 100n) + '.' + String(n % 100n).padStart(2, '0'); }
export function taxValue(base: string, rate: string) { const [a, b = ''] = rate.split('.'); const r = BigInt(a!) * 10000n + BigInt((b + '0000').slice(0, 4)); return decimalMoney((cents(base) * r + 500000n) / 1000000n); }
type Profile = {
    productId: string;
    data: FiscalProductData;
    version: number;
};
export function prepareFiscal(input: FiscalDraftInput, sale: any, issuer: {
    data: FiscalIssuerData;
    version: number;
} | null, profiles: Profile[], identity: {
    cnpj: string;
    name: string;
}, methods: {
    method: string;
    amount: string;
    tendered: string;
}[]) {
    const errors: string[] = [];
    const add = (s: string) => errors.push(s);
    const config = issuer?.data;
    if (!config)
        add('Cadastre o emitente fiscal desta filial.');
    else if (!config.reviewed)
        add('Confirme a revisão dos dados do emitente.');
    if (!/^\d{14}$/.test(identity.cnpj))
        add('O adaptador inicial de homologação requer CNPJ numérico; CNPJ alfanumérico aguarda homologação específica.');
    if (input.model === '55' && (!input.recipient.document || !input.recipient.name || !input.recipient.street || !input.recipient.number || !input.recipient.district || !input.recipient.city || !input.recipient.uf || !input.recipient.municipalityCode || !input.recipient.postalCode))
        add('NF-e exige identificação e endereço completo do destinatário.');
    if (input.recipient.document && !/^\d{11}$|^\d{14}$/.test(input.recipient.document))
        add('CNPJ alfanumérico do destinatário aguarda homologação do adaptador.');
    if (input.recipient.ieIndicator === '1' && !input.recipient.ie)
        add('Informe a inscrição estadual do destinatário contribuinte.');
    if (config && input.recipient.uf && input.recipient.uf !== config.uf)
        add('Este incremento aceita somente venda presencial interna na UF do emitente.');
    const items: any[] = [];
    const snapshotItems: FiscalSnapshot['items'] = [];
    for (const [index, line] of (sale.items as any[]).entries()) {
        const p = profiles.find(p => p.productId === line.productId), base = input.bases.find(b => b.productId === line.productId);
        const taxes: Record<string, string> = {};
        const item: Record<string, unknown> = { numero_item: index + 1, codigo_produto: line.code, descricao: line.name, unidade_comercial: line.baseUnit, quantidade_comercial: line.quantity, valor_unitario_comercial: line.unitPrice, unidade_tributavel: line.baseUnit, quantidade_tributavel: line.quantity, valor_unitario_tributavel: line.unitPrice, valor_bruto: line.gross, valor_desconto: line.discount, inclui_no_total: '1' };
        if (!p)
            add(line.name + ': cadastre NCM, CFOP e tributação desta filial.');
        else {
            const d = p.data;
            if (!d.reviewed)
                add(line.name + ': revisão tributária pendente.');
            if (config && ((config.crt === '1' && d.icmsCode !== '102') || (config.crt === '3' && d.icmsCode !== '00')))
                add(line.name + ': CST/CSOSN incompatível com o regime suportado.');
            Object.assign(item, { codigo_ncm: d.ncm, ...(d.cest ? { cest: d.cest } : {}), cfop: d.cfop, icms_origem: d.origin, icms_situacao_tributaria: d.icmsCode, pis_situacao_tributaria: d.pisCode, cofins_situacao_tributaria: d.cofinsCode });
            const calculation = (name: string, value: string | undefined, rate: string) => {
                if (value === undefined || value === '') {
                    add(line.name + ': informe a base de ' + name + ' revisada pelo responsável fiscal.');
                    return '0.00';
                }
                return value;
            };
            if (d.icmsCode === '00') {
                const v = calculation('ICMS', base?.icmsBase, d.icmsRate);
                taxes.icmsBase = v;
                taxes.icms = taxValue(v, d.icmsRate);
                Object.assign(item, { icms_modalidade_base_calculo: '3', icms_base_calculo: v, icms_aliquota: d.icmsRate, icms_valor: taxes.icms });
            }
            if (d.pisCode === '01') {
                const v = calculation('PIS', base?.pisBase, d.pisRate);
                taxes.pisBase = v;
                taxes.pis = taxValue(v, d.pisRate);
                Object.assign(item, { pis_base_calculo: v, pis_aliquota_porcentual: d.pisRate, pis_valor: taxes.pis });
            }
            if (d.cofinsCode === '01') {
                const v = calculation('COFINS', base?.cofinsBase, d.cofinsRate);
                taxes.cofinsBase = v;
                taxes.cofins = taxValue(v, d.cofinsRate);
                Object.assign(item, { cofins_base_calculo: v, cofins_aliquota_porcentual: d.cofinsRate, cofins_valor: taxes.cofins });
            }
            if (d.rtc === 'standard') {
                const v = calculation('IBS/CBS', base?.ibsBase, d.cbsRate);
                taxes.ibsBase = v;
                taxes.ibsState = taxValue(v, d.ibsStateRate);
                taxes.ibsCity = taxValue(v, d.ibsCityRate);
                taxes.ibs = decimalMoney(cents(taxes.ibsState) + cents(taxes.ibsCity));
                taxes.cbs = taxValue(v, d.cbsRate);
                Object.assign(item, { ibs_cbs_situacao_tributaria: d.ibsCode, ibs_cbs_classificacao_tributaria: d.classification, ibs_cbs_base_calculo: v, ibs_uf_aliquota: d.ibsStateRate, ibs_uf_valor: taxes.ibsState, ibs_mun_aliquota: d.ibsCityRate, ibs_mun_valor: taxes.ibsCity, ibs_valor_total: taxes.ibs, cbs_aliquota: d.cbsRate, cbs_valor: taxes.cbs });
            }
        }
        items.push(item);
        snapshotItems.push({ id: line.id, productId: line.productId, name: line.name, code: line.code, baseUnit: line.baseUnit, quantity: line.quantity, unitPrice: line.unitPrice, gross: line.gross, discount: line.discount, total: line.total, taxes });
    }
    if (input.bases.some(b => !sale.items.some((i: any) => i.productId === b.productId)))
        add('Base tributária contém produto que não pertence à venda.');
    const forms = methods.map(m => { const code: Record<string, string> = { cash: '01', credit: '03', debit: '04', pix: '17' }; return { forma_pagamento: code[m.method], valor_pagamento: m.amount, indicador_pagamento: '0', ...(m.method === 'credit' || m.method === 'debit' ? { tipo_integracao: '2' } : {}) }; });
    if (!forms.length || methods.reduce((s, m) => s + cents(m.amount), 0n) !== cents(sale.total))
        add('Pagamento confirmado da venda não confere com o total.');
    const r = input.recipient;
    const payload: Record<string, unknown> = { natureza_operacao: input.nature, tipo_documento: '1', local_destino: '1', finalidade_emissao: '1', consumidor_final: '1', presenca_comprador: '1', modalidade_frete: '9', cnpj_emitente: identity.cnpj, nome_emitente: identity.name, regime_tributario_emitente: config?.crt, inscricao_estadual_emitente: config?.ie, logradouro_emitente: config?.street, numero_emitente: config?.number, bairro_emitente: config?.district, municipio_emitente: config?.city, codigo_municipio_emitente: config?.municipalityCode, uf_emitente: config?.uf, cep_emitente: config?.postalCode, indicador_inscricao_estadual_destinatario: r.ieIndicator, ...(r.document ? { [r.document.length === 11 ? 'cpf_destinatario' : 'cnpj_destinatario']: r.document } : {}), ...(r.ie ? { inscricao_estadual_destinatario: r.ie } : {}), nome_destinatario: 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL', ...(r.street ? { logradouro_destinatario: r.street, numero_destinatario: r.number, bairro_destinatario: r.district, municipio_destinatario: r.city, codigo_municipio_destinatario: r.municipalityCode, uf_destinatario: r.uf, cep_destinatario: r.postalCode } : {}), valor_produtos: sale.gross, valor_desconto: sale.discount, valor_total: sale.total, valor_frete: '0.00', valor_seguro: '0.00', valor_outras_despesas: '0.00', informacoes_adicionais_contribuinte: input.additional, items, formas_pagamento: forms };
    if (snapshotItems.some(i => i.taxes.ibsBase !== undefined)) {
        const sum = (name: string) => decimalMoney(snapshotItems.reduce((total, i) => total + cents(i.taxes[name] || '0'), 0n));
        Object.assign(payload, { ibs_cbs_base_calculo: sum('ibsBase'), ibs_uf_valor_total: sum('ibsState'), ibs_mun_valor_total: sum('ibsCity'), ibs_valor_total: sum('ibs'), cbs_valor_total: sum('cbs') });
    }
    const snapshot: FiscalSnapshot = { saleNumber: sale.number, sandboxSource: !!sale.sandbox, issuerVersion: issuer?.version || null, issuer: config || null, issuerName: identity.name, recipient: r, nature: input.nature, additional: input.additional, bases: input.bases, profiles, items: snapshotItems };
    return { snapshot, payload, errors, issuerCnpj: identity.cnpj };
}
