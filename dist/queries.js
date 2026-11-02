// Pure reads over state. Prices follow config.priceRule (CONTRACTS.md §7: a config key until Rex chooses).
import { assertPriceRule } from "./config.js";
import { must } from "./context.js";
/** Kilograms represented by units of a good; null when its mass is unknown. */
export function massOf(state, good, units) {
    const { weight } = must(state.goods, good, 'good');
    return weight === null ? null : units * weight;
}
/** The host's mapping to a Life nutrition food id, if any. */
export function foodOf(state, good) {
    return must(state.goods, good, 'good').food ?? null;
}
export function stock(state, inventory, good) {
    const inv = state.inventories[inventory];
    if (!inv)
        throw new Error(`unknown inventory: ${inventory}`);
    return inv.stock[good] ?? 0;
}
/** Stock of a good for sale in a market (its own inventory). */
export function marketStock(state, market, good) {
    const mkt = state.markets[market];
    if (!mkt)
        throw new Error(`unknown market: ${market}`);
    return stock(state, mkt.inventory, good);
}
/** 0 when stock meets the target reserve, 1 when empty; null when the host has not set a reserve (open). */
export function shortage(state, market, good) {
    const entry = state.markets[market]?.goods[good];
    if (!entry || entry.targetReserve === null)
        return null;
    if (entry.targetReserve <= 0)
        return 0;
    return Math.max(0, Math.min(1, 1 - marketStock(state, market, good) / entry.targetReserve));
}
/** The price of a good in a market by the configured rule, computed now; null when the host has set no base price (open).
 *  The tick writes the same number to `MarketGood.price` once a day (step `prices`). */
export function price(state, config, market, good, currency = 'money') {
    const rule = config.priceRule;
    assertPriceRule(rule);
    const entry = state.markets[market]?.goods[good];
    const base = currency === 'money' ? entry?.basePrice
        : entry?.basePrices && Object.hasOwn(entry.basePrices, currency) ? entry.basePrices[currency] : null;
    if (base == null)
        return null;
    if (rule.kind === 'base')
        return base;
    const s = shortage(state, market, good) ?? 0;
    if (rule.kind === 'king-davenant-table') {
        if (s >= 0.5)
            return base * rule.cap;
        const multiples = [1, 1.3, 1.8, 2.6, 3.8, 5.5];
        const interval = Math.floor(s * 10);
        const fraction = s * 10 - interval;
        return base * (multiples[interval] + (multiples[interval + 1] - multiples[interval]) * fraction);
    }
    return base * (rule.low + (rule.high - rule.low) * s);
}
/** An inventory's value at its market's prices; goods with no price count 0 and are listed as unpriced. */
export function inventoryValue(state, config, inventory, currency = 'money') {
    const inv = state.inventories[inventory];
    if (!inv)
        throw new Error(`unknown inventory: ${inventory}`);
    let value = 0;
    const unpriced = [];
    for (const [good, units] of Object.entries(inv.stock)) {
        const p = price(state, config, inv.market, good, currency);
        if (p === null)
            unpriced.push(good);
        else
            value += p * units;
    }
    return { value, unpriced };
}
/** Yesterday's observed production of a good into a market (through `produce`). */
export function producedLast(state, market, good) {
    return state.markets[market]?.goods[good]?.producedLast ?? 0;
}
/** Units of a good still on the way, summed over shipments in transit. */
export function inTransit(state, good) {
    return Object.values(state.shipments).filter((s) => s.status === 'transit' && s.good === good).reduce((sum, s) => sum + s.units, 0);
}
/** Every unit of a good anywhere: inventories plus transit. Conserved by moves, sales and shipping (E10, E11). */
export function totalUnits(state, good) {
    const held = Object.values(state.inventories).reduce((sum, inv) => sum + (inv.stock[good] ?? 0), 0);
    return held + inTransit(state, good);
}
/** The accounting view (CONTRACTS.md §8): a pure read over the ledger provider's rows and the holder's inventories.
 *  Never state: the ledger stays the record. A row the holder both pays and receives counts on neither side. */
export function accounts(state, config, ledger, holder, fromDay, toDay, currency = 'money') {
    const out = { holder, fromDay, toDay, revenue: 0, purchases: 0, wages: 0, rent: 0, freight: 0, otherIn: 0, otherOut: 0, profit: 0, inventoryValue: 0, unpriced: [] };
    if (currency !== 'money')
        out.currency = currency;
    for (const row of ledger.rows(holder, fromDay, toDay)) {
        if ((row.currency ?? 'money') !== currency)
            continue;
        if (row.from === holder && row.to === holder)
            continue;
        if (row.to === holder) {
            if (row.kind === 'sale')
                out.revenue += row.amount;
            else
                out.otherIn += row.amount;
        }
        else if (row.from === holder) {
            if (row.kind === 'purchase')
                out.purchases += row.amount;
            else if (row.kind === 'wage')
                out.wages += row.amount;
            else if (row.kind === 'rent')
                out.rent += row.amount;
            else if (row.kind === 'freight')
                out.freight += row.amount;
            else
                out.otherOut += row.amount;
        }
    }
    out.profit = out.revenue + out.otherIn - (out.purchases + out.wages + out.rent + out.freight + out.otherOut);
    for (const inv of Object.values(state.inventories)) {
        if (inv.holder !== holder)
            continue;
        const v = inventoryValue(state, config, inv.id, currency);
        out.inventoryValue += v.value;
        for (const g of v.unpriced)
            if (!out.unpriced.includes(g))
                out.unpriced.push(g);
    }
    return out;
}
/** Currency membership is pure; money always exists. */
export function isCurrency(state, id) {
    return id === 'money' || Object.hasOwn(state.currencies ?? {}, id);
}
export function currencyProvider(get) {
    return { isCurrency: id => isCurrency(get(), id) };
}
const assetKey = (asset) => 'good' in asset ? `good:${asset.good}` : `currency:${asset.currency}`;
/** Completed fills only, in recorded order; both directions are expressed as b per a. */
export function ratios(state, market, a, b, fromDay, toDay) {
    return (state.trades ?? []).flatMap(t => {
        if (t.market !== market || t.day < fromDay || t.day > toDay)
            return [];
        if (assetKey(t.gave.asset) === assetKey(a) && assetKey(t.got.asset) === assetKey(b))
            return [{ day: t.day, ratio: t.got.units / t.gave.units, units: t.gave.units }];
        if (assetKey(t.got.asset) === assetKey(a) && assetKey(t.gave.asset) === assetKey(b))
            return [{ day: t.day, ratio: t.gave.units / t.got.units, units: t.got.units }];
        return [];
    });
}
export function mediaInUse(state, market, fromDay, toDay) {
    const counts = new Map();
    for (const t of state.trades ?? []) {
        if (t.market !== market || t.day < fromDay || t.day > toDay)
            continue;
        for (const asset of [t.gave.asset, t.got.asset]) {
            const key = assetKey(asset);
            const row = counts.get(key) ?? { asset: { ...asset }, trades: 0 };
            row.trades++;
            counts.set(key, row);
        }
    }
    return [...counts.values()].sort((a, b) => b.trades - a.trades || (assetKey(a.asset) < assetKey(b.asset) ? -1 : assetKey(a.asset) > assetKey(b.asset) ? 1 : 0));
}
