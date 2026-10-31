// Three ports, three goods, two companies (the first sim the pirate PLAN unit 37 asks for), with no game data: the
// names are placeholders and every number a fixture. Each company follows one written policy (an example's policy,
// not an engine rule): buy a good where the port has more than its reserve and ship it to the port whose shortage
// is worst, if the price there is higher. Prices follow the shortage-linear curve ONLY here, as an illustration.
// Run: npm run ports   (prints a day table of price and shortage per port and good)

import { defaultConfig, Runner, accounts, inTransit, marketStock, price as priceOf, shortage, stubProviders, totalUnits, type EconomyConfig, type Good } from '../src/index.ts'

const PORTS = ['port.north', 'port.east', 'port.south'] as const
const GOODS = ['grain', 'timber', 'cloth'] as const
const good = (id: string, over: Partial<Good> = {}): Good => ({ id, type: null, weight: null, spoilagePerDay: null, legal: null, ...over })

export interface DayRow { day: number; cells: Record<string, { price: number | null; shortage: number | null; stock: number }> }

export interface SimResult { rows: DayRow[]; state: unknown; balances: Record<string, number>; log: unknown[]; companies: string[] }

export interface SimOptions {
  /** Zero-based days, fromDay inclusive and toDay exclusive. */
  shock?: { port: string; good: string; fromDay: number; toDay: number; factor: number }
}

