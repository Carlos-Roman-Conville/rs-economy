// The command union and handlers (step 2): the catalogue, inventories, markets, stock moves, production, the tick.
// Every handler checks only this engine's invariants and throws without touching the caller's state.

import { simTime, transfer, TransferJournal } from '@rex/kernel'
import { goodsLedger } from './goods-ledger.ts'
import { adjust, finite, good, integer, inventory, market, marketGood, must, newId, nonempty, recipe, stockOf, type Ctx } from './context.ts'
import { availableUnits, consumeInputs } from './material.ts'
import { isCurrency, price as priceOf } from './queries.ts'
import type { MoneyLeg, GoodsLeg } from './providers.ts'
import type { Good, MarketMode, Recipe } from './state.ts'
import { tick } from './tick/index.ts'

export type CommandCause = { cause?: string }
export type Buy = CommandCause & { type: 'buy'; currency?: string; inventory: string; good: string; units: number; price?: number; priceMax?: number }
export type Sell = CommandCause & { type: 'sell'; currency?: string; inventory: string; good: string; units: number; price?: number; priceMin?: number }

export type TakeMass = CommandCause & { type: 'takeMass'; inventory: string; good: string; kg: number }
export type AddMass = CommandCause & { type: 'addMass'; inventory: string; good: string; kg: number }

export type Command = CommandCause & (
  | { type: 'defineCurrency'; currency: { id: string; issuer?: string | null; backing?: string | null } }
  | { type: 'exchange'; legs: { money?: MoneyLeg[]; goods?: GoodsLeg[] }; kind?: string; subject?: string | null; note?: string }
  | TakeMass
  | AddMass
  | { type: 'defineGood'; good: Good }
  | { type: 'defineRecipe'; recipe: Recipe }
  | { type: 'openInventory'; holder: string; market: string }
  | { type: 'openMarket'; id: string; mode: MarketMode }
  | { type: 'setMarketGood'; currency?: string; market: string; good: string; consumptionPerDay?: number | null; targetReserve?: number | null; productionPerDay?: number | null; basePrice?: number | null; perCapitaPerDay?: number | null }
  | { type: 'addStock'; inventory: string; good: string; units: number }      // the host seeds or imports stock
  | { type: 'removeStock'; inventory: string; good: string; units: number }   // the host's exit (a quest, a wreck); refused beyond stock
  | { type: 'moveStock'; from: string; to: string; good: string; units: number }
  | { type: 'produce'; inventory: string; recipe: string; units: number }     // Settlement's MaterialProvider.produce
  | { type: 'take'; inventory: string; good: string; units: number }         // Settlement's MaterialProvider.take
  | { type: 'openOrganisation'; name: string; kind?: string | null }
  | Sell   // inventory -> its market's stock; money market -> holder
  | Buy    // market's stock -> inventory; money holder -> market
  | { type: 'ship'; from: string; to: string; good: string; units: number; freight?: { payer: string; payee: string; amount: number } }
  | { type: 'tick' }
)

export function apply(ctx: Ctx, command: Command): void {
  switch (command.type) {
    case 'defineCurrency': return defineCurrency(ctx, command.currency)
    case 'exchange': return exchange(ctx, command)
    case 'defineGood': return defineGood(ctx, command.good)
    case 'defineRecipe': return defineRecipe(ctx, command.recipe)
    case 'openInventory': return openInventory(ctx, command.holder, command.market)
    case 'openMarket': return openMarket(ctx, command.id, command.mode)
    case 'setMarketGood': return setMarketGood(ctx, command)
    case 'addStock': return addStock(ctx, command.inventory, command.good, command.units)
    case 'removeStock': return removeStock(ctx, command.inventory, command.good, command.units)
    case 'moveStock': return moveStock(ctx, command.from, command.to, command.good, command.units)
    case 'produce': return produce(ctx, command.inventory, command.recipe, command.units)
    case 'take': return take(ctx, command.inventory, command.good, command.units)
    case 'takeMass': return transferMass(ctx, command)
    case 'addMass': return transferMass(ctx, command)
    case 'openOrganisation': return openOrganisation(ctx, command.name, command.kind ?? null)
    case 'sell': return trade(ctx, 'sell', command.inventory, command.good, command.units, command.price, command.priceMin, command.cause, command.currency)
    case 'buy': return trade(ctx, 'buy', command.inventory, command.good, command.units, command.price, command.priceMax, command.cause, command.currency)
    case 'ship': return ship(ctx, command.from, command.to, command.good, command.units, command.freight ?? null)
    case 'tick': return tick(ctx)
    default: throw new Error(`unknown command: ${(command as { type: string }).type}`)
  }
}

