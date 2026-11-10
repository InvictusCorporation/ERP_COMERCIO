import { ServiceUnavailableException } from '@nestjs/common';
export type FiscalOutcome = {
    state: 'processing' | 'authorized' | 'rejected' | 'cancelled' | 'uncertain';
    message: string;
    sefazCode?: string;
    key?: string;
    protocol?: string;
    cancelProtocol?: string;
    number?: string;
    series?: string;
    xmlPath?: string;
    danfePath?: string;
    cancelXmlPath?: string;
    qrUrl?: string;
};
export type FiscalBinding = {
    tenantId: string;
    unitId: string;
    issuerCnpj: string;
};
export type GatewayDocument = FiscalBinding & {
    reference: string;
    model: '55' | '65';
    key: string | null;
    protocol: string | null;
};
export interface FiscalGateway {
    integration(binding: FiscalBinding): {
        provider: 'focus_homologation' | 'disabled';
        ready: boolean;
        message: string;
    };
    execute(document: GatewayDocument, kind: 'issue' | 'consult' | 'cancel', payload: Record<string, unknown>): Promise<FiscalOutcome>;
    download(document: GatewayDocument, path: string, kind: 'xml' | 'danfe' | 'cancelXml'): Promise<{
        bytes: Buffer;
        type: string;
    }>;
}
const HOST = 'https://homologacao.focusnfe.com.br';
export function validAccessKey(key: string) {
    if (!/^\d{44}$/.test(key) || /^(.)\1{43}$/.test(key))
        return false;
    let sum = 0, weight = 2;
    for (let i = 42; i >= 0; i--) {
        sum += Number(key[i]) * weight;
        weight = weight === 9 ? 2 : weight + 1;
    }
    const rest = sum % 11, digit = rest < 2 ? 0 : 11 - rest;
    return Number(key[43]) === digit;
}
export function safeAssetPath(raw: unknown) {
    if (typeof raw !== 'string' || raw.length > 1000 || !raw.startsWith('/') || raw.startsWith('//'))
        return undefined;
    const url = new URL(raw, HOST);
    if (url.origin !== HOST || url.search || url.hash || !/^\/arquivos(?:_development)?\/[A-Za-z0-9_/.\-]+\.(?:xml|pdf|html)$/.test(url.pathname) || url.pathname.split('/').some(x => x === '.' || x === '..') || raw.includes('..'))
        return undefined;
    return url.pathname;
}
function qr(raw: unknown) {
    if (typeof raw !== 'string' || raw.length > 2048)
        return undefined;
    try {
        const u = new URL(raw);
        if (u.protocol === 'https:' && u.hostname.endsWith('.gov.br') && !u.username && !u.password)
            return u.href;
    }
    catch { }
    return undefined;
}
async function bounded(response: Response, max: number) {
    const reader = response.body?.getReader();
    if (!reader)
        throw Error('empty');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.length;
            if (size > max)
                throw Error('limit');
            chunks.push(value);
        }
    }
    finally {
        await reader.cancel().catch(() => { });
    }
    return Buffer.concat(chunks);
}
export class FocusGateway implements FiscalGateway {
    private tokens: Record<string, string> = {};
    private enabled = false;
    private invalid = false;
    private production = false;
    constructor(env: NodeJS.ProcessEnv = process.env, private readonly transport: typeof fetch = fetch) {
        this.production = env.NODE_ENV === 'production';
        try {
            if (env.FISCAL_PROVIDER && !['disabled', 'focus_homologation'].includes(env.FISCAL_PROVIDER))
                throw Error();
            if (env.FISCAL_PROVIDER !== 'focus_homologation' || env.NODE_ENV === 'production')
                return;
            const values = JSON.parse(env.FISCAL_FOCUS_HOMOLOG_TOKENS || '{}');
            if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length > 100)
                throw Error();
            for (const [cnpj, token] of Object.entries(values)) {
                if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/\d{14}$/.test(cnpj) || typeof token !== 'string' || token.length < 8 || token.length > 2000 || /[\s\x00-\x1f]/.test(token))
                    throw Error();
                this.tokens[cnpj] = token;
            }
            this.enabled = true;
        }
        catch {
            this.tokens = {};
            this.invalid = true;
        }
    }
    integration(binding: FiscalBinding) { const cnpj = binding.tenantId + '/' + binding.unitId + '/' + binding.issuerCnpj; return { provider: this.enabled ? 'focus_homologation' as const : 'disabled' as const, ready: !!this.tokens[cnpj] && this.enabled, message: this.production ? 'Transmissão fiscal em produção bloqueada neste incremento.' : this.invalid ? 'Configuração fiscal inválida no servidor.' : this.enabled && this.tokens[cnpj] ? 'Adaptador de homologação configurado; emissão depende do cadastro, certificado/CSC e habilitação no provedor.' : 'Emissão externa desabilitada. Configure provedor e credencial de homologação por CNPJ no servidor.' }; }
    private token(d: GatewayDocument) {
        if (!this.integration(d).ready)
            throw new ServiceUnavailableException('Integração fiscal de homologação não configurada para este CNPJ.');
        return this.tokens[d.tenantId + '/' + d.unitId + '/' + d.issuerCnpj]!;
    }
    private clean(value: unknown, token: string) { let s = typeof value === 'string' ? value : 'Retorno fiscal não reconhecido.'; s = s.replaceAll(token, '[credencial omitida]').replaceAll(Buffer.from(token + ':').toString('base64'), '[autenticação omitida]').replace(/Basic\s+[A-Za-z0-9+/=]+/gi, '[autenticação omitida]').replace(/\b\d{11}\b/g, '[CPF omitido]').replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF omitido]').replace(/[\x00-\x1f]/g, ' '); return s.slice(0, 500); }
    private normalize(data: any, d: GatewayDocument, kind: 'issue' | 'consult' | 'cancel', token: string, httpStatus: number): FiscalOutcome {
        const unknown = (message: string): FiscalOutcome => ({ state: 'uncertain', message });
        if (httpStatus >= 400) {
            const message = this.clean(data?.mensagem, token);
            if (kind === 'issue' && httpStatus === 400 && data?.codigo === 'requisicao_invalida' && !/ref|process|duplic|utilizad/i.test(message))
                return { state: 'rejected', message };
            return unknown('Provedor HTTP ' + httpStatus + ': ' + message + ' Consulte pela mesma referência; não reenviar automaticamente.');
        }
        if (data?.ref !== d.reference || String(data?.cnpj_emitente) !== d.issuerCnpj)
            return unknown('Referência ou emitente do retorno não confere. Consulte a operação antes de qualquer reenvio.');
        const status = data.status, code = /^\d{3}$/.test(String(data.status_sefaz || '')) ? String(data.status_sefaz) : '', message = this.clean(data.mensagem_sefaz || data.mensagem || status, token);
        if (status === 'processando_autorizacao')
            return { state: 'processing', sefazCode: code, message };
        if (status === 'erro_autorizacao' && !d.key)
            return { state: 'rejected', sefazCode: code, message };
        if (status === 'erro_cancelamento' && d.key)
            return { state: 'authorized', key: d.key, protocol: d.protocol!, message, sefazCode: code };
        const key = String(data.chave_nfe || '').replace(/^NFe/, '');
        if (!validAccessKey(key) || key.slice(6, 20) !== d.issuerCnpj || key.slice(20, 22) !== d.model)
            return unknown('Chave de acesso inválida ou incompatível com o documento.');
        const p = data.protocolo_nota_fiscal, protocol = String(p?.numero_protocolo || data.numero_protocolo || '');
        if (status === 'autorizado') {
            if (String(p?.ambiente) !== '2' || !/^\d{15}$/.test(protocol) || !['100', '150'].includes(String(p?.status || code)) || String(p?.chave_nfe || '').replace(/^NFe/, '') !== key)
                return unknown('Autorização ainda sem protocolo completo de homologação verificável. Consulte novamente.');
            return { state: 'authorized', key, protocol, number: String(Number(key.slice(25, 34))), series: String(Number(key.slice(22, 25))), sefazCode: code, message, xmlPath: safeAssetPath(data.caminho_xml_nota_fiscal), danfePath: safeAssetPath(data.caminho_danfe), qrUrl: qr(data.qrcode_url) };
        }
        if (status === 'cancelado' && (d.key === key || (String(p?.ambiente) === '2' && p?.chave_nfe === key)) && /^\d{15}$/.test(String(data.numero_protocolo || '')) && ['135', '155'].includes(code))
            return { state: 'cancelled', key, cancelProtocol: String(data.numero_protocolo), sefazCode: code, message, cancelXmlPath: safeAssetPath(data.caminho_xml_cancelamento) };
        return unknown(message + ' Retorno exige conciliação fiscal; nenhuma autorização local foi presumida.');
    }
    async execute(d: GatewayDocument, kind: 'issue' | 'consult' | 'cancel', payload: Record<string, unknown>) {
        const token = this.token(d), route = d.model === '55' ? 'nfe' : 'nfce';
        let url = HOST + '/v2/' + route + (kind === 'issue' ? '?ref=' + encodeURIComponent(d.reference) : '/' + encodeURIComponent(d.reference) + (kind === 'consult' ? '?completa=1' : ''));
        const headers = { Authorization: 'Basic ' + Buffer.from(token + ':').toString('base64'), 'Content-Type': 'application/json', Accept: 'application/json' };
        try {
            const r = await this.transport(url, { method: kind === 'issue' ? 'POST' : kind === 'cancel' ? 'DELETE' : 'GET', headers, body: kind === 'consult' ? undefined : JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(10000) });
            let data = JSON.parse((await bounded(r, 262144)).toString('utf8'));
            if (kind === 'issue' && r.ok && data?.status === 'autorizado') {
                const full = await this.transport(HOST + '/v2/' + route + '/' + encodeURIComponent(d.reference) + '?completa=1', { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
                data = JSON.parse((await bounded(full, 262144)).toString('utf8'));
                return this.normalize(data, d, 'consult', token, full.status);
            }
            return this.normalize(data, d, kind, token, r.status);
        }
        catch {
            return { state: 'uncertain' as const, message: 'Sem retorno conclusivo do provedor. Consulte pela mesma referência antes de tentar qualquer nova emissão.' };
        }
    }
    async download(d: GatewayDocument, path: string, kind: 'xml' | 'danfe' | 'cancelXml') {
        const token = this.token(d), safe = safeAssetPath(path);
        if (!safe)
            throw new ServiceUnavailableException('Arquivo fiscal indisponível em origem permitida.');
        try {
            const r = await this.transport(HOST + safe, { headers: { Authorization: 'Basic ' + Buffer.from(token + ':').toString('base64') }, redirect: 'error', signal: AbortSignal.timeout(10000) });
            if (!r.ok)
                throw Error();
            const type = (r.headers.get('content-type') || '').split(';')[0]!;
            if (kind === 'danfe' ? !['application/pdf', 'text/html'].includes(type) : !['application/xml', 'text/xml', 'application/octet-stream'].includes(type))
                throw Error();
            return { bytes: await bounded(r, 5 * 1024 * 1024), type: type === 'text/html' ? 'application/octet-stream' : type };
        }
        catch {
            throw new ServiceUnavailableException('Não foi possível obter o arquivo fiscal no provedor.');
        }
    }
}
