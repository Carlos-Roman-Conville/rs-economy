# Tests: one row per rule (economy keeper, 2026-10-30)

Package tests (E) run with nothing of any game on disk, under vitest in this folder. Integration tests (I) run in
the pirate repo's `web/` beside the settlement adapter once PLAN step 9 exists. Every number in a setup is a fixture,
not a game rule.

## Package tests (`test/engine.test.ts`), step 2

| Id | Rule under test | Must hold |
|---|---|---|
| E1 | stock never goes negative | a move, removal or production beyond stock throws and the state is byte-identical to before; `take` returns at most the stock; no inventory holds a zero or negative entry |
| E2 | produce consumes inputs by the recipe's quantities and yields output and by-products | one log makes two planks and half a unit of sawdust; the market's `producedToday` rises by the output and rolls to `producedLast` at tick; an `inputsAny` group pools its options and draws the first available first (proposed); a recipe with no inputs is unlimited by materials; `units` must be an integer >= 1; the `MaterialProvider` over a `Runner` has Settlement's shape plus `rates` and logs every call |
| E2b | a recipe in worker-days is refused; person-hours pass through | worker-day fields are refused even alongside person-hours; finite non-negative person-hours are required; zero passes through; stored recipes, state and log remain byte-identical after provider reads |
| E3 | replay gives the same state | a day of commands replayed from the log is JSON-identical, ids included; prices and shortage read from the five numbers and read `null` where the host set nothing (never a default); `priceRule: base` returns the base price, a configured curve scales it |
| E4 | no import from outside the package | every import in `src/` is relative and stays inside `src/`; no spec names settlement, realism or pirate; an unknown command throws |
| E17 | one labour interface (CONTRACTS section 16) | `src/providers.ts` contains the section 16 TypeScript block verbatim after removing its two-space list indent |

## M — goods mass (CHAINS CG-19)

`test/mass.test.ts`

| Id | Rule under test | Must hold |
|---|---|---|
| M1 | takeMass conserves kilograms at the source | 3 kg removes six 0.5 kg units; source mass falls by exactly the reported 3 kg; taken stays null; market unchanged |
| M2 | takeMass is capped by stock | excess demand removes all stock and reports its mass; empty stock returns zero, never negative |
| M3 | mass round trip | adding 2 kg adds four units; taking 2 kg restores stock within 1e-12; market unchanged; other results omit takenKg |
| M4 | positive known weight required | null and zero weights refuse both commands with state and log untouched; massOf returns null or zero respectively |
| M5 | finite non-negative kilograms | negative, NaN and infinite kg refuse both commands with state and log untouched |
| M6 | optional Life food mapping | foodOf returns the mapped id or null; an absent food field leaves serialization unchanged |
| M7 | deterministic mass replay | a log containing both commands replays to byte-identical state |
| M8 | known inventory and good required | either unknown reference refuses both commands with state and log untouched |
| M9 | food mapping validation | a present food must be a non-empty string or null; invalid values leave state and log untouched |

## F — food into a body (CHAINS CG-19, CG-23; with Life)

`test/food-to-body.test.ts`

| Id | Rule under test | Must hold |
|---|---|---|
| F1 | inventory mass is the meal mass | inventory loses exactly takenKg; that exact quantity and foodOf mapping reach Life's eatMeal inside a kernel transaction |
| F2 | Life owns food energy | intake rises by table kcal times Life's absorbed fraction; nonzero food-to-waste and food-to-body trace energy balance gross energy within 1e-9 J using KCAL_J |
| F3 | only eatMeal delivers water and nutrients | takeMass leaves the body unchanged; eatMeal supplies table-derived water and absorbed vitamin C, with Life's nutrient trace and no other body writes |
| F4 | meals are capped by available stock | an oversized request eats takenKg, the whole stock mass; intake reflects available mass, never requested mass |
| F5 | failed meals restore both engines | after a committed meal, a transaction containing a successful meal then an unknown-body failure restores stock, full economy state/log/events, and Life's comparison snapshot |

## H — household holder (M1a-14, B0)

`test/household-holder.test.ts`