function defineGood(ctx: Ctx, def: Good): void {
  nonempty(def.id, 'good.id')
  if (Object.hasOwn(ctx.state.goods, def.id)) throw new Error(`good already defined: ${def.id}`)
  if (def.weight !== null) finite(def.weight, 'good.weight', 0)
  if ('food' in def && def.food !== null) nonempty(def.food, 'good.food')
  if (def.spoilagePerDay !== null) { finite(def.spoilagePerDay, 'good.spoilagePerDay', 0); if (def.spoilagePerDay > 1) throw new Error('good.spoilagePerDay must be <= 1') }
  ctx.state.goods[def.id] = { ...def }
  ctx.events.push({ type: 'goodDefined', good: def.id })
}

function defineRecipe(ctx: Ctx, def: Recipe): void {
  nonempty(def.id, 'recipe.id')
  if (Object.hasOwn(ctx.state.recipes, def.id)) throw new Error(`recipe already defined: ${def.id}`)
  if (def.output !== null) good(ctx, def.output)
  finite(def.yield, 'recipe.yield', 0)
  if (def.output !== null && def.yield <= 0) throw new Error('recipe.yield must be > 0 when the recipe has an output')
  for (const q of def.inputs) { good(ctx, q.good); finite(q.units, `input ${q.good} units`, 0) }
  for (const group of def.inputsAny) {
    if (!group.options.length) throw new Error('inputsAny group needs at least one option')
    for (const id of group.options) good(ctx, id)
    finite(group.units, 'inputsAny units', 0)
  }
  for (const q of def.byproducts) { good(ctx, q.good); finite(q.units, `byproduct ${q.good} units`, 0) }
  finite(def.rates.unitsPerFixtureDay, 'rates.unitsPerFixtureDay', 0)
  const workerDayField = 'labour' + 'PerUnit'
  if (workerDayField in def.rates) throw new Error(`labourPerUnit was replaced by labourHoursPerUnit, CONTRACTS §16`)
  finite(def.rates.labourHoursPerUnit, 'rates.labourHoursPerUnit', 0)
  if (def.minLevel !== null) finite(def.minLevel, 'recipe.minLevel', 0)
  ctx.state.recipes[def.id] = structuredClone(def)
  ctx.events.push({ type: 'recipeDefined', recipe: def.id })
}

function openInventory(ctx: Ctx, holder: string, marketId: string): void {
  nonempty(holder, 'holder')
  market(ctx, marketId)
  const id = newId(ctx, 'inv')
  ctx.state.inventories[id] = { id, holder, market: marketId, stock: {} }
  ctx.minted = id
  ctx.events.push({ type: 'inventoryOpened', inventory: id, holder, market: marketId })
}

function openMarket(ctx: Ctx, id: string, mode: MarketMode): void {
  nonempty(id, 'market.id')
  if (Object.hasOwn(ctx.state.markets, id)) throw new Error(`market already open: ${id}`)
  if (mode !== 'settlement' && mode !== 'abstract') throw new Error(`market mode must be settlement or abstract`)
  const inv = newId(ctx, 'inv')
  ctx.state.markets[id] = { id, mode, inventory: inv, goods: {} }
  ctx.state.inventories[inv] = { id: inv, holder: id, market: id, stock: {} }
  ctx.minted = id
  ctx.events.push({ type: 'marketOpened', market: id, mode, inventory: inv })
}

