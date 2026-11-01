import rawFixture from './fixture.json' with { type: 'json' }
import { categorical } from '../../../cognition/src/beliefs.ts'
import type { AssetDefinition, BeliefEntry, NeedDefinition } from '../../../cognition/src/types.ts'
import { validateLawData } from '../../../government/src/law/schema.ts'

const GOODS = ['fish', 'timber', 'grain', 'salt', 'gold'] as const
const MARKETS = ['A', 'B'] as const
const ASSETS = [...GOODS, 'B.crown'] as const
const MINDS_PER_ISLAND = 30

const FORBIDDEN_MIND_KEYS = ['acceptance', 'ratioMin', 'reservation', 'reservationRatio', 'personality'] as const

export interface FixtureGood {
  readonly id: string
  readonly type: string | null
  readonly kgPerUnit: number
  readonly spoilagePerDay: number | null
  readonly legal: unknown
}

export interface FixtureShip {
  readonly id: string
  readonly home: string
  readonly capacityUnits: number
}

export interface FixtureIsland {
  readonly market: string
  readonly organisation: string
  readonly stallBasePrice: Readonly<Record<string, null>>
  readonly mindIds: readonly string[]
}

export interface FixtureMind {
  readonly island: string
  readonly market: string
  readonly inventory: string
  readonly endowment: Readonly<Record<string, number>>
  readonly needs: readonly NeedDefinition[]
  readonly assets: readonly AssetDefinition[]
  readonly beliefs: { readonly entries: readonly BeliefEntry[] }
  readonly reliability: readonly { readonly speaker: string; readonly belief: { readonly alpha: number; readonly beta: number } }[]
}