export function simulate(days = 30, config: EconomyConfig = { ...defaultConfig(), priceRule: { kind: 'shortage-linear', low: 0.7, high: 3 } }, options: SimOptions = {}): SimResult {
  const providers = stubProviders()
  providers.transport.set('port.north', 'port.east', 2)
  providers.transport.set('port.east', 'port.south', 3)
  providers.transport.set('port.north', 'port.south', 4)
  const runner = new Runner(undefined, config, providers)

  runner.run({ type: 'defineGood', good: good('grain', { spoilagePerDay: 0.01 }) })
  runner.run({ type: 'defineGood', good: good('timber') })
  runner.run({ type: 'defineGood', good: good('cloth') })
  for (const port of PORTS) runner.run({ type: 'openMarket', id: port, mode: 'abstract' })

  // The five numbers per port and good (fixtures). Each port makes one good and eats all three.
  const numbers: Record<string, Record<string, { production: number; consumption: number; reserve: number; base: number; stock: number }>> = {
    'port.north': { grain: { production: 30, consumption: 10, reserve: 100, base: 2, stock: 150 }, timber: { production: 0, consumption: 6, reserve: 60, base: 4, stock: 40 }, cloth: { production: 0, consumption: 3, reserve: 30, base: 9, stock: 20 } },
    'port.east': { grain: { production: 0, consumption: 12, reserve: 100, base: 2, stock: 60 }, timber: { production: 20, consumption: 5, reserve: 60, base: 4, stock: 120 }, cloth: { production: 0, consumption: 4, reserve: 30, base: 9, stock: 10 } },
    'port.south': { grain: { production: 0, consumption: 8, reserve: 100, base: 2, stock: 30 }, timber: { production: 0, consumption: 4, reserve: 60, base: 4, stock: 20 }, cloth: { production: 8, consumption: 2, reserve: 30, base: 9, stock: 60 } },
  }
  for (const port of PORTS) {
    for (const g of GOODS) {
      const n = numbers[port][g]
      runner.run({ type: 'setMarketGood', market: port, good: g, productionPerDay: n.production, consumptionPerDay: n.consumption, targetReserve: n.reserve, basePrice: n.base })
      runner.run({ type: 'addStock', inventory: runner.state.markets[port].inventory, good: g, units: n.stock })
    }
  }

  // Two companies, a store in every port, a purse each. Company A ships grain and timber, Company B cloth and grain.
  const companies = [
    { id: runner.run({ type: 'openOrganisation', name: 'Northern Company', kind: 'company' }).minted!, goods: ['grain', 'timber'] as string[], lot: 20 },
    { id: runner.run({ type: 'openOrganisation', name: 'Southern Company', kind: 'company' }).minted!, goods: ['cloth', 'grain'] as string[], lot: 10 },
  ]
  const stores: Record<string, Record<string, string>> = {}
  for (const c of companies) {
    stores[c.id] = {}
    for (const port of PORTS) stores[c.id][port] = runner.run({ type: 'openInventory', holder: c.id, market: port }).minted!
    providers.ledger.balances[c.id] = 500
  }

  const rows: DayRow[] = []
  const shock = options.shock
  if (shock && (!numbers[shock.port]?.[shock.good] || !Number.isInteger(shock.fromDay) || !Number.isInteger(shock.toDay)
    || shock.fromDay < 0 || shock.toDay <= shock.fromDay || !Number.isFinite(shock.factor) || shock.factor < 0)) {
    throw new Error('shock needs a known port/good, 0 <= fromDay < toDay (integer days), and a finite non-negative factor')
  }
  for (let day = 0; day < days; day++) {
    providers.ledger.day = day
    if (shock && (day === shock.fromDay || day === shock.toDay)) {
      const production = numbers[shock.port][shock.good].production
      runner.run({ type: 'setMarketGood', market: shock.port, good: shock.good,
        productionPerDay: production * (day === shock.fromDay ? shock.factor : 1) })
    }
    // Policy (example only): for each company and good, find the port with the most surplus over reserve and the
    // port with the worst shortage; if the shortage port pays more, buy one lot at the surplus port and ship it.
    for (const c of companies) {
      for (const g of c.goods) {
        const by = PORTS.map((p) => ({ p, surplus: marketStock(runner.state, p, g) - (numbers[p][g].reserve), short: shortage(runner.state, p, g) ?? 0, price: priceOf(runner.state, config, p, g) ?? 0 }))
        const from = [...by].sort((a, b) => b.surplus - a.surplus)[0]
        const to = [...by].sort((a, b) => b.short - a.short)[0]
        if (from.p === to.p || from.surplus < c.lot || to.short <= 0 || to.price <= from.price) continue
        if (providers.ledger.balance(c.id) < from.price * c.lot) continue
        runner.run({ type: 'buy', inventory: stores[c.id][from.p], good: g, units: c.lot })
        runner.run({ type: 'ship', from: stores[c.id][from.p], to: stores[c.id][to.p], good: g, units: c.lot })
      }
      // Sell whatever has landed, where it landed.
      for (const port of PORTS) {
        const inv = runner.state.inventories[stores[c.id][port]]
        for (const [g, units] of Object.entries(inv.stock)) if (units > 0) runner.run({ type: 'sell', inventory: inv.id, good: g, units })
      }
    }
    runner.run({ type: 'tick' })
    const cells: DayRow['cells'] = {}
    for (const port of PORTS) for (const g of GOODS) cells[`${port}/${g}`] = { price: runner.state.markets[port].goods[g].price, shortage: shortage(runner.state, port, g), stock: marketStock(runner.state, port, g) }
    rows.push({ day, cells })
  }
  return { rows, state: runner.state, balances: { ...providers.ledger.balances }, log: runner.log, companies: companies.map((c) => c.id) }
}

export function table(result: SimResult): string {
  const keys = Object.keys(result.rows[0].cells)
  const head = ['day', ...keys.map((k) => k.replace('port.', '').padStart(14))].join(' ')
  const lines = result.rows.map((row) => [String(row.day).padStart(3), ...keys.map((k) => {
    const c = row.cells[k]
    return `${(c.price ?? NaN).toFixed(2)}@${((c.shortage ?? 0) * 100).toFixed(0).padStart(3)}%`.padStart(14)
  })].join(' '))
  return [head, ...lines].join('\n')
}

const argv = (globalThis as unknown as { process?: { argv: string[] } }).process?.argv ?? []
if (argv[1] && /three-ports/.test(argv[1])) {
  const result = simulate(Number(argv[2] ?? 30))
  console.log(table(result))
  console.log('\nprice@shortage per port and good. In transit at the end:', GOODS.map((g) => `${g} ${inTransit(result.state as never, g).toFixed(1)}`).join(', '))
  console.log('company balances:', result.companies.map((id) => `${id} ${result.balances[id].toFixed(2)}`).join(', '))
  console.log('total grain anywhere:', totalUnits(result.state as never, 'grain').toFixed(1))
  void accounts
}