function setMarketGood(ctx: Ctx, cmd: Extract<Command, { type: 'setMarketGood' }>): void {
  const mkt = market(ctx, cmd.market)
  good(ctx, cmd.good)
  const currency = cmd.currency ?? 'money'
  if (!isCurrency(ctx.state, currency)) throw new Error(`unknown currency: ${currency}`)
  if (currency !== 'money') {
    for (const key of ['consumptionPerDay', 'targetReserve', 'productionPerDay', 'perCapitaPerDay'] as const) {
      if (key in cmd) throw new Error(`only basePrice may be set with currency: ${currency}`)
    }
    if (cmd.basePrice !== undefined) {
      if (cmd.basePrice !== null) finite(cmd.basePrice, 'basePrice', 0)
      const entry = marketGood(mkt, cmd.good)
      entry.basePrices ??= {}
      Object.defineProperty(entry.basePrices, currency, { value: cmd.basePrice, enumerable: true, writable: true, configurable: true })
    }
    ctx.events.push({ type: 'marketGoodSet', market: cmd.market, good: cmd.good })
    return
  }
  const entry = marketGood(mkt, cmd.good)
  for (const key of ['consumptionPerDay', 'targetReserve', 'productionPerDay', 'basePrice', 'perCapitaPerDay'] as const) {
    if (!(key in cmd)) continue
    const value = cmd[key]
    if (value === undefined) continue
    if (value !== null) finite(value, key, 0)
    entry[key] = value
  }
  ctx.events.push({ type: 'marketGoodSet', market: cmd.market, good: cmd.good })
}

function addStock(ctx: Ctx, invId: string, goodId: string, units: number): void {
  const inv = inventory(ctx, invId); good(ctx, goodId); finite(units, 'units', 0)
  adjust(ctx, inv, goodId, units, 'add')
}

function removeStock(ctx: Ctx, invId: string, goodId: string, units: number): void {
  const inv = inventory(ctx, invId); good(ctx, goodId); finite(units, 'units', 0)
  if (units > stockOf(inv, goodId)) throw new Error(`cannot remove ${units} ${goodId} from ${invId}: have ${stockOf(inv, goodId)}`)
  adjust(ctx, inv, goodId, -units, 'remove')
}

function moveStock(ctx: Ctx, fromId: string, toId: string, goodId: string, units: number): void {
  const from = inventory(ctx, fromId); const to = inventory(ctx, toId); good(ctx, goodId); finite(units, 'units', 0)
  if (fromId === toId) throw new Error('moveStock needs two different inventories')
  if (units > stockOf(from, goodId)) throw new Error(`cannot move ${units} ${goodId} from ${fromId}: have ${stockOf(from, goodId)}`)
  adjust(ctx, from, goodId, -units, `move>${toId}`)
  adjust(ctx, to, goodId, units, `move<${fromId}`)
}

/** CONTRACTS.md §4a: units is an integer >= 1, at most floor(available); inputs consumed, output and by-products added,
 *  the day's production recorded on the inventory's market. */
function produce(ctx: Ctx, invId: string, recipeId: string, units: number): void {
  const inv = inventory(ctx, invId)
  const def = recipe(ctx, recipeId)
  integer(units, 'units', 1)
  const can = availableUnits(ctx.state, invId, recipeId)
  if (units > Math.floor(can)) throw new Error(`cannot produce ${units} of ${recipeId} in ${invId}: inputs allow ${Math.floor(can)}`)
  consumeInputs(ctx, inv, def, units)
  let outputUnits = 0
  if (def.output !== null) {
    outputUnits = def.yield * units
    adjust(ctx, inv, def.output, outputUnits, `produce:${recipeId}`)
    marketGood(must(ctx.state.markets, inv.market, 'market'), def.output).producedToday += outputUnits
  }
  for (const q of def.byproducts) {
    if (q.units <= 0) continue
    adjust(ctx, inv, q.good, q.units * units, `byproduct:${recipeId}`)
    marketGood(must(ctx.state.markets, inv.market, 'market'), q.good).producedToday += q.units * units
  }
  ctx.events.push({ type: 'produced', inventory: invId, recipe: recipeId, units, output: def.output, outputUnits })
}

