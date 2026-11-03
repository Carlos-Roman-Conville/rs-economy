// One day, in the configured order (CONTRACTS.md §9: the host runs settlement.tick, then economy.tick(N)).
// Each step is a function here; the order is config. Nothing in a step is a game rule: every rate is host data
// on a good or a market good, and every formula is a config key.

import { simTime, transfer, TransferJournal } from '@rex/kernel'
import { goodsLedger } from '../goods-ledger.ts'
import { adjust, marketGood, must, type Ctx } from '../context.ts'
import { price as priceOf } from '../queries.ts'

type Step = (ctx: Ctx, journal: TransferJournal) => void

/** An abstract market adds its planned `productionPerDay` to its own stock (CONTRACTS.md §6); a settlement-run market
 *  produced through `produce` already. Then today's totals roll into `producedLast`. */
export function production(ctx: Ctx, journal = new TransferJournal('economy.goods')): void {
  for (const mkt of Object.values(ctx.state.markets)) {
    if (mkt.mode === 'abstract') {
      const inv = must(ctx.state.inventories, mkt.inventory, 'inventory')
      for (const [good, entry] of Object.entries(mkt.goods)) {
        if (entry.productionPerDay === null || entry.productionPerDay <= 0) continue
        const ledger = goodsLedger(ctx, 'abstract-production')
        transfer(journal, {
          t: simTime(ctx.state.day * 86_400_000), process: 'economy.abstract-production', quantity: good,
          unit: 'count', amount: entry.productionPerDay,
          from: { ledger, account: 'boundary:economy.abstract-production' }, to: { ledger, account: inv.id },
        })
        entry.producedToday += entry.productionPerDay
      }
    }
    for (const entry of Object.values(mkt.goods)) { entry.producedLast = entry.producedToday; entry.producedToday = 0 }
  }
}

/** Shipments whose day has come land in their destination inventory (E10). */
export function shipments(ctx: Ctx, journal = new TransferJournal('economy.goods')): void {
  for (const shipment of Object.values(ctx.state.shipments)) {
    if (shipment.status !== 'transit' || shipment.arrives > ctx.state.day) continue
    const to = must(ctx.state.inventories, shipment.to, 'inventory')
    const ledger = goodsLedger(ctx, `arrive:${shipment.id}`)
    if (shipment.units > 0) {
      transfer(journal, {
        t: simTime(ctx.state.day * 86_400_000), process: 'economy.trade.shipment', quantity: shipment.good,
        unit: 'count', amount: shipment.units,
        from: { ledger, account: `shipment:${shipment.id}` }, to: { ledger, account: to.id },
      })
    } else {
      // Fully spoiled cargo has no physical flow; preserve the existing zero-delta event.
      adjust(ctx, to, shipment.good, 0, `arrive:${shipment.id}`)
    }
    shipment.status = 'arrived'
    ctx.events.push({ type: 'arrived', shipment: shipment.id, to: shipment.to, good: shipment.good, units: shipment.units })
  }
}

/** Every inventory, and every shipment in transit, loses `spoilagePerDay` of each good that has one (E6). Goods with
 *  null spoil nothing (open). */
export function spoilage(ctx: Ctx, journal = new TransferJournal('economy.goods')): void {
  for (const shipment of Object.values(ctx.state.shipments)) {
    if (shipment.status !== 'transit') continue
    const rate = ctx.state.goods[shipment.good]?.spoilagePerDay ?? null
    if (rate === null || rate <= 0) continue
    const lost = shipment.units * rate
    shipment.units -= lost
    ctx.events.push({ type: 'spoiled', inventory: shipment.id, good: shipment.good, units: lost })
  }
  for (const inv of Object.values(ctx.state.inventories)) {
    for (const [good, units] of Object.entries(inv.stock)) {
      const rate = ctx.state.goods[good]?.spoilagePerDay ?? null
      if (rate === null || rate <= 0 || units <= 0) continue
      const lost = units * rate
      if (lost > 0) {
        const ledger = goodsLedger(ctx, 'spoilage')
        transfer(journal, {
          t: simTime(ctx.state.day * 86_400_000), process: 'economy.spoilage', quantity: good,
          unit: 'count', amount: lost,
          from: { ledger, account: inv.id }, to: { ledger, account: 'boundary:economy.spoilage' },
        })
      } else adjust(ctx, inv, good, -lost, 'spoilage')
      ctx.events.push({ type: 'spoiled', inventory: inv.id, good, units: lost })
    }
  }
}

/** Demand per market good: `consumptionPerDay` when the host set it, else headcount × `perCapitaPerDay` when both exist,
 *  else none (open). Demand draws the market's own stock; what it cannot meet is `unmet` (E5). After the draw, a
 *  market good below its target reserve raises a `shortage` event (E7). */
export function consumption(ctx: Ctx): void {
  const day = ctx.state.day
  for (const mkt of Object.values(ctx.state.markets)) {
    const inv = must(ctx.state.inventories, mkt.inventory, 'inventory')
    for (const [good, entry] of Object.entries(mkt.goods)) {
      let demand = entry.consumptionPerDay
      if (demand === null && entry.perCapitaPerDay !== null) demand = ctx.providers.population.headcount(mkt.id, day) * entry.perCapitaPerDay
      const have = inv.stock[good] ?? 0
      const taken = demand === null ? 0 : Math.min(demand, have)
      const unmet = demand === null ? 0 : demand - taken
      if (taken > 0) adjust(ctx, inv, good, -taken, 'consumption')
      entry.consumedLast = taken
      entry.unmetLast = unmet
      if (demand !== null) ctx.events.push({ type: 'consumed', market: mkt.id, good, units: taken, unmet })
      if (entry.targetReserve !== null && entry.targetReserve > 0) {
        const stock = inv.stock[good] ?? 0
        if (stock < entry.targetReserve) {
          ctx.events.push({ type: 'shortage', market: mkt.id, good, stock, targetReserve: entry.targetReserve, shortage: 1 - stock / entry.targetReserve })
        }
      }
    }
  }
}

/** Write today's price per market good by `config.priceRule` (E8); a good with no base price keeps null (E9). */
export function prices(ctx: Ctx): void {
  for (const mkt of Object.values(ctx.state.markets)) {
    for (const [good, entry] of Object.entries(mkt.goods)) {
      const next = priceOf(ctx.state, ctx.config, mkt.id, good)
      if (next === null) { entry.price = null; continue }
      if (next !== entry.price) ctx.events.push({ type: 'priceSet', market: mkt.id, good, price: next, was: entry.price })
      marketGood(mkt, good).price = next
    }
  }
}

export function advance(ctx: Ctx): void {
  ctx.events.push({ type: 'dayEnded', day: ctx.state.day })
  ctx.state.day += 1
}

export const STEPS: Record<string, Step> = { production, shipments, spoilage, consumption, prices, advance }

export function tick(ctx: Ctx): void {
  for (const mkt of Object.values(ctx.state.markets)) {
    if (mkt.offers) mkt.offers = mkt.offers.filter(offer => {
      if (offer.expires === null || offer.expires >= ctx.state.day) return true
      ctx.events.push({ type: 'offerWithdrawn', offer: offer.id, reason: 'expired' })
      return false
    })
  }
  const journal = new TransferJournal('economy.goods')
  ctx.state.tickTrace = []
  for (const name of ctx.config.tickOrder) {
    const step = STEPS[name]
    if (!step) throw new Error(`unknown tick step: ${name}`)
    step(ctx, journal)
    ctx.state.tickTrace.push(name)
  }
}
