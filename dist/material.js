// The material side (CONTRACTS.md §4a): how many output units an inventory's inputs allow for a recipe, how the
// inputs are consumed, and a MaterialProvider in Settlement's declared shape built over a Runner, so every call
// Settlement makes during its tick is a logged command and replays (E3). Nothing here imports Settlement; the shape
// is matched structurally.
import { adjust, stockOf } from "./context.js";
/** Output units the inputs on hand allow; Infinity for a recipe with no inputs; may be fractional (the caller floors). */
export function availableUnits(state, inventoryId, recipeId) {
    const inv = state.inventories[inventoryId];
    if (!inv)
        throw new Error(`unknown inventory: ${inventoryId}`);
    const def = state.recipes[recipeId];
    if (!def)
        throw new Error(`unknown recipe: ${recipeId}`);
    let units = Number.POSITIVE_INFINITY;
    for (const q of def.inputs)
        if (q.units > 0)
            units = Math.min(units, stockOf(inv, q.good) / q.units);
    for (const group of def.inputsAny) {
        if (group.units <= 0)
            continue;
        const pooled = group.options.reduce((sum, id) => sum + stockOf(inv, id), 0);
        units = Math.min(units, pooled / group.units);
    }
    return units;
}
/** Consume the inputs for `units` of the recipe. An inputsAny group draws by `config.inputsAnyChoice`
 *  ('first-available': the options in order until the need is met: proposed). The caller has checked availability. */
export function consumeInputs(ctx, inv, def, units) {
    for (const q of def.inputs)
        if (q.units > 0)
            adjust(ctx, inv, q.good, -q.units * units, `input:${def.id}`);
    for (const group of def.inputsAny) {
        let need = group.units * units;
        for (const id of group.options) {
            if (need <= 1e-9)
                break;
            const draw = Math.min(need, stockOf(inv, id));
            if (draw > 0) {
                adjust(ctx, inv, id, -draw, `inputAny:${def.id}`);
                need -= draw;
            }
        }
        if (need > 1e-9)
            throw new Error(`inputsAny group of ${def.id} short by ${need}`);
    }
}
export function materialProvider(runner) {
    return {
        available: (inventory, recipe) => availableUnits(runner.state, inventory, recipe),
        produce: (inventory, recipe, units) => { runner.run({ type: 'produce', inventory, recipe, units }); },
        have: (inventory, material) => {
            const inv = runner.state.inventories[inventory];
            if (!inv)
                throw new Error(`unknown inventory: ${inventory}`);
            return stockOf(inv, material);
        },
        take: (inventory, material, units) => runner.run({ type: 'take', inventory, good: material, units }).taken ?? 0,
        rates: (recipe) => {
            const def = runner.state.recipes[recipe];
            if (!def)
                throw new Error(`unknown recipe: ${recipe}`);
            return { ...def.rates };
        },
    };
}
