import { adjust, good, inventory, must } from "./context.js";
export function goodsLedger(ctx, reason) {
    const shipment = (account) => must(ctx.state.shipments, account.slice('shipment:'.length), 'shipment');
    return {
        id: 'economy.goods',
        unit(account, quantity) {
            good(ctx, quantity);
            if (account.startsWith('shipment:'))
                shipment(account);
            else
                inventory(ctx, account);
            return 'count';
        },
        apply(account, quantity, delta) {
            good(ctx, quantity);
            if (account.startsWith('shipment:')) {
                const record = shipment(account);
                if (record.status !== 'transit' || record.good !== quantity || Math.abs(delta) !== record.units) {
                    throw new Error(`shipment transfer does not match ${record.id}`);
                }
                // The record holds the units already; dispatch/arrival owns its lifecycle.
                return;
            }
            adjust(ctx, inventory(ctx, account), quantity, delta, reason);
        },
        snapshot() {
            return structuredClone({ inventories: ctx.state.inventories, events: ctx.events.length });
        },
        restore(snapshot) {
            const saved = snapshot;
            ctx.state.inventories = saved.inventories;
            ctx.events.length = saved.events;
        },
    };
}
