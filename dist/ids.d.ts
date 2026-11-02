export { mint } from '@rex/kernel';
export declare const PREFIXES: readonly ["inv", "mkt", "ship", "ord", "org", "offer"];
export type Prefix = (typeof PREFIXES)[number];
export type Counters = Partial<Record<Prefix, number>>;
