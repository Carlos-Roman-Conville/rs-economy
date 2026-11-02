import type { Counters } from './ids.ts';
export interface Good {
    id: string;
    type: string | null;
    weight: number | null;
    food?: string | null;
    spoilagePerDay: number | null;
    legal: unknown;
}
export interface Quantity {
    good: string;
    units: number;
}
/** One of several inputs will do (GOODS.md "needs one of"): `units` of any listed good. */
export interface AnyOf {
    options: string[];
    units: number;
}
export interface Rates {
    unitsPerFixtureDay: number;
    labourHoursPerUnit: number;
}
export interface Recipe {
    id: string;
    output: string | null;
    yield: number;
    inputs: Quantity[];
    inputsAny: AnyOf[];
    byproducts: Quantity[];
    equipment: string[];
    skill: string | null;
    band: string | null;
    minLevel: number | null;
    knowledge: string | null;
    rates: Rates;
}
export interface Inventory {
    id: string;
    holder: string;
    market: string;
    stock: Record<string, number>;
}
/** Rex's five numbers per good per settlement (ALIGNMENT §10); null = not set by the host (open), never a default. */
export interface MarketGood {
    consumptionPerDay: number | null;
    targetReserve: number | null;
    productionPerDay: number | null;
    basePrice: number | null;
    basePrices?: Record<string, number | null>;
    perCapitaPerDay: number | null;
    price: number | null;
    producedToday: number;
    producedLast: number;
    consumedLast: number;
    unmetLast: number;
}
export type MarketMode = 'settlement' | 'abstract';
export interface Market {
    offers?: Offer[];
    id: string;
    mode: MarketMode;
    inventory: string;
    goods: Record<string, MarketGood>;
}
/** Goods on the way between two inventories: in no market while in transit (E10). Travel days come from the host's map. */
export interface Shipment {
    id: string;
    from: string;
    to: string;
    good: string;
    units: number;
    departed: number;
    arrives: number;
    status: 'transit' | 'arrived' | 'lost';
}
/** A company, guild or fleet: a holder that owns inventories (and later ships). The engine stores it, the host decides. */
export interface Organisation {
    id: string;
    name: string;
    kind: string | null;
    inventories: string[];
}
export interface Currency {
    id: string;
    issuer: string | null;
    backing: string | null;
}
export type Asset = {
    good: string;
} | {
    currency: string;
};
export interface AssetUnits {
    asset: Asset;
    units: number;
}
export interface Offer {
    id: string;
    by: string;
    inventory: string;
    give: AssetUnits;
    want: AssetUnits;
    remaining: number;
    day: number;
    expires: number | null;
}
export interface Trade {
    day: number;
    market: string;
    offer: string;
    maker: string;
    taker: string;
    gave: AssetUnits;
    got: AssetUnits;
}
export interface EconomyState {
    trades?: Trade[];
    currencies?: Record<string, Currency>;
    version: 1;
    day: number;
    counters: Counters;
    goods: Record<string, Good>;
    recipes: Record<string, Recipe>;
    inventories: Record<string, Inventory>;
    markets: Record<string, Market>;
    shipments: Record<string, Shipment>;
    organisations: Record<string, Organisation>;
    tickTrace: string[];
}
export declare function initialState(): EconomyState;
