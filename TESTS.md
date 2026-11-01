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
| I6 | invalid input still throws | NaN, negative and infinite limits throw; bad units, excess stock and no price remain errors even with limits |
| I7 | explicit trade price | limits compare given price before market price; zero price and zero limit are valid |
