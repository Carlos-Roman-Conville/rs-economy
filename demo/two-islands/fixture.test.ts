import { describe, expect, it } from 'vitest'
import {
  assetDefinitions,
  buildDefaultFixtureJson,
  loadFixture,
  seedRatePriors,
  validateFixture,
  validateRatePriors,
} from './fixture.ts'

describe('demo/two-islands fixture (design v2 §8, test fiction)', () => {
  it('loads the committed fixture.json', () => {
    const fixture = loadFixture()
    expect(fixture.seed).toBe(20261101)
    expect(fixture.label).toContain('test fiction')
    expect(Object.keys(fixture.minds)).toHaveLength(60)
  })

  it('rejects an endowment that names an unknown good', () => {
    const raw = buildDefaultFixtureJson()
    const minds = raw.minds as Record<string, Record<string, unknown>>
    minds['A.mind.01'].endowment = { ...minds['A.mind.01'].endowment as object, rum: 1 }
    expect(() => validateFixture(raw)).toThrow(/minds\.A\.mind\.01\.endowment\.rum: unknown good/)
  })

  it('rejects when an island has too few minds', () => {
    const raw = buildDefaultFixtureJson()
    const islands = raw.islands as Record<string, Record<string, unknown>>
    islands.A.mindIds = (islands.A.mindIds as string[]).slice(0, 10)
    expect(() => validateFixture(raw)).toThrow(/islands\.A\.mindIds: expected 20–50 minds/)
  })

  it('rejects a negative endowment', () => {
    const raw = buildDefaultFixtureJson()
    const minds = raw.minds as Record<string, Record<string, unknown>>
    minds['B.mind.02'].endowment = { ...minds['B.mind.02'].endowment as object, fish: -1 }
    expect(() => validateFixture(raw)).toThrow(/minds\.B\.mind\.02\.endowment\.fish: expected non-negative number/)
  })

  it('rejects a currency backed by an undefined good', () => {
    const raw = buildDefaultFixtureJson()
    raw.currencies = [{ id: 'B.crown', issuer: 'B.treasury', backing: 'silver' }]
    expect(() => validateFixture(raw)).toThrow(/currencies\[0\]\.backing: must name a defined good/)
  })

  it('rejects seeded acceptance on a mind record', () => {
    const raw = buildDefaultFixtureJson()
    const minds = raw.minds as Record<string, Record<string, unknown>>
    minds['A.mind.03'].acceptance = { gold: 1 }
    expect(() => validateFixture(raw)).toThrow(/minds\.A\.mind\.03\.acceptance/)
  })

  it('holds no acceptance, ratioMin or personality keys on any mind', () => {
    const fixture = loadFixture()
    const blob = JSON.stringify(fixture.minds)
    expect(blob).not.toMatch(/"acceptance"/)
    expect(blob).not.toMatch(/"ratioMin"/)
    expect(blob).not.toMatch(/"personality"/)
  })

  it('seedRatePriors is identical for the same seed and differs for another seed', () => {
    const fixture = loadFixture()
    const a = seedRatePriors(fixture, fixture.seed)
    const b = seedRatePriors(fixture, fixture.seed)
    const c = seedRatePriors(fixture, fixture.seed + 1)
    expect(a).toEqual(b)
    expect(c).not.toEqual(a)
  })

  it('seedRatePriors emits one row per mind and ordered asset pair with means in range', () => {
    const fixture = loadFixture()
    const rows = seedRatePriors(fixture, fixture.seed)
    expect(rows).toHaveLength(Object.keys(fixture.minds).length * 30)
    for (const row of rows) {
      expect(row.mean).toBeGreaterThanOrEqual(0.5)
      expect(row.mean).toBeLessThanOrEqual(2)
      expect(row.variance).toBe(4)
    }
  })

  it('refuses invalid ratePriors configuration fields', () => {
    const raw = buildDefaultFixtureJson()
    const goodIds = new Set((raw.goods as { id: string }[]).map((g) => g.id))
    const allowed = new Set([...goodIds, 'B.crown'])
    const base = raw.ratePriors as Record<string, unknown>

    expect(() => validateRatePriors({ ...base, mean: { ...(base.mean as object), low: 0 } }, allowed)).toThrow(
      /ratePriors\.mean\.low/,
    )
    expect(() => validateRatePriors({ ...base, mean: { ...(base.mean as object), high: 0.5 } }, allowed)).toThrow(
      /ratePriors\.mean\.high/,
    )
    expect(() => validateRatePriors({ ...base, variance: 0 }, allowed)).toThrow(/ratePriors\.variance/)
    expect(() => validateRatePriors({ ...base, assets: ['fish', 'rum'] }, allowed)).toThrow(/ratePriors\.assets\[1\]/)
  })

  it('assetDefinitions maps rate belief keys for every other listed asset', () => {
    const fixture = loadFixture()
    const defs = assetDefinitions(fixture)
    expect(defs).toHaveLength(6)
    const fish = defs.find((d) => d.id === 'fish')
    expect(fish?.rates?.timber).toEqual({ about: 'fish', attribute: 'rate:timber' })
    expect(fish?.rates?.fish).toBeUndefined()
  })

  it('holds no acceptance, ratioMin or personality anywhere in the fixture seed', () => {
    const fixture = loadFixture()
    const blob = JSON.stringify(fixture)
    expect(blob).not.toMatch(/"acceptance"/)
    expect(blob).not.toMatch(/"ratioMin"/)
    expect(blob).not.toMatch(/"personality"/)
  })
})
