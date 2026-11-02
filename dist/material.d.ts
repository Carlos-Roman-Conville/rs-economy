import { type Ctx } from './context.ts';
import type { Runner } from './reduce.ts';
import type { EconomyState, Inventory, Rates, Recipe } from './state.ts';
/** Output units the inputs on hand allow; Infinity for a recipe with no inputs; may be fractional (the caller floors). */
export declare function availableUnits(state: EconomyState, inventoryId: string, recipeId: string): number;
/** Consume the inputs for `units` of the recipe. An inputsAny group draws by `config.inputsAnyChoice`
 *  ('first-available': the options in order until the need is met: proposed). The caller has checked availability. */
export declare function consumeInputs(ctx: Ctx, inv: Inventory, def: Recipe, units: number): void;
/** Settlement's MaterialProvider shape (its providers.ts), plus `rates` (CONTRACTS.md §13a). */
export interface MaterialProviderShape {
    available(inventory: string, recipe: string): number;
    produce(inventory: string, recipe: string, units: number): void;
    have(inventory: string, material: string): number;
    take(inventory: string, material: string, units: number): number;
    rates(recipe: string): Rates;
}
export declare function materialProvider(runner: Runner): MaterialProviderShape;
