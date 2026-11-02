// The records (CONTRACTS.md §2). Plain JSON, versioned, no game meaning. Opaque strings are stored and compared,
// never interpreted: good ids, recipe ids, holders, market ids, skill and band ids, equipment ids.

import type { Counters } from './ids.ts'

export interface Good {
  id: string
  type: string | null          // base / specialty / cultural / money ... (open, Rex: GOODS.md Open 1-8); null = open
  weight: number | null        // kilograms per unit of the good; null = unknown
  food?: string | null         // Life nutrition food id; null/absent = not food or not mapped
  spoilagePerDay: number | null // fraction of stock lost per day; null = none known (step 3 reads it)
  legal: unknown               // host data; never interpreted here
}

export interface Quantity { good: string; units: number }
/** One of several inputs will do (GOODS.md "needs one of"): `units` of any listed good. */
export interface AnyOf { options: string[]; units: number }

export interface Rates {
  unitsPerFixtureDay: number   // output units one fixture of each needed kind allows per day
  labourHoursPerUnit: number   // person-hours per output unit; 0 = the line needs no labour
}

export interface Recipe {
  id: string
  output: string | null        // null for a service that makes no good
  yield: number                // output units per unit of the recipe (per "run")
  inputs: Quantity[]           // all needed, per unit of output
  inputsAny: AnyOf[]           // each group: one option will do, per unit of output
  byproducts: Quantity[]       // yielded alongside, per unit of output
  equipment: string[]          // fixture ids the host checks against the settlement (never consumed)
  skill: string | null         // opaque; the host's labour side reads these, this engine stores them
  band: string | null
  minLevel: number | null
  knowledge: string | null     // common / learned / foreign (GOODS.md 3f); opaque here
  rates: Rates
}

export interface Inventory {
  id: string
  holder: string               // the same opaque holder string Settlement uses
  market: string               // the market the inventory sits in
  stock: Record<string, number>
}

/** Rex's five numbers per good per settlement (ALIGNMENT §10); null = not set by the host (open), never a default. */
export interface MarketGood {
  consumptionPerDay: number | null
  targetReserve: number | null
  productionPerDay: number | null   // the planned rate for an abstract market; observed production is `producedLast`
  basePrice: number | null
  basePrices?: Record<string, number | null>
  perCapitaPerDay: number | null    // consumption per head per day, used with the population provider when consumptionPerDay is null
  price: number | null              // the price the tick last set by config.priceRule; null until a base price exists
  producedToday: number             // units produced into this market so far today (through `produce`, or an abstract market's rate)
  producedLast: number              // yesterday's total, rolled at tick
  consumedLast: number              // yesterday's consumption taken from the market's stock
  unmetLast: number                 // yesterday's demand the stock could not meet
}

export type MarketMode = 'settlement' | 'abstract'

export interface Market {
  offers?: Offer[]
  id: string                   // the settlement id the host gives, or an abstract port's id
  mode: MarketMode
  inventory: string            // the market's own stock (what is for sale), an Inventory id
  goods: Record<string, MarketGood>
}

/** Goods on the way between two inventories: in no market while in transit (E10). Travel days come from the host's map. */
export interface Shipment {
  id: string
  from: string                 // inventory id
  to: string                   // inventory id
  good: string
  units: number
  departed: number             // day
  arrives: number              // day; the tick lands it when state.day >= arrives
  status: 'transit' | 'arrived' | 'lost'
}

/** A company, guild or fleet: a holder that owns inventories (and later ships). The engine stores it, the host decides. */
export interface Organisation {
  id: string
  name: string
  kind: string | null          // opaque: company, guild, navy ...
  inventories: string[]
}

export interface Currency { id: string; issuer: string | null; backing: string | null }

export type Asset = { good: string } | { currency: string }
export interface AssetUnits { asset: Asset; units: number }
export interface Offer {
  id: string; by: string; inventory: string; give: AssetUnits; want: AssetUnits
  remaining: number; day: number; expires: number | null
}
export interface Trade {
  day: number; market: string; offer: string; maker: string; taker: string
  gave: AssetUnits; got: AssetUnits
}

export interface EconomyState {
  trades?: Trade[]
  currencies?: Record<string, Currency>
  version: 1
  day: number
  counters: Counters
  goods: Record<string, Good>
  recipes: Record<string, Recipe>
  inventories: Record<string, Inventory>
  markets: Record<string, Market>
  shipments: Record<string, Shipment>
  organisations: Record<string, Organisation>
  tickTrace: string[]          // the tick steps of the last day, in order
}

export function initialState(): EconomyState {
  return { version: 1, day: 0, counters: {}, goods: {}, recipes: {}, inventories: {}, markets: {}, shipments: {}, organisations: {}, tickTrace: [] }
}
