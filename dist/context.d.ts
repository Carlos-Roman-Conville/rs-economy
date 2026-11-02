import type { EconomyConfig } from './config.ts';
import type { EconomyEvent } from './events.ts';
import { type Prefix } from './ids.ts';
import type { Providers } from './providers.ts';
import type { EconomyState, Good, Inventory, Market, MarketGood, Recipe } from './state.ts';
export interface Ctx {
    state: EconomyState;
    config: EconomyConfig;
    providers: Providers;
    events: EconomyEvent[];
    minted: string | null;
    taken: number | null;
    takenKg?: number;
}
export declare function newId(ctx: Ctx, prefix: Prefix): string;
export { must, nonempty, finite, integer } from '@rex/kernel';
export declare const good: (ctx: Ctx, id: string) => Good;
export declare const recipe: (ctx: Ctx, id: string) => Recipe;
export declare const inventory: (ctx: Ctx, id: string) => Inventory;
export declare const market: (ctx: Ctx, id: string) => Market;
export declare function stockOf(inv: Inventory, goodId: string): number;
/** Change an inventory's stock; stock never goes negative (E1). A zero result removes the key so JSON stays small. */
export declare function adjust(ctx: Ctx, inv: Inventory, goodId: string, delta: number, reason: string): void;
export declare function marketGood(mkt: Market, goodId: string): MarketGood;