| Id | Rule under test | Must hold |
|---|---|---|
| H1 | opaque household holder opens inventory | `openInventory` with fixture `'household:h1'` sets `inventory.holder` to that exact string |
| H2 | mass take from household stock | fixture weight 0.5 kg/unit; `addStock` 4 units; `takeMass` 0.5 kg leaves stock 3 and `takenKg` 0.5 |
| H3 | holders do not share stock | person and household inventories on the same market; a change on one leaves the other's stock Δ = 0 |
| H4 | no access decision | `takeMass` without authorisation input succeeds; no event carries an authorisation field |
| H5 | replay (E3) | the same command log from a fresh `Runner` yields deep-equal state and events |

## Package tests (`test/markets.test.ts`), steps 3–4

| Id | Rule under test | Must hold |
|---|---|---|
| E5 | consumption draws the market's stock by the host's numbers | `consumptionPerDay` is taken each day; demand beyond stock is `unmet` and stock stops at zero; with no `consumptionPerDay`, demand is headcount × `perCapitaPerDay` from the population provider; neither set means no demand (open); an abstract market adds `productionPerDay` to its own stock, a settlement-run market does not |
| E6 | spoilage follows the good's rate in every inventory | a tenth a day is lost wherever the good lies; a good with `null` never spoils |
| E7 | a shortage event when stock falls under the target reserve | none while the reserve is met; one per day below it, carrying the shortage fraction |
| E8 | price moves with shortage by the configured curve | under `shortage-linear` the price rises as stock falls and returns to base when the reserve is met; a `priceSet` event per change |
| E9 | base price is data, never derived | no base price, no price under any rule; the default rule returns the base price unchanged; a negative base price is refused |

## Package tests (`test/trade.test.ts`), steps 5 and 7

| Id | Rule under test | Must hold |
|---|---|---|
| E10 | goods in transit are in no market | a shipment leaves its inventory at once, is in no inventory on the way, lands after the host map's days; total units are conserved; a pair with no route is refused; a perishable good spoils on the way |
| E11 | money is conserved across a sale | buying and selling move goods one way and money the other at the market's price (or the host's), through the ledger provider only; the sum of balances never changes; a trade with no price anywhere is refused (open); one beyond stock leaves the state untouched |
| E13 | accounting reconciles with the ledger | the view sums the holder's rows by kind (sale, purchase, wage, rent, freight, other), values its inventories at today's prices, and its profit equals the balance change; a day range filters the rows |

## Package tests (`test/labour-and-sim.test.ts`), steps 6 and 8

| Id | Rule under test | Must hold |
|---|---|---|
| E12 | the wage quote rises when demand hours exceed supply hours | the default rule (`posted-median`) quotes the role's posted median with no pressure (the open state) and nothing for a role with no posts; under the `ratio` rule the quote rises with more demand hours than supply hours, falls with more supply hours, stays within its floor and ceiling; posts demand 10 hours each and former worker counts supply 10 hours each, preserving the quote values |
| E14 | the three-port sim is deterministic | thirty days run twice give the same state, log and printed table; every price finite, no negative stock; the companies' purses and the ports' takings sum to what the companies started with; at least one shipment and one sale happened |

## Integration (`Games/RPG's/pirate-ship/web/src/economy/economy.test.ts`, steps 9–10; pirate commit 962702a)

| Id | Rule under test | Must hold |
|---|---|---|
| I1 | the port's butcher produces into an economy inventory through the material provider | one settlement day: Settlement's Q (four units of meat from one butcher, no labour left for the fish line) is the stock move the economy records, with by-products; every provider call Settlement made is a logged economy command and the day replays; the reader sees the settlement's businesses, posts, production for that day only, and fixtures; the price provider answers for goods and refuses property (open); the ledger provider is Settlement's ledger |
| I1b | a project draws from its own inventory (CONTRACTS §15, DUP-44) | materials leave the economy inventory behind the project's `inventory` ref, the project's wage is one ledger row from its `account`, and the account is never resolved as an inventory |
| I1c | the material queries are pure (CONTRACTS §17) | `available` and `have` on an unseen inventory ref change no state and log nothing; `take` still opens the inventory |
| I4a | the default wage rule issues no `setWage` (CONTRACTS §16, group 11) | thirty days under `posted-median`: no `setWage` in Settlement's log, the golden untouched |
| I4b | under a pressure rule a wage moves only through `setWage` | every change of a post's wage is preceded by a `setWage` for it, and each day's wage rows equal `Post.wage` |
| I2 | thirty autonomous days of the port with both engines | every day: the two days aligned, no negative stock, Settlement's total money unchanged, every price finite, the economy's observed production equals Settlement's Q per line; inputs run out part way and the shop goes back to staffed; cattle is conserved into meat sold, eaten or on the shelf; the shop's balance equals the accounting view's profit; the economy's whole run replays byte for byte |

