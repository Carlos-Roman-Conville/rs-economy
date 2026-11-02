// Tunables. Every value here is marked proposed; a host overrides it from its own data. Nothing Rex has not decided
// is given a number: where he has not, the default is the rule that does nothing (price: base, wage: posted-median).
export function assertPriceRule(rule) {
    if (rule.kind === 'king-davenant-table' && !(rule.cap >= 5.5)) {
        throw new Error(`king-davenant-table cap ${rule.cap} must be at least 5.5`);
    }
}
export const TICK_ORDER = ['production', 'shipments', 'spoilage', 'consumption', 'prices', 'advance'];
export function defaultConfig() {
    return { priceRule: { kind: 'base' }, wageRule: { kind: 'posted-median' }, inputsAnyChoice: 'first-available', tickOrder: TICK_ORDER };
}
