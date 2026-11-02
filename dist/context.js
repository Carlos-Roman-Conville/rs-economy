// The working context of one reduce call: a deep copy of the state (a throw leaves the caller's state untouched),
// the config, the providers and the events collected so far. Helpers every command and tick step share.
import { must } from '@rex/kernel';
import { mint } from "./ids.js";
export function newId(ctx, prefix) {
    const minted = mint(ctx.state.counters, prefix);
    ctx.state.counters = minted.counters;
    return minted.id;
}
export { must, nonempty, finite, integer } from '@rex/kernel';
export const good = (ctx, id) => must(ctx.state.goods, id, 'good');
export const recipe = (ctx, id) => must(ctx.state.recipes, id, 'recipe');
export const inventory = (ctx, id) => must(ctx.state.inventories, id, 'inventory');
export const market = (ctx, id) => must(ctx.state.markets, id, 'market');
export function stockOf(inv, goodId) {
    return inv.stock[goodId] ?? 0;
}
/** Change an inventory's stock; stock never goes negative (E1). A zero result removes the key so JSON stays small. */
export function adjust(ctx, inv, goodId, delta, reason) {
    const next = stockOf(inv, goodId) + delta;
    if (next < -1e-9)
        throw new Error(`stock of ${goodId} in ${inv.id} would go negative (${stockOf(inv, goodId)} ${delta})`);
    if (next <= 1e-9)
        delete inv.stock[goodId];
    else
        inv.stock[goodId] = next;
    ctx.events.push({ type: 'stockChanged', inventory: inv.id, good: goodId, delta, reason });
}
export function marketGood(mkt, goodId) {
    return (mkt.goods[goodId] ??= {
        consumptionPerDay: null, targetReserve: null, productionPerDay: null, basePrice: null, perCapitaPerDay: null, price: null,
        producedToday: 0, producedLast: 0, consumedLast: 0, unmetLast: 0,
    });
}
