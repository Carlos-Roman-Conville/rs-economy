import { describe, expect, it } from 'vitest'
import { buildDefaultFixtureJson, loadFixture, validateFixture } from './fixture.ts'

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
})