/** CONTRACTS.md §4a: take up to `units`, at most the stock; what was taken is in the result. */
function take(ctx: Ctx, invId: string, goodId: string, units: number): void {
  const inv = inventory(ctx, invId); good(ctx, goodId); finite(units, 'units', 0)
  const taken = Math.min(units, stockOf(inv, goodId))
  if (taken > 0) adjust(ctx, inv, goodId, -taken, 'take')
  ctx.taken = taken
}

function transferMass(ctx: Ctx, command: TakeMass | AddMass): void {
  const inv = inventory(ctx, command.inventory)
  const { weight } = good(ctx, command.good)
  finite(command.kg, 'kg', 0)
  if (weight === null || weight === 0) throw new Error('mass transfer requires a known positive good.weight')
  if (command.type === 'takeMass') {
    const held = stockOf(inv, command.good)
    if (command.cause !== undefined && held === 0) {
      ctx.takenKg = 0
      ctx.events.push({ type: 'refused', command: 'takeMass', reason: 'no-stock', price: null, units: command.kg, available: 0 })
      return
    }
    const takenKg = Math.min(command.kg, held * weight)
    // Use the exact held units when emptying stock to avoid division roundoff.
    const units = takenKg === held * weight ? held : takenKg / weight
    if (units > 0) adjust(ctx, inv, command.good, -units, 'takeMass')
    ctx.takenKg = takenKg
  } else {
    const units = command.kg / weight
    finite(units, 'mass transfer units', 0)
    adjust(ctx, inv, command.good, units, 'addMass')
  }
}

function openOrganisation(ctx: Ctx, name: string, kind: string | null): void {
  nonempty(name, 'name')
  const id = newId(ctx, 'org')
  ctx.state.organisations[id] = { id, name, kind, inventories: [] }
  ctx.minted = id
  ctx.events.push({ type: 'organisationOpened', organisation: id, name })
}

/** A sale or purchase between an inventory and its market's own stock, at the market's price today unless the host
 *  names one (CONTRACTS.md §7). Money moves through the ledger provider only (§3); the two holders are the inventory's
 *  holder and the market id. With no price on the market and none given, the trade is refused: a price is open, never invented. */
