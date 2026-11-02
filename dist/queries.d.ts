import { type EconomyConfig } from './config.ts';
import type { LedgerProvider } from './providers.ts';
import type { Asset, EconomyState } from './state.ts';
/** Kilograms represented by units of a good; null when its mass is unknown. */
export declare function massOf(state: EconomyState, good: string, units: number): number | null;
/** The host's mapping to a Life nutrition food id, if any. */
export declare function foodOf(state: EconomyState, good: string): string | null;
export declare function stock(state: EconomyState, inventory: string, good: string): number;
/** Stock of a good for sale in a market (its own inventory). */
export declare function marketStock(state: EconomyState, market: string, good: string): number;
/** 0 when stock meets the target reserve, 1 when empty; null when the host has not set a reserve (open). */
export declare function shortage(state: EconomyState, market: string, good: string): number | null;
/** The price of a good in a market by the configured rule, computed now; null when the host has set no base price (open).
 *  The tick writes the same number to `MarketGood.price` once a day (step `prices`). */
export declare function price(state: EconomyState, config: EconomyConfig, market: string, good: string, currency?: string): number | null;
/** An inventory's value at its market's prices; goods with no price count 0 and are listed as unpriced. */
export declare function inventoryValue(state: EconomyState, config: EconomyConfig, inventory: string, currency?: string): {
    value: number;
    unpriced: string[];
};
/** Yesterday's observed production of a good into a market (through `produce`). */
export declare function producedLast(state: EconomyState, market: string, good: string): number;
/** Units of a good still on the way, summed over shipments in transit. */
export declare function inTransit(state: EconomyState, good: string): number;
/** Every unit of a good anywhere: inventories plus transit. Conserved by moves, sales and shipping (E10, E11). */
export declare function totalUnits(state: EconomyState, good: string): number;
export interface Accounts {
    currency?: string;
    holder: string;
    fromDay: number;
    toDay: number;
    revenue: number;
    purchases: number;
    wages: number;
    rent: number;
    freight: number;
    otherIn: number;
    otherOut: number;
    profit: number;
    inventoryValue: number;
    unpriced: string[];
}
/** The accounting view (CONTRACTS.md §8): a pure read over the ledger provider's rows and the holder's inventories.
 *  Never state: the ledger stays the record. A row the holder both pays and receives counts on neither side. */
export declare function accounts(state: EconomyState, config: EconomyConfig, ledger: LedgerProvider, holder: string, fromDay: number, toDay: number, currency?: string): Accounts;
/** Currency membership is pure; money always exists. */
export declare function isCurrency(state: EconomyState, id: string): boolean;
export declare function currencyProvider(get: () => EconomyState): {
    isCurrency(id: string): boolean;
};
/** Completed fills only, in recorded order; both directions are expressed as b per a. */
export declare function ratios(state: EconomyState, market: string, a: Asset, b: Asset, fromDay: number, toDay: number): {
    day: number;
    ratio: number;
    units: number;
}[];
export declare function mediaInUse(state: EconomyState, market: string, fromDay: number, toDay: number): {
    asset: Asset;
    trades: number;
}[];
