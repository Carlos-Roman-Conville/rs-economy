// Ids (CONTRACTS.md §10): Economy mints inv, mkt, ship, ord, org with a counter per prefix. Stable, never reused,
// deterministic on replay. Every other id (goods, recipes, holders, settlements, roles) is the host's, opaque.
// The minting itself is the Kernel's; Economy keeps its prefixes and the lazily keyed counters.

export { mint } from '@rex/kernel'

export const PREFIXES = ['inv', 'mkt', 'ship', 'ord', 'org'] as const
export type Prefix = (typeof PREFIXES)[number]
export type Counters = Partial<Record<Prefix, number>>