function trade(ctx: Ctx, side: 'sell' | 'buy', invId: string, goodId: string, units: number, given: number | undefined, limit: number | undefined, cause: string | undefined, currency = 'money'): void {
  const inv = inventory(ctx, invId); good(ctx, goodId); finite(units, 'units', 0)
  if (units === 0) throw new Error('units must be > 0')
  const mkt = market(ctx, inv.market)
  const stall = inventory(ctx, mkt.inventory)
  if (!isCurrency(ctx.state, currency)) throw new Error(`unknown currency: ${currency}`)
  if (currency !== 'money' && priceOf(ctx.state, ctx.config, mkt.id, goodId, currency) === null) {
    if (cause === undefined) throw new Error(`not accepted: ${currency} for ${goodId} in ${mkt.id}`)
    ctx.events.push({ type: 'refused', command: side, reason: 'not-accepted', price: null,
      currency, market: mkt.id, refusedBy: stall.holder })
    return
  }
  const unit = given ?? priceOf(ctx.state, ctx.config, mkt.id, goodId, currency)
  if (cause !== undefined) {
    if (limit !== undefined) finite(limit, side === 'buy' ? 'priceMax' : 'priceMin', 0)
    if (unit === null) {
      ctx.events.push({ type: 'refused', command: side, reason: 'no-price', price: null })
      return
    }
  }
  if (unit === null) throw new Error(`no price for ${goodId} in ${mkt.id}: set a basePrice or give one (open)`)
  finite(unit, 'price', 0)
  if (limit !== undefined) finite(limit, side === 'buy' ? 'priceMax' : 'priceMin', 0)
  const available = stockOf(side === 'sell' ? inv : stall, goodId)
  if (cause !== undefined && units > available) {
    ctx.events.push({ type: 'refused', command: side, reason: 'beyond-stock', price: unit, units, available })
    return
  }
  if (side === 'sell' && units > stockOf(inv, goodId)) throw new Error(`cannot sell ${units} ${goodId} from ${invId}: have ${stockOf(inv, goodId)}`)
  if (side === 'buy' && units > stockOf(stall, goodId)) throw new Error(`cannot buy ${units} ${goodId} in ${mkt.id}: the market has ${stockOf(stall, goodId)}`)
  if (limit !== undefined && (side === 'buy' ? unit > limit : unit < limit)) {
    ctx.events.push({ type: 'refused', command: side, reason: side === 'buy' ? 'price-above-limit' : 'price-below-limit', price: unit, limit })
    return
  }
  const selfTrade = inv.id === stall.id
  const moveSelf = () => {
    // Trading with the stall itself has no flow between holders; retain its existing events.
    adjust(ctx, inv, goodId, -units, side)
    adjust(ctx, inv, goodId, units, side)
  }
  const amount = unit * units
  const note = `${units} @ ${unit}`
  if (currency !== 'money') {
    if (!ctx.providers.ledger.exchange) throw new Error('ledger provider has no exchange (CONTRACTS §22)')
    const selling = side === 'sell'
    const txns = ctx.providers.ledger.exchange({
      money: [{ from: selling ? mkt.id : inv.holder, to: selling ? inv.holder : mkt.id, currency, amount }],
      ...(selfTrade ? {} : { goods: [{ from: selling ? inv.id : stall.id, to: selling ? stall.id : inv.id, good: goodId, units }] }),
    }, selling ? 'sale' : 'purchase', goodId, note, selfTrade ? undefined : goodsLedger(ctx, side))
    if (selfTrade) moveSelf()
    ctx.events.push({ type: selling ? 'sold' : 'bought', inventory: invId, market: mkt.id, good: goodId,
      units, price: unit, amount, txn: txns[0], currency })
    return
  }
  if (side === 'sell') {
    const txn = selfTrade
      ? ctx.providers.ledger.transfer(mkt.id, inv.holder, amount, 'sale', goodId, note)
      : ctx.providers.ledger.transfer(mkt.id, inv.holder, amount, 'sale', goodId, note,
        { ledger: goodsLedger(ctx, 'sell'), from: inv.id, to: stall.id, good: goodId, units })
    if (selfTrade) moveSelf()
    ctx.events.push({ type: 'sold', inventory: invId, market: mkt.id, good: goodId, units, price: unit, amount, txn })
  } else {
    const txn = selfTrade
      ? ctx.providers.ledger.transfer(inv.holder, mkt.id, amount, 'purchase', goodId, note)
      : ctx.providers.ledger.transfer(inv.holder, mkt.id, amount, 'purchase', goodId, note,
        { ledger: goodsLedger(ctx, 'buy'), from: stall.id, to: inv.id, good: goodId, units })
    if (selfTrade) moveSelf()
    ctx.events.push({ type: 'bought', inventory: invId, market: mkt.id, good: goodId, units, price: unit, amount, txn })
  }
}

/** Goods leave `from` now and reach `to` after the host map's travel days; in transit they are in no inventory (E10).
 *  Freight, if any, is the host's figure, paid now through the ledger (kind `freight`). An unreachable pair is refused. */