export interface TwoIslandsFixture {
  readonly label: string
  readonly seed: number
  readonly phases: {
    readonly isolationDays: number
    readonly contactDays: number
    readonly route: { readonly from: string; readonly to: string; readonly travelDays: number; readonly lossProbability: number }
  }
  readonly goods: readonly FixtureGood[]
  readonly ships: readonly FixtureShip[]
  readonly islands: Readonly<Record<string, FixtureIsland>>
  readonly currencies: readonly { readonly id: string; readonly issuer: string; readonly backing: string }[]
  readonly government: {
    readonly treasury: Readonly<Record<string, { readonly gold: number }>>
    readonly laws: readonly unknown[]
  }
  readonly minds: Readonly<Record<string, FixtureMind>>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function beliefEntry(about: string, market: string): BeliefEntry {
  const belief = categorical(['yes', 'no'], [0.5, 0.5])
  return {
    about,
    attribute: `accepted@${market}`,
    belief,
    prior: belief,
    origin: 'ignorance',
  }
}

function expectedNeeds(): NeedDefinition[] {
  return [
    { id: 'hunger', category: 'body', source: { signal: 'hunger' }, setpoint: 0, weight: 1, salienceTags: [] },
    { id: 'shelter', category: 'body', source: { signal: 'shelter' }, setpoint: 0, weight: 1, salienceTags: [] },
    { id: 'preserve', category: 'body', source: { signal: 'preserve' }, setpoint: 0, weight: 1, salienceTags: [] },
  ]
}

function expectedAssets(): AssetDefinition[] {
  return [
    { id: 'fish', usefulness: { hunger: 1 } },
    { id: 'grain', usefulness: { hunger: 1 } },
    { id: 'timber', usefulness: { shelter: 1 } },
    { id: 'salt', usefulness: { preserve: 1 } },
    { id: 'gold', usefulness: {} },
    { id: 'B.crown', usefulness: {} },
  ]
}

function mindInventoryId(mindId: string, market: string): string {
  return `${mindId}@${market}`
}

export function validateFixture(raw: unknown): TwoIslandsFixture {
  if (!isObject(raw)) throw new Error('fixture: expected object')
  if (raw.label !== 'test fiction (design v2 §8), not pirate facts') throw new Error('label: expected test fiction label')

  const goodIds = new Set<string>()
  if (!Array.isArray(raw.goods)) throw new Error('goods: expected array')
  for (const item of raw.goods) {
    if (!isObject(item) || typeof item.id !== 'string') throw new Error('goods: expected good records with id')
    goodIds.add(item.id)
    if (typeof item.kgPerUnit !== 'number' || item.kgPerUnit < 0) {
      throw new Error(`goods.${item.id}.kgPerUnit: expected non-negative number`)
    }
  }
  for (const required of GOODS) {
    if (!goodIds.has(required)) throw new Error(`goods: missing ${required}`)
  }

  if (!Array.isArray(raw.ships) || raw.ships.length !== 1) throw new Error('ships: expected one ship record')
  const ship = raw.ships[0]
  if (!isObject(ship) || ship.id !== 'ship.1') throw new Error('ships[0].id: expected ship.1')

  if (!isObject(raw.islands)) throw new Error('islands: expected object')
  for (const islandId of ['A', 'B'] as const) {
    const island = raw.islands[islandId]
    if (!isObject(island)) throw new Error(`islands.${islandId}: expected island record`)
    if (!Array.isArray(island.mindIds)) throw new Error(`islands.${islandId}.mindIds: expected array`)
    const count = island.mindIds.length
    if (count < 20 || count > 50) throw new Error(`islands.${islandId}.mindIds: expected 20–50 minds, got ${count}`)
  }

  if (!isObject(raw.minds)) throw new Error('minds: expected object')
  for (const [mindId, mindRaw] of Object.entries(raw.minds)) {
    if (!isObject(mindRaw)) throw new Error(`minds.${mindId}: expected object`)
    for (const key of FORBIDDEN_MIND_KEYS) {
      if (key in mindRaw) throw new Error(`minds.${mindId}.${key}: seeded acceptance or reservation fields are forbidden`)
    }
    if (!isObject(mindRaw.endowment)) throw new Error(`minds.${mindId}.endowment: expected object`)
    for (const [asset, units] of Object.entries(mindRaw.endowment)) {
      if (typeof units !== 'number' || units < 0) {
        throw new Error(`minds.${mindId}.endowment.${asset}: expected non-negative number`)
      }
      if (!GOODS.includes(asset as typeof GOODS[number]) && asset !== 'B.crown') {
        throw new Error(`minds.${mindId}.endowment.${asset}: unknown good`)
      }
    }
    const text = JSON.stringify(mindRaw)
    if (/\bratioMin\b/.test(text)) throw new Error(`minds.${mindId}.ratioMin: reservation fields are forbidden`)
  }

  if (!Array.isArray(raw.currencies)) throw new Error('currencies: expected array')
  for (let i = 0; i < raw.currencies.length; i++) {
    const currency = raw.currencies[i]
    if (!isObject(currency) || typeof currency.backing !== 'string') {
      throw new Error(`currencies[${i}].backing: expected backing good id`)
    }
    if (!goodIds.has(currency.backing)) {
      throw new Error(`currencies[${i}].backing: must name a defined good`)
    }
  }

  if (!isObject(raw.government) || !Array.isArray(raw.government.laws)) {
    throw new Error('government.laws: expected array')
  }
  for (let i = 0; i < raw.government.laws.length; i++) {
    const failures = validateLawData(raw.government.laws[i])
    if (failures.length) throw new Error(`government.laws[${i}]: ${failures[0]}`)
  }

  return raw as unknown as TwoIslandsFixture
}

export function loadFixture(): TwoIslandsFixture {
  return validateFixture(rawFixture)
}

export function buildDefaultFixtureJson(): Record<string, unknown> {
  const needs = expectedNeeds()
  const assets = expectedAssets()
  const stallNulls = Object.fromEntries(GOODS.map((g) => [g, null]))

  const mindEndowmentA: Record<string, number> = { fish: 20, timber: 1, grain: 0, salt: 10, gold: 1 }
  const mindEndowmentB: Record<string, number> = { fish: 1, timber: 10, grain: 20, salt: 1, gold: 2, 'B.crown': 10 }

  const mindIdsA = Array.from({ length: MINDS_PER_ISLAND }, (_, i) => `A.mind.${String(i + 1).padStart(2, '0')}`)
  const mindIdsB = Array.from({ length: MINDS_PER_ISLAND }, (_, i) => `B.mind.${String(i + 1).padStart(2, '0')}`)
  const allMindIds = [...mindIdsA, ...mindIdsB]

  const minds: Record<string, unknown> = {}
  for (const islandId of ['A', 'B'] as const) {
    const mindIds = islandId === 'A' ? mindIdsA : mindIdsB
    const endowment = islandId === 'A' ? mindEndowmentA : mindEndowmentB
    for (const mindId of mindIds) {
      const entries = ASSETS.flatMap((asset) => MARKETS.map((market) => beliefEntry(asset, market)))
      const reliability = allMindIds
        .filter((other) => other !== mindId)
        .map((speaker) => ({ speaker, belief: { alpha: 1, beta: 1 } }))
      minds[mindId] = {
        island: islandId,
        market: islandId,
        inventory: mindInventoryId(mindId, islandId),
        endowment: { ...endowment },
        needs,
        assets,
        beliefs: { entries },
        reliability,
      }
    }
  }

  const lawBase = {
    issuer: 'B',
    enactment: 'event.enactment.b-crown-authority',
    jurisdiction: {
      authority: 'B',
      places: ['B'],
      persons: 'all',
      from: null,
      until: null,
      note: 'test fiction (design v2 §8): B.treasury may issue and mint B.crown against gold; no legal tender',
    },
    condition: { read: 'actor.office', op: 'eq', value: 'B.treasury' },
    exceptions: [],
    consequence: { kind: 'void' },
    enforcer: [],
    procedure: null,
    status: 'in-force',
    supersedes: [],
    sources: [{ key: 'b-crown-authority', title: 'Island B crown authority (test fiction)', year: null, locator: null }],
  }

  return {
    label: 'test fiction (design v2 §8), not pirate facts',
    seed: 20261101,
    phases: {
      isolationDays: 20,
      contactDays: 60,
      route: { from: 'A', to: 'B', travelDays: 2, lossProbability: 0.02 },
    },
    goods: GOODS.map((id) => ({
      id,
      type: null,
      kgPerUnit: 1,
      spoilagePerDay: null,
      legal: null,
    })),
    ships: [{ id: 'ship.1', home: 'A', capacityUnits: 200 }],
    islands: {
      A: { market: 'A', organisation: 'org.A', stallBasePrice: stallNulls, mindIds: mindIdsA },
      B: { market: 'B', organisation: 'org.B', stallBasePrice: stallNulls, mindIds: mindIdsB },
    },
    currencies: [{ id: 'B.crown', issuer: 'B.treasury', backing: 'gold' }],
    government: {
      treasury: { 'B.treasury': { gold: 200 } },
      laws: [
        {
          id: 'government/law.b-crown-issue',
          ...lawBase,
          modality: 'empower',
          regulated: { action: 'exercise:issue', object: 'any', power: 'issue' },
        },
        {
          id: 'government/law.b-crown-mint',
          ...lawBase,
          modality: 'empower',
          regulated: { action: 'exercise:mint', object: 'any', power: 'mint' },
        },
      ],
    },
    minds,
  }
}
