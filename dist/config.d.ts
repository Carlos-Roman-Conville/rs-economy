import type { WageRule } from './labour.ts';
export type PriceRule = {
    kind: 'base';
} | {
    kind: 'king-davenant-table';
    cap: number;
} | {
    kind: 'shortage-linear';
    low: number;
    high: number;
};
export type InputsAnyChoice = 'first-available';
export declare function assertPriceRule(rule: PriceRule): void;
export interface EconomyConfig {
    priceRule: PriceRule;
    wageRule: WageRule;
    inputsAnyChoice: InputsAnyChoice;
    tickOrder: readonly string[];
}
export declare const TICK_ORDER: readonly ["production", "shipments", "spoilage", "consumption", "prices", "advance"];
export declare function defaultConfig(): EconomyConfig;
