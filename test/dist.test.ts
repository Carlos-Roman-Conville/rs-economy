// The compiled dist is what a consumer's node_modules gets (Node will not type-strip .ts under node_modules, CTRL-23).
// Run `npm run build` first; the gate also checks `git diff --quiet -- dist` after a build.
import { describe, expect, it } from 'vitest'
import * as src from '../src/index.ts'
import * as dist from '../dist/index.js'

// Node's fs, path, os and child_process without @types/node (the realism precedent).
interface Fs {
  mkdtempSync(prefix: string): string
  mkdirSync(p: string, o?: { recursive: boolean }): void
  cpSync(from: string, to: string, o: { recursive: boolean; dereference: boolean }): void
  writeFileSync(p: string, data: string): void
}
interface Path { join(...parts: string[]): string; resolve(...parts: string[]): string }
interface Os { tmpdir(): string }
interface ChildProcess { execFileSync(file: string, args: string[], o: { encoding: 'utf8'; cwd: string }): string }
const builtin = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown; execPath: string; cwd(): string } }).process
const fs = builtin.getBuiltinModule('node:fs') as Fs
const path = builtin.getBuiltinModule('node:path') as Path
const os = builtin.getBuiltinModule('node:os') as Os
const cp = builtin.getBuiltinModule('node:child_process') as ChildProcess

const root = path.resolve(builtin.cwd())

// One day of a three-ports-style world: two goods, two ports, a company with a store, a buy, a ship, a tick.
const COMMANDS = [
  { type: 'defineGood', good: { id: 'grain', type: null, weight: null, spoilagePerDay: 0.01, legal: null } },
  { type: 'defineGood', good: { id: 'timber', type: null, weight: null, spoilagePerDay: null, legal: null } },
  { type: 'openMarket', id: 'port.north', mode: 'abstract' },
  { type: 'openMarket', id: 'port.east', mode: 'abstract' },
  { type: 'setMarketGood', market: 'port.north', good: 'grain', productionPerDay: 30, consumptionPerDay: 10, targetReserve: 100, basePrice: 2 },
  { type: 'setMarketGood', market: 'port.east', good: 'grain', productionPerDay: 0, consumptionPerDay: 12, targetReserve: 100, basePrice: 2 },
  { type: 'setMarketGood', market: 'port.north', good: 'timber', productionPerDay: 0, consumptionPerDay: 6, targetReserve: 60, basePrice: 4 },
  { type: 'setMarketGood', market: 'port.east', good: 'timber', productionPerDay: 20, consumptionPerDay: 5, targetReserve: 60, basePrice: 4 },
  { type: 'tick' },
]

const replacer = (_k: string, v: unknown): unknown => (v instanceof Map ? { map: [...v.entries()] } : v instanceof Set ? { set: [...v.values()] } : v)

function runDay(lib: { Runner: typeof src.Runner }): string {
  const runner = new lib.Runner()
  for (const c of COMMANDS) runner.run(c as src.Command)
  return JSON.stringify({ state: runner.state, log: runner.log }, replacer)
}

describe('dist', () => {
  it('exports the same runtime names as src', () => {
    expect(Object.keys(dist).sort()).toEqual(Object.keys(src).sort())
  })

  it('runs under plain node from a node_modules install and matches src', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'economy-dist-'))
    const install = path.join(tmp, 'node_modules', '@rex', 'economy')
    const kernel = path.join(tmp, 'node_modules', '@rex', 'kernel')
    fs.mkdirSync(install, { recursive: true })
    fs.mkdirSync(kernel, { recursive: true })
    fs.cpSync(path.join(root, 'package.json'), path.join(install, 'package.json'), { recursive: false, dereference: true })
    fs.cpSync(path.join(root, 'dist'), path.join(install, 'dist'), { recursive: true, dereference: true })
    const kernelHome = path.join(root, 'node_modules', '@rex', 'kernel')
    for (const part of ['package.json', 'dist', 'data']) {
      try { fs.cpSync(path.join(kernelHome, part), path.join(kernel, part), { recursive: true, dereference: true }) } catch { /* optional part */ }
    }
    const script = path.join(tmp, 'run.mjs')
    fs.writeFileSync(script, `import { Runner } from '@rex/economy'
const commands = ${JSON.stringify(COMMANDS)}
const replacer = ${replacer.toString()}
const runner = new Runner()
for (const c of commands) runner.run(c)
process.stdout.write(JSON.stringify({ state: runner.state, log: runner.log }, replacer))
`)
    const out = cp.execFileSync(builtin.execPath, [script], { encoding: 'utf8', cwd: tmp })
    expect(out).toBe(runDay(src))
    expect(runDay(dist)).toBe(runDay(src))
  })
})