function ship(ctx: Ctx, fromId: string, toId: string, goodId: string, units: number, freight: { payer: string; payee: string; amount: number } | null): void {
  const from = inventory(ctx, fromId); const to = inventory(ctx, toId); good(ctx, goodId); finite(units, 'units', 0)
  if (units === 0) throw new Error('units must be > 0')
  if (fromId === toId) throw new Error('ship needs two different inventories')
  if (units > stockOf(from, goodId)) throw new Error(`cannot ship ${units} ${goodId} from ${fromId}: have ${stockOf(from, goodId)}`)
  const days = ctx.providers.transport.days(from.market, to.market)
  if (!Number.isFinite(days) || days < 0) throw new Error(`no route from ${from.market} to ${to.market}`)
  let freightTxn: string | null = null
  if (freight) {
    finite(freight.amount, 'freight.amount', 0)
    freightTxn = ctx.providers.ledger.transfer(freight.payer, freight.payee, freight.amount, 'freight', goodId, `${units} ${fromId}>${toId}`)
  }
  const id = newId(ctx, 'ship')
  const arrives = ctx.state.day + days
  ctx.state.shipments[id] = { id, from: fromId, to: toId, good: goodId, units, departed: ctx.state.day, arrives, status: 'transit' }
  const journal = new TransferJournal('economy.goods')
  const ledger = goodsLedger(ctx, `ship:${id}`)
  transfer(journal, {
    t: simTime(ctx.state.day * 86_400_000), process: 'economy.trade.shipment', quantity: goodId, unit: 'count', amount: units,
    from: { ledger, account: fromId }, to: { ledger, account: `shipment:${id}` },
  })
  ctx.minted = id
  ctx.events.push({ type: 'shipped', shipment: id, from: fromId, to: toId, good: goodId, units, arrives, freightTxn })
}

function defineCurrency(ctx: Ctx, def: { id: string; issuer?: string | null; backing?: string | null }): void {
  nonempty(def.id, 'currency.id')
  if (def.id === 'money') throw new Error('money is always a currency')
  if (isCurrency(ctx.state, def.id)) throw new Error(`currency already defined: ${def.id}`)
  if (def.backing != null) good(ctx, def.backing)
  ctx.state.currencies ??= {}
  Object.defineProperty(ctx.state.currencies, def.id, { value: { id: def.id, issuer: def.issuer ?? null,
    backing: def.backing ?? null }, enumerable: true, writable: true, configurable: true })
  ctx.events.push({ type: 'currencyDefined', currency: def.id })
}

function exchange(ctx: Ctx, command: Extract<Command, { type: 'exchange' }>): void {
  const money = command.legs.money ?? []
  const goods = command.legs.goods
  for (const leg of money) {
    if (!isCurrency(ctx.state, leg.currency)) throw new Error(`unknown currency: ${leg.currency}`)
    nonempty(leg.from, 'from'); nonempty(leg.to, 'to'); finite(leg.amount, 'amount', 0)
  }
  for (const leg of goods ?? []) {
    inventory(ctx, leg.from); inventory(ctx, leg.to); good(ctx, leg.good); finite(leg.units, 'units', 0)
  }
  if (!ctx.providers.ledger.exchange) throw new Error('ledger provider has no exchange (CONTRACTS §22)')
  // Project the ordered goods legs so repeated debits and earlier credits are checked before any money moves.
  const stocks = new Map<string, Map<string, number>>()
  for (const leg of goods ?? []) {
    const held = (id: string) => {
      if (!stocks.has(id)) stocks.set(id, new Map(Object.entries(inventory(ctx, id).stock)))
      return stocks.get(id)!
    }
    const from = held(leg.from); const to = held(leg.to)
    const available = from.get(leg.good) ?? 0
    if (leg.units > available) {
      if (command.cause === undefined) throw new Error(`cannot exchange ${leg.units} ${leg.good}: have ${available}`)
      ctx.events.push({ type: 'refused', command: 'exchange', reason: 'beyond-stock', price: null,
        units: leg.units, available })
      return
    }
    from.set(leg.good, available - leg.units)
    to.set(leg.good, (to.get(leg.good) ?? 0) + leg.units)
  }
  const txns = ctx.providers.ledger.exchange({ money, ...(goods ? { goods } : {}) }, command.kind ?? 'exchange',
    command.subject ?? null, command.note ?? '', goods ? goodsLedger(ctx, 'exchange') : undefined)
  ctx.events.push({ type: 'exchanged', money, goods, txns })
}