Settlement's I3 (assigned hours never exceed supplied hours, `web/src/settlement/labour.test.ts`) covers group 10's
acceptance. Planned: consumption from a realism population provider (PLAN step 11).

## Conservation and stability (`test/validation.test.ts`)

| Id | Rule under test | Must hold |
|---|---|---|
| V1 | goods ledger | replay 365 days of three-ports: for every good after every command, start + host additions + production = held + transit + consumed + spoiled to relative 1e-9; moves and trades net to zero; shipping and arrival are counted only from stock-change reasons against transit changes, with transit spoilage excluded from transfers; supplemental recipe fixture covers inputs, alternatives and by-products |
| V2 | money conservation | after every command over the same 365-day scenario, all ledger balances sum to the sum of starting balances set by replay funding to relative 1e-9 |
| V3 | price bounds | every PriceRule at shortages 0, 0.25, 0.5, 0.75 and 1 gives finite queried and tick-written prices within its own bounds times base; base rule equals base exactly |
| V5 | King-Davenant table | independently transcribed ECON-DAV rows and zero reproduced to 1e-12; linear interpolation and base scaling; non-decreasing on a 0.01 grid over [0, 1], capped from 0.5; cap 5 and NaN refused at Runner construction and by direct price queries, before the first tick or state changes; cap 5.5 accepted; direct assertPriceRule checks refuse cap 5 and NaN and accept 5.5; default remains base |
| V4 | supply shock stability | for every PriceRule kind, halve north's grain production on zero-based days [60, 90), then restore it; over 365 days every daily price stays finite and within rule bounds, every balance stays finite and total money equals the sum of starting balances set by replay funding to relative 1e-9 |

## I — intentions (CHAINS IF-26)

`test/intention.test.ts`

| Id | Rule under test | Must hold |
|---|---|---|
| I1 | accepted buy | limits at or above price accept; three units and their price move oppositely, conserving goods and money; every event carries cause |
| I2 | limit refusal | buy above maximum and sell below minimum emit exactly one caused refusal; state, balances and ledger log unchanged; no transfer call |
| I3 | accepted sell | limits at or below price accept; goods and money conserved; every event carries cause |
| I4 | generic optional cause | non-trade events carry cause too; no cause preserves exact event keys; empty cause throws before effects |
| I5 | refused replay (E3) | refusal is logged; replay produces byte-identical state and events |
| I6 | invalid input still throws | NaN, negative and infinite limits throw; bad units remain errors; without cause, excess stock and no price remain errors even with limits |
| I7 | explicit trade price | limits compare given price before market price; zero price and zero limit are valid |

## O — action outcomes (CHAINS CG-16, IF-26; C-Q25)

`test/outcome.test.ts`

| Id | Rule under test | Must hold |
|---|---|---|
| O1 | accepted trades | buy and sell conserve goods and money; exactly one completed outcome last, with trade stimuli and caused payload |
| O2 | limit refusals | failed outcome includes reason and unchanged limit fields; no state, balance or ledger changes or provider call |
| O3 | no price | caused buy/sell refuse with null price before stock checks; uncaused commands retain old throws |
| O4 | beyond stock | caused buy/sell refuse with requested and available units before limit checks; no effects; uncaused commands still throw |
| O5 | partial mass take | completes with actual smaller kilograms and stockChanged payload |
| O6 | empty mass take | caused command fails with no-stock and no effects; uncaused command returns zero without events |
| O7 | outcome scope | uncaused trades keep event shapes; caused addMass has no outcome; zero requested mass from stocked inventory stays a no-op |
| O8 | replay (E3) | accepted buy, refused buy and empty takeMass replay to byte-identical state and events |
| O9 | bad input | invalid numbers, references, weights and empty causes throw; Runner state, events and log unchanged |
| open | buying beyond the money held | CONTRACTS §3 lets balances go negative (debt), so a caused buy with too little money completes with a `completed` outcome and the buyer in debt; whether a mind may buy beyond its money (refused `insufficient-funds` with the shortfall) is a rule open for Rex (economy ISSUES ECON-26); Economy does not catch or reinterpret provider throws |

