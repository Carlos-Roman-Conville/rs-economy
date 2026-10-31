// The labour market (CONTRACTS.md §5): a quote per role per market from the posts Settlement shows (through the
// reader) and the person-hours the host's sources could supply. A pure query: Economy never writes a post, and whether a
// quote ever reaches Post.wage is Rex's (Settlement Q10). The rule is a config key; the default quotes the going
// rate with no pressure, which is the open state.

import type { EconomyConfig } from './config.ts'
import type { LabourSupply, SettlementReader } from './providers.ts'

export type WageRule =
  | { kind: 'posted-median' }                              // the median wage of the role's posts today; no pressure (the open state)
  | { kind: 'ratio'; elasticity: number; floor: number; ceiling: number }
    // median × clamp(1 + elasticity × (demand − supply) / max(demand, supply, 1), floor, ceiling): illustrative, NOT Rex's

export interface WageQuote {
  market: string
  role: string
  day: number
  posts: number            // posts of the role in the market (filled or not)
  filled: number
  demandHours: number     // hours requested by the role's posts
  supplyHours: number     // hours offered by the host's named sources
  median: number | null    // the posted median, null with no posts
  quote: number | null     // by the rule; null with no posts
  rule: WageRule['kind']
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function wageQuote(config: EconomyConfig, reader: SettlementReader, labour: LabourSupply, market: string, role: string, day: number, sources: readonly string[]): WageQuote {
  const rolePosts = reader.posts(market).filter((post) => post.role === role)
  const demandHours = rolePosts.reduce((sum, post) => sum + post.hours, 0)
  const supplyHours = sources.reduce((sum, source) => sum + labour.hours(source, role, day), 0)
  const med = median(rolePosts.map((post) => post.wage))
  const rule = config.wageRule
  let quote: number | null = med
  if (med !== null && rule.kind === 'ratio') {
    const pressure = (demandHours - supplyHours) / Math.max(demandHours, supplyHours, 1)
    quote = med * Math.min(rule.ceiling, Math.max(rule.floor, 1 + rule.elasticity * pressure))
  }
  return { market, role, day, posts: rolePosts.length, filled: rolePosts.filter((post) => post.filledBy !== null).length, demandHours, supplyHours, median: med, quote, rule: rule.kind }
}

/** Quotes for every role that has a post in the market. */
export function wageQuotes(config: EconomyConfig, reader: SettlementReader, labour: LabourSupply, market: string, day: number, sources: readonly string[]): WageQuote[] {
  const roles = [...new Set(reader.posts(market).map((post) => post.role))].sort()
  return roles.map((role) => wageQuote(config, reader, labour, market, role, day, sources))
}
