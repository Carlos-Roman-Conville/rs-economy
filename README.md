# @rex/economy: the economy engine (contract stage, 2026-10-30)

A reusable economic simulation: goods and recipes as data, inventories, markets with Rex's five numbers per good
(stock, consumption per day, target reserve, production per day, base price), prices from supply and demand,
consumption, a labour market, trade and transport over a host-supplied network, organisations, and business
accounting. A reducer plus a daily tick, pure and replayable. **It imports nothing from any game or any other
engine**; the pirate game's goods, ports and companies (`Games/RPG's/pirate-ship/data/pirate-ship/economy/`) reach
it through an adapter. Modelled on `../realism` and `../settlement`. Rex placed it here on 2026-10-28
(ALIGNMENT §10); the engine family and its rules are in `../ENGINES.md`.

**Status: contract AGREED with Settlement 2026-10-30 (Settlement commit 2c4223c holds its §13 code); PLAN steps 2–10 built; step 11 waits on realism.** ENGINES.md requires the contract to be agreed before
either side implements production or labour. `CONTRACTS.md` is the agreed text.

## Read in this order

1. `../ENGINES.md`: owners, boundaries, the contracts to agree.
2. [CONTRACTS.md](CONTRACTS.md): who owns which record, what each side promises, the interfaces.
3. [PLAN.md](PLAN.md): the steps from contract to the thirty-day settlement benchmark, each with its tests.
4. [VALIDATION.md](VALIDATION.md): implemented / integrated / validated per mechanism, conservation and stability,
   findings, the validation units (PLATFORM.md §11a).

## Run

    npm install --offline      # vitest and typescript from the cache (the settlement lock file)
    npm test
    npm run typecheck
    npm run ports              # the three-port example, thirty days

## Built so far (step 2, 2026-10-30)

`src/`: the records (`state.ts`: goods, recipes with quantities and rates, inventories, markets with Rex's five
numbers per good), ids (`ids.ts`: inv, mkt, ship, ord, org), tunables (`config.ts`: `priceRule` defaults to `base`,
the open state; `inputsAnyChoice`; the tick order), the provider interfaces this engine asks of the host with
in-memory stubs (`providers.ts`: ledger, population, transport, the settlement reader), the command union and
handlers (`commands.ts`: defineGood, defineRecipe, openInventory, openMarket, setMarketGood, addStock, removeStock,
moveStock, produce, take, tick), the material side and Settlement's `MaterialProvider` shape over a `Runner`
(`material.ts`), the reducer and `Runner` with replay (`reduce.ts`), the tick (`tick/`: production roll-up,
advance), queries (`queries.ts`: stock, shortage, price by rule, inventory value). `test/engine.test.ts`: one
describe per TESTS.md E-row.

Steps 3–8 (the same day): spoilage, consumption (host numbers or headcount × per-capita), shortage events, daily
prices by `priceRule`, abstract-market production, organisations, `sell` / `buy` against a market at its price,
shipments over the host's travel days with in-transit spoilage, freight through the ledger, the accounting view
(`accounts`), the labour market (`labour.ts`: `wageQuote` by `wageRule`, default `posted-median`: no pressure), and
`examples/three-ports.ts` (three abstract ports, three goods, two companies with a written example policy;
`npm run ports` prints price@shortage per port and good over thirty days). 25 tests, E1–E14.

Steps 9–10 (the same day, in the pirate repo, commit 962702a): the adapter `web/src/economy/` (loader over the
pirate goods and recipes with host-supplied quantities, Settlement's material and price providers from this engine,
this engine's ledger provider from Settlement's ledger, the settlement reader, `runDay`) and the thirty-day
autonomous port benchmark, tests I1 and I2 beside the game's 385 others.

Not built: step 11, consumption from a realism population provider (waits on the body-and-world keeper); recipe
quantities as data (the balance lane's); the game's own use of the adapter.

## Marks

**(Rex)** his decision, restated. **(proposed)** this keeper's suggestion. **(open)** only Rex can answer; the
engine carries a config key or refuses meanwhile. No value is filled in silently.

## Scope added by Rex (2026-10-30; recorded, nothing built)

- **Burial services as resource flows:** coffins (a Carpentry good), burial labour (a service post), transport of
  the body, and burial land (a Settlement parcel use; the economy sees the fee and the labour, never the plot).
- **Waste management as resource flows:** refuse, night soil and offal as goods with negative or zero price that
  someone must carry away; their effect on health is Reality & Species' (sanitation, decomposition), the carrying
  and the fee are this engine's. Both land as recipes and services in the host's data when designed; see PLAN step 12.

`RESEARCH.md` holds the period values proposed for the economy's open rows in `STARTING_TOWN.md` (researched /
estimate / fiction).

## Boundaries (what is deliberately not here)

- Persons, skills and skill bands as attributes of people, population counts, nutrition: the host and `realism`.
- Premises, fixtures, posts, who fills them, construction, titles, leases: `settlement`.
- Laws, duties and taxes as rules, enforcement: the future Government engine; Economy only applies a rate it is
  handed.
- Any pirate fact: goods names, ports, companies, prices, the map.
