// Events the reducer returns. The host folds them; the engine never pushes.

export type Refused = { type: 'refused'; command: 'buy' | 'sell'; reason: 'price-above-limit' | 'price-below-limit'; price: number; limit: number; cause?: string }

export type EconomyEvent = { cause?: string } & (
  | Refused
  | { type: 'goodDefined'; good: string }
  | { type: 'recipeDefined'; recipe: string }
  | { type: 'inventoryOpened'; inventory: string; holder: string; market: string }
  | { type: 'marketOpened'; market: string; mode: string; inventory: string }
  | { type: 'marketGoodSet'; market: string; good: string }
  | { type: 'stockChanged'; inventory: string; good: string; delta: number; reason: string }
  | { type: 'produced'; inventory: string; recipe: string; units: number; output: string | null; outputUnits: number }
  | { type: 'spoiled'; inventory: string; good: string; units: number }
  | { type: 'consumed'; market: string; good: string; units: number; unmet: number }
  | { type: 'shortage'; market: string; good: string; stock: number; targetReserve: number; shortage: number }
  | { type: 'priceSet'; market: string; good: string; price: number; was: number | null }
  | { type: 'organisationOpened'; organisation: string; name: string }
  | { type: 'sold'; inventory: string; market: string; good: string; units: number; price: number; amount: number; txn: string }
  | { type: 'bought'; inventory: string; market: string; good: string; units: number; price: number; amount: number; txn: string }
  | { type: 'shipped'; shipment: string; from: string; to: string; good: string; units: number; arrives: number; freightTxn: string | null }
  | { type: 'arrived'; shipment: string; to: string; good: string; units: number }
  | { type: 'dayEnded'; day: number }
)
