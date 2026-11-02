import type { EconomyConfig } from './config.ts';
import type { LabourSupply, SettlementReader } from './providers.ts';
export type WageRule = {
    kind: 'posted-median';
} | {
    kind: 'ratio';
    elasticity: number;
    floor: number;
    ceiling: number;
};
export interface WageQuote {
    market: string;
    role: string;
    day: number;
    posts: number;
    filled: number;
    demandHours: number;
    supplyHours: number;
    median: number | null;
    quote: number | null;
    rule: WageRule['kind'];
}
export declare function wageQuote(config: EconomyConfig, reader: SettlementReader, labour: LabourSupply, market: string, role: string, day: number, sources: readonly string[]): WageQuote;
/** Quotes for every role that has a post in the market. */
export declare function wageQuotes(config: EconomyConfig, reader: SettlementReader, labour: LabourSupply, market: string, day: number, sources: readonly string[]): WageQuote[];
