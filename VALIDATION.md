# Verification and validation: the economy engine (economy keeper, 2026-10-30)

Rex's directive (PLATFORM.md §11a, 2026-10-30): the keepers, not Rex, find wrong formulas, unrealistic parameters,
instabilities and contradictions. Three states per mechanism, never conflated: **implemented** (code and unit tests
pass), **integrated** (wired to what it reads and feeds), **validated** (matches independent evidence within a
declared tolerance). Mechanism ids are the registry's (`Toolchain/registry/mechanisms.json`). An agent testing its
own code is not independence: the validation units below are written for belt workers who did not write the code,
and reference values come from sources, never from the code's output.

## 1. State per mechanism

| Mechanism | Model and source | Implemented | Integrated | Validated |
|---|---|---|---|---|
| `economy.recipe.definition`, `economy.material.available`, `economy.material.produce` | inputs × units → outputs, by-products; the recipe rule (GOODS.md 3c, Rex) | yes (E1, E2) | yes (Settlement's material provider, I1) | not applicable as structure; the quantities are ECON-5 (period yields where found, RESEARCH.md §5) |
| `economy.recipe.rates` | output per fixture-day; labour per unit (worker-days now, person-hours after P1) | yes (E2) | yes (Settlement production, I1, I2) | no: no period labour-per-unit figure opened (ECON-10) |
| `economy.inventory.holdings` | stock per good, never negative | yes (E1) | yes (I1, I1b) | conservation only (V1 below) |
| `economy.spoilage` | stock × rate per day, exponential | yes (E6) | partly (in transit too, E10) | no: GOODS.md 1i is qualitative; every rate is null today (level: open) |
| `economy.consumption.demand` | fixed per day, else headcount × per-capita; no price response | yes (E5) | not yet with Reality (step 11) | no: no period per-capita series wired; **assumption: demand is price-inelastic** |
| `economy.shortage.event` | 1 − stock/reserve, clamped to [0, 1] | yes (E7) | yes (I2 prices) | definition, not a claim |
| `economy.price.rule` | `base` (default) or `shortage-linear` (illustrative, not Rex's) | yes (E8, E9) | yes (I2) | **`base` makes no claim; `shortage-linear` is unvalidated and labelled illustrative** |
| `economy.price.king_davenant` | Davenant 1699 table (ECON-DAV), interpolated; a non-default rule `king-davenant-table` | yes (2646, cap guarded by 2703/2706/2707) | selectable, not the default | **against its source: yes** (V5: the five printed rows exact; (0, 1) derived, not printed); against market behaviour: no |
| `economy.production.abstract_market` | constant `productionPerDay` | yes (E5) | yes (three-ports) | no: the five numbers are null in the data (balance lane) |
| `economy.market.five_numbers`, `economy.market.observed_production` | Rex's five numbers (ALIGNMENT §10); observed = Settlement's Q | yes (E2, E3) | yes (I2: observed equals Q every day) | definition |
| `economy.trade.trade` | sale/purchase at the market price, money through the ledger | yes (E11) | yes (Settlement ledger, I2) | conservation (E11, I2); prices see `price.rule` |
| `economy.trade.shipment` | goods in transit for the host's travel days | yes (E10) | partly (no host map wired) | conservation (E10); travel days are the host's |
| `economy.accounting.view` | revenue − costs from ledger rows | yes (E13) | yes (I2: balance equals profit) | identity, reconciles exactly |
| `economy.labour.wage_quote` | `posted-median` (default) or `ratio` (illustrative) | yes (E12) | P1 units 2628, 2631 | levels: Settlement's Q10 benchmarks (ECON-THO, STL-*); dynamics: no evidence, `ratio` labelled illustrative |
| `economy.org.organisation` | a holder record | yes | three-ports | not a model |
| `economy.infra.*` | ids, reducer, replay, tick order | yes (E3, E4) | kernel adoption (2601–2603) | determinism: E3, E14, the kernel goldens |
| `economy.example.three_ports` | an example policy, fixtures | yes (E14) | n/a | not a claim |
| `economy.burial_waste` | scope only (PLAN step 12) | no | no | no |

## 2. Conservation, stability and boundaries (what holds today, and how it is checked)

- **Money.** The engine never creates money: every transfer goes through the ledger provider, and the only mints
  are the host's (`credit`, a market's purse). Checked per sale (E11) and per day for thirty days (I2). Debt: balances
  may go negative (CONTRACTS §12 item 8, Rex's).
- **Mass per good.** Each good is conserved by moves, sales and shipments; it leaves the world only by consumption and
  spoilage and enters by production and the host's `addStock`. Checked for meat over thirty days (I2). A full
  ledger-of-goods check over every good and a long run is unit 2645 (V1). **Mass by element is not modelled**: goods
  are opaque units (UNIT-12); element balance is Reality's, where goods map to substances.
- **Price stability.** No price feeds back into supply or demand inside the engine (demand is fixed, production is
  fixed or Settlement's Q), so no engine loop can run away: a price is a bounded function of today's shortage
  (`base`: constant; `shortage-linear`: 0.7–3 × base). Feedback exists only through a host policy (the three-port
  companies ship towards shortage). Inflation needs money creation, which only the host does. Unit 2645 runs
  three-ports for 365 days with a supply shock and checks bounds, recovery and that no balance or price diverges.
- **Boundaries.** Empty stock, zero reserve, no base price (null, never a default), infinite availability (no
  inputs), unreachable routes: E1, E2, E9, E10, E11 cover them; unit 2645 adds the rule bounds at shortage 0 and 1.

## 3. Findings (validation that failed or a model defect)

| Id | Finding | Evidence | State |
|---|---|---|---|
| V-F1 | Jevons' fit of the King–Davenant table, proposed in RESEARCH.md §1 (`f(s) = 0.824/(0.88 − s)²`), misses the table it was fitted to by up to 6.4%, gives f(0) = 1.064 (a market at its reserve would price 6.4% above base), and has a pole at s = 0.88 | computed against the five rows of ECON-DAV: +6.4% at 0, +4.2% at 0.1, −1.0% at 0.2, −5.8% at 0.3, −5.9% at 0.4, +3.8% at 0.5 | model change proposed and recorded (§11a): use **piecewise-linear interpolation of the table itself** (exact at every row, f(0) = 1, monotone), capped at its last row (5.5 × at s ≥ 0.5, an extrapolation labelled estimate); RESEARCH.md and STARTING_TOWN econ 5 corrected; implemented as a non-default rule by unit 2646, default stays `base` until Rex approves econ 5 |
| V-F2 | The price rule cannot reproduce the period's spatial price gaps: Barbados/London sugar ×4, Jamaica logwood camp/market ×5–6, tobacco plantation/London ×7–15 (GOODS.md 1h), against a rule range of ×4.3 (linear) or ×7.9 (King–Davenant, 5.5/0.7) | GOODS.md 1h; the sources say the gaps are freight, duty, risk and profit, not scarcity | open, a model limitation: transport cost and duty do not enter price. Recorded for Rex as a scope question (freight is a host figure today, paid but not priced in) |
| V-F3 | Demand does not respond to price (consumption is a fixed rate), so a shortage raises price without reducing consumption | the engine; the King–Davenant table itself implies an elastic response | open, an assumption labelled here; a demand response is a model change for review, not built |

## 4. Validation units (belt; written by the keeper, built by workers who did not write the code)

| Unit | What | Validation spec in its Gate |
|---|---|---|
| 2645 `economy-validation-conservation-stability` | `test/validation.test.ts` V1–V4: goods ledger over every good and 365 days of three-ports (stock + transit + consumed + spoiled = start + added + produced, per good, to 1e-9 relative); money constant to 1e-9; under each price rule, price within [floor, cap] × base at shortage 0 and 1; a 30-day halving of one port's production, after which prices stay within the rule's bounds and no balance or price is NaN or infinite | the four tests pass; the existing suite and the goldens unchanged |
| 2646 `economy-price-king-davenant-table` | the non-default rule `{ kind: 'king-davenant-table', cap }` by interpolation of ECON-DAV's five rows | V5: every table row reproduced exactly; f(0) = 1; monotone non-decreasing on [0, 1]; capped at 5.5 from s = 0.5; reference values typed from ECON-DAV in the test, never computed from the code |
| 2647 `economy-validation-independent-check` (Haiku; **done**, `VALIDATION-CHECK.md`) | an independent check: re-derive the V5 reference values from the ECON-DAV source page and the V1 balance equation from TESTS.md, and confirm the tests assert what they claim | a short report file `VALIDATION-CHECK.md` naming any mismatch; Gate: the file exists and lists each test it checked |

## 4b. What the independent check found (2647, `VALIDATION-CHECK.md`), and what was done

| Finding | State |
|---|---|
| V1 netted shipping from two event types, so a double count on one side could hide | fixed (2704, e77af6b): shipping counted from stock changes, balanced against actual transit; transit spoilage a loss |
| V2 hard-coded the starting money (1000) | fixed (2704): read from the run's funding |
| V4 ran one price rule only | fixed (2704): every rule |
| V4 checks bounds and finiteness, not recovery after the shock | open, not claimed: §2 states boundedness; a recovery test would be a new claim |
| V5's (0, 1) is derived, not a printed source row | labelled in the test (2704) and here |

## 5. Accuracy, uncertainty, open questions (report)

Validated today: the King–Davenant rule against its source table (exact at the printed rows); nothing against market
behaviour. Every number in a test is a fixture. Conservation of
money and of each good, determinism and replay are verified. The researched values (RESEARCH.md) are proposals for
Rex; once approved, units 2645–2647's framework checks them. Uncertain: every rate the data leaves null (spoilage,
the five numbers, labour per unit). Open scientific questions: V-F2 (where price gaps come from), V-F3 (demand
elasticity), whether the King–Davenant corn relation transfers to non-food goods at all (it was stated for corn).