## T — goods transfers on kernel transfer() (PLATFORM §7a)

`test/goods-ledger.test.ts`

| Id | Rule under test | Must hold |
|---|---|---|
| T1 | buy conservation | stall loses q, buyer gains q; stockChanged event bytes and order unchanged; self-trades retain legacy events |
| T2 | sell conservation | seller loses q, stall gains q; stockChanged event bytes and order unchanged |
| T3 | dispatch and arrival conservation | inventory plus transit stays constant each day; original reasons retained; fully spoiled cargo preserves its zero-delta arrival |
| T4 | goods ledger contract | count units; unknown accounts/goods refused; shipment credits/debits match its units and emit nothing |
| T5 | atomic overdraw refusal | owner throws; earlier batch changes to inventories, events and journal roll back |
| T6 | deterministic replay (E3) | trades and shipment replay to byte-identical state and events |

## B — money and goods in one transfer (CONTRACTS §20)

`test/trade-batch.test.ts`

| Id | Rule under test | Must hold |
|---|---|---|
| B1 | buy batch | one provider call; money and goods conserved; purchase row and event bytes unchanged |
| B2 | sell batch | one provider call; money and goods conserved; sale row and event bytes unchanged |
| B3 | atomic refusal | goods overdraw restores money, inventories, existing rows and events |
| B4 | self-trade | no goods argument; legacy stockChanged and trade events retained |
| B5 | fractional units | exactly 2.5 units and their price move both ways |
| B6 | replay and debt | buys, sells, freight and arrival replay state, events and ledger byte for byte; zero-balance buyer can end negative (Q19, ECON-26 open) |

## C — LedgerProvider hosts (goods leg audit)

Searched `E:/AI Programs/Toolchain` (no package depends on `@rex/economy`; `Reality-simulator/packages/economy` is the package itself) and `Games/RPG's/pirate-ship/web/src` (skipping node_modules), for implementations of `LedgerProvider` and objects passed as `providers.ledger`.

| Host | File:line | Forwards `goods`? |
|---|---|---|
| pirate-ship `settlementLedger` | `Games/RPG's/pirate-ship/web/src/economy/providers.ts:57` | yes: the 7th parameter goes to `settlement.run` as `opts.goods` (`ledger`) with `from`, `to`, `good`, `units` in the pay command (lines 58-61); no goods leg falls through to the plain pay |
| economy `StubLedger` (in-package reference) | `src/providers.ts:70` | yes: builds a money ledger and one kernel transfer with both legs |

unfixed hosts: none

## X — currencies and exchange (CONTRACTS §22)

`test/exchange.test.ts`

| Id | Rule under test | Must hold |
|---|---|---|
| X1 | currency records | nullable metadata, definition event, pure live membership; empty, money, duplicate and unknown backing refuse |
| X2 | multi-currency conservation | every asset moves exactly, debt allowed, ordered rows share first id as batch; money omits currency |
| X3 | barter | ordered goods legs move with no money rows |
| X4 | skipped legs | zero/self money still writes rows; zero goods emits no stock event |
| X5 | atomic refusal | late goods overdraw restores both currencies, earlier goods, rows and events |
| X6 | validation | unknown currency, invalid numbers, missing ledger and invalid references throw before effects |
| X7 | unseen balances | known but unmoved currencies read zero without mutation |
| X8 | outcomes | caused completion counts legs/rows; cumulative overdraw refuses before provider call; uncaused overdraw throws |
| X9 | optional host seam | missing exchange throws the contract error |
| X10 | one-currency compatibility | three-ports state JSON has no currencies key |
| X11 | replay | currency definitions, exchanges, barter and refusals replay state, events and ledger byte for byte |

## Q — stall quotes per currency (design v2 §5.3)

`test/currency-trade.test.ts`

