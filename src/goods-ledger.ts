// Buy/sell's goods leg travels in the money call (CONTRACTS §20); shipments keep their own transfer.
// Production inputs/outputs, spoilage, market consumption, take, takeMass, addMass and addStock
// are not transfers between two holders and keep adjust; mass conversion stays with the mass commands.
import type { TransferLedger } from '@rex/kernel'
import { adjust, good, inventory, must, type Ctx } from './context.ts'

export function goodsLedger(ctx: Ctx, reason: string): TransferLedger {
  const shipment = (account: string) => must(ctx.state.shipments, account.slice('shipment:'.length), 'shipment')
  return {
    id: 'economy.goods',
    unit(account, quantity) {
      good(ctx, quantity)
      if (account.startsWith('shipment:')) shipment(account)
      else inventory(ctx, account)
      return 'count'
    },
    apply(account, quantity, delta) {
      good(ctx, quantity)
      if (account.startsWith('shipment:')) {
        const record = shipment(account)
        if (record.status !== 'transit' || record.good !== quantity || Math.abs(delta) !== record.units) {
          throw new Error(`shipment transfer does not match ${record.id}`)
        }
        // The record holds the units already; dispatch/arrival owns its lifecycle.
        return
      }
      adjust(ctx, inventory(ctx, account), quantity, delta, reason)
    },
    snapshot() {
      return structuredClone({ inventories: ctx.state.inventories, events: ctx.events.length })
    },
    restore(snapshot) {
      const saved = snapshot as { inventories: Ctx['state']['inventories']; events: number }
      ctx.state.inventories = saved.inventories
      ctx.events.length = saved.events
    },
  }
}
