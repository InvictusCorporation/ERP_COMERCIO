export type MarketSector = {
    id: string;
    unitId: string;
    name: string;
    active: boolean;
    version: number;
};
export type MarketProduct = {
    id: string;
    code: string;
    name: string;
    baseUnit: string;
    price: string;
    lotTracked: boolean;
    profile: {
        id: string;
        sectorId: string;
        sectorName: string;
        weighted: boolean;
        plu: string | null;
        version: number;
    } | null;
};
export type MarketScale = {
    id: string;
    unitId: string;
    name: string;
    model: string;
    mode: 'manual_kg' | 'ean13_weight';
    prefix: string | null;
    capacity: string;
    resolution: string;
    active: boolean;
    reviewed: boolean;
    version: number;
};
export type WeightPart = {
    source: 'manual';
    gross: string;
    tare: string;
} | {
    source: 'label';
    barcode: string;
};
export type WeightMeasurement = WeightPart | {
    source: 'combined';
    parts: WeightPart[];
};
export type WeighedLabel = {
    productId: string;
    quantity: string;
    price: string;
    barcode: string;
    source: 'label';
};
export type MarketWeighing = {
    id: string;
    productId: string;
    scaleId: string;
    lotId: string | null;
    gross: string;
    tare: string;
    net: string;
    price: string;
    total: string;
    barcode: string | null;
    source: 'manual';
    actorName: string;
    createdAt: string;
    snapshot: {
        productName: string;
        productCode: string;
        plu: string;
        scaleName: string;
        scaleModel: string;
        lotCode: string | null;
        expiresOn: string | null;
        manufacturedOn: string | null;
        format: string;
        prefix: string | null;
    };
};
export type RecipeIngredient = {
    productId: string;
    quantity: string;
    name?: string;
    code?: string;
    baseUnit?: string;
};
export type MarketRecipe = {
    id: string;
    sectorId: string;
    name: string;
    outputProductId: string;
    outputName: string;
    outputUnit: string;
    yieldQuantity: string;
    ingredients: RecipeIngredient[];
    notes: string;
    active: boolean;
    reviewed: boolean;
    version: number;
};
export type ProductionInput = {
    id: string;
    productId: string;
    name: string;
    code: string;
    baseUnit: string;
    quantity: string;
    movementId: string;
    cost: string;
    lots: {
        lotId: string;
        code: string;
        expiresOn: string;
        quantity: string;
    }[];
};
export type MarketRun = {
    id: string;
    recipeId: string;
    recipeVersion: number;
    status: 'confirmed' | 'reversed';
    factor: string;
    outputProductId: string;
    expectedQuantity: string;
    actualQuantity: string;
    totalCost: string;
    inputItems: ProductionInput[];
    outputLotId: string;
    lotCode: string;
    expiresOn: string;
    reason: string;
    actorName: string;
    createdAt: string;
    reversedAt: string | null;
    reversedBy: string | null;
    reversalReason: string | null;
    snapshot: {
        recipeName: string;
        recipeNotes: string;
        outputName: string;
        outputCode: string;
        outputUnit: string;
        yieldLoss: string;
    };
};
export type MarketOverview = {
    unitId: string | null;
    today: string;
    canManage: boolean;
    summary: {
        sectors: number;
        weighedProducts: number;
        scales: number;
        weighings: number;
        runs: number;
    };
};
export type MarketPage<T> = {
    items: T[];
    page: number;
    total: number;
};
export function quantityMilli(value: string): bigint { if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(value))
    throw Error('Informe quantidade com até três casas decimais.'); const [a, b = ''] = value.split('.'); return BigInt(a!) * 1000n + BigInt((b + '000').slice(0, 3)); }
export function quantityText(value: bigint): string { if (value < 0n)
    throw Error('Quantidade negativa.'); return (String(value / 1000n) + '.' + String(value % 1000n).padStart(3, '0')).replace(/\.?0+$/, '') || '0'; }
export function weighedTotal(quantity: string, price: string): string { if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(price))
    throw Error('Preço inválido.'); const [a, b = ''] = price.split('.'), cents = BigInt(a!) * 100n + BigInt((b + '00').slice(0, 2)), value = (quantityMilli(quantity) * cents + 500n) / 1000n; return String(value / 100n) + '.' + String(value % 100n).padStart(2, '0'); }
export function internalWeightCode(prefix: string, plu: string, net: string): string { const q = quantityMilli(net); if (!/^2\d$/.test(prefix) || !/^\d{5}$/.test(plu) || plu === '00000' || q <= 0n || q > 99999n)
    throw Error('Formato ou peso fora do limite.'); const raw = prefix + plu + String(q).padStart(5, '0'); let sum = 0; for (let i = 0; i < 12; i++)
    sum += Number(raw[i]) * (i % 2 === 0 ? 1 : 3); return raw + String((10 - sum % 10) % 10); }
export function ean13Pattern(code: string): string { if (!/^\d{13}$/.test(code))
    throw Error('EAN-13 inválido.'); let sum = 0; for (let i = 0; i < 12; i++)
    sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3); if ((10 - sum % 10) % 10 !== Number(code[12]))
    throw Error('Dígito inválido.'); const l = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'], parity = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']; const invert = (s: string) => s.replace(/[01]/g, c => c === '0' ? '1' : '0'); let bits = '101'; for (let i = 1; i <= 6; i++) {
    const p = l[Number(code[i])]!;
    bits += parity[Number(code[0])]![i - 1] === 'L' ? p : invert(p).split('').reverse().join('');
} bits += '01010'; for (let i = 7; i <= 12; i++)
    bits += invert(l[Number(code[i])]!); return bits + '101'; }