| Id | Rule under test | Must hold |
|---|---|---|
| Q1 | buy in pieces | one exchange, exact money and goods deltas, pieces row and event |
| Q2 | sell in pieces | one exchange, exact money and goods deltas, pieces row and event |
| Q3 | shortage pricing | same multiple in every quoted currency under linear and table rules |
| Q4 | caused not-accepted | one refusal and failed outcome with holder, currency and purpose; no movement or conversion |
| Q5 | uncaused not-accepted | missing quote throws even with an explicit price |
| Q6 | unknown currency | buy, sell and quote reject unknown ids without effects |
| Q7 | currency limits | pieces priceMax and priceMin refuse without movement |
| Q8 | separate accounts | rows never cross currencies; inventory uses that currency's quote or is unpriced |
| Q9 | money compatibility | legacy state, event and row bytes; optional currency fields absent |
| Q10 | quote updates | only basePrice allowed; valid prices and opaque ids; money base untouched |
| Q11 | provider seam and self trade | no self goods leg; missing exchange throws the contract error |
| Q12 | payment purpose (GOV-19) | tax/debt appear only on not-accepted refusals and their failed stimuli; one refusal, no movement; absent purpose preserves bytes; invalid purpose throws; accepted trades and other refusals unchanged |

## M — market offers and observed ratios (design v2 §5.2)

`test/offers.test.ts`

| Id | Rule under test | Must hold |
|---|---|---|
| M1 | crossing barter | one atomic exchange; exact conserving deltas |
| M2 | resting price | generous incoming offer pays resting ratio |
| M3 | price-time priority | best price then earliest id |
| M4 | partial fills | remainders rest and later fill |
| M5 | currency fills | goods and currency swaps conserve with currency/batch rows; debt allowed |
| M6 | acceptance | partial and capped full fills |
| M7 | withdrawal | owner only |
| M8 | expiry | inclusive expiry day; no-offer refusal; tick removes |
| M9 | stale stock | failed fill moves nothing and matching continues |
| M10 | observed views | both directions and windows; sorted media counts; pure |
| M11 | fence | no rule calls observed ratios |
| M12 | compatibility | three ports has no offers/trades keys |
| M13 | replay | state/events/ledger identical |
| M14 | outcomes | incoming shortfall has no effects; fill stimuli |
| M15 | explicit exchange | only qualifying market exchanges observed |
| M16 | validation | invalid assets, numbers and ownership throw without effects |

## RD — remote dispatch (design v2 §3–§6)

`test/remote-dispatch.test.ts`

| Id | Rule under test | Must hold |
|---|---|---|
| RD1 | remote-dispatch | local fill bytes unchanged; owned source inventory; directed market route required across markets; one atomic transfer for money and shipment goods; partial/crossing fills; due-day arrival; per-asset conservation; refusal rollback; exact joint replay |

## SL — shipment loss

`test/shipment-loss.test.ts`

| Id | Rule under test | Must hold |
|---|---|---|
| SL1 | shipment-loss | host-commanded loss transfers remaining cargo once to the named inventory; lost shipments never arrive; per-asset conservation including lost inventory; ordinary and remote dispatch replay exactly; unknown shipment/inventory and arrived/lost shipments refuse without effects; partially and fully spoiled cargo resolve |

## TIH — two-islands host

`demo/two-islands/run.test.ts` (isolated demo Vitest config)

| Id | Rule under test | Must hold |
|---|---|---|
| TIH1 | autonomous host | deterministic seeded minds and rate priors; joint replay; daily conservation including shipments/loss; atomic fills; isolation; voyage capacity and loss; Society/report and seed fences; bootstrap offers; perceived-rate learning; authorised issue only |

## X — declared boundary flows (ECON-32)

`test/boundary-flows.test.ts`. Boundaries are interim external processes, holding no stock; E5/E6 replace them with real stores. Validation is bookkeeping identity only.

| Id | Rule under test | Must hold |
|---|---|---|
| XBF1 | abstract production | one named source entry per good per day; original stock delta and events |
| XBF2 | inventory spoilage | one named destination entry per inventory/good; unchanged daily fraction |
| XBF3 | host additions and removals | one boundary entry each; excess removal refuses before effects |
| XBF4 | zero flows | no entries; zero command events retained |
| XBF5 | rate one | all stock leaves, exactly zero remains |
| XBF6 | per-account reconciliation | opening plus receipts minus issues equals closing for every inventory/good over five days with buying |
| XBF7 | legacy compatibility | thirty-day Runner state and events deep-equal the original adjust-based steps |
| XBF8 | consumption excluded | market consumption draws stock without transfer entries |
| XBF9 | boundary contract | only four declared processes and known goods; boundaries hold nothing |
