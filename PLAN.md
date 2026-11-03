# Economy: PLAN.md (draft, economy keeper, 2026-11-02; HQ, not a repo; lands as `Toolchain/economy/PLAN.md` on Rex's approval)

Consolidates `Toolchain/economy/PLAN.md` (2026-10-30 steps 1–12), `CONTRACTS.md` §1–§23, `RESEARCH.md` §1–§7,
`VALIDATION.md` §1–§5, `VALIDATION-CHECK.md`, `TESTS.md`, `P1.md` and `HQ/handoffs/economy/MULTI-ECONOMY-DESIGN.md` (v2)
to `PLAN-SPEC.md`. Code evidence is at economy HEAD f510afc (v0.1.0 f6dbb70). Pass 1 was reported to the controller on 2026-11-02. Open ids stand as they are: ECON-24, ECON-26/Q19,
econ 5, ECON-5, Q15, DUP-58.

## Pass 1 (one page)

**Present (implemented, tested).** Records and reducer with replay (`src/reduce.ts`, `state.ts`). Recipes and
`produce` (`commands.ts:185`). `available`/`take`/`rates` for Settlement (`material.ts`). Spoilage (`tick/index.ts:51`).
Aggregate consumption (`tick/index.ts:74–96`). Shortage (`queries.ts` `shortage`). Price rules `base` (default),
`king-davenant-table`, `shortage-linear` (`queries.ts` `price`). Buy and sell, each as one kernel `transfer()` with money and goods legs
(CONTRACTS §20). Shipments on `transfer()` (`tick/index.ts:29`). Wage quote (`labour.ts`). Accounting view. `takeMass`/`addMass`
in kg (`commands.ts:214`). Currencies, offers, fills and observed ratios (§22). `shared.action.outcome` for caused buy, sell and takeMass (IF-26).

**Missing.** Price → demand feedback (V-F3, ECON-16). Household budget: consumption moves no money (`economy.household.budget`, planned).
A sink for consumption and spoilage: the mass leaves with no credited store. `takeMass` → body as **one** transfer.
The resolution split between aggregate and individual eating. Freight and duty in price (V-F2). Burial and waste (old step 12). Record objects.

**Owned quantities.** Inventory stock per good (count; ≥0; conserved by moves); `Good.weight` kg/count; recipes;
the five numbers per market good; price (money/count, a rule's output, not conserved); shortage [0,1]; wage quote; offers,
trades, currencies registry; shipments in transit (count, conserved).

**External inputs, and the engine whose mechanism should produce each** (today a host constant or fixture):

| Input today | Where | Should come from |
|---|---|---|
| `productionPerDay` (abstract market) | `tick/index.ts:14–26` | Life (crop and animal growth, harvest IF-42), Reality (extraction: geology, water), Settlement Q for made goods |
| `addStock` (host mint) | `commands.ts:164` | harvest/extraction transfers from Life plant_state / Reality stores |
| `rates.unitsPerFixtureDay` | `state.ts` Rates | Reality (manufacturing feasibility, tool and machine power) |
| `rates.labourHoursPerUnit`, `productivity` | `state.ts`, `providers.ts:54` | Life `body.capacity_functional` (DUP-15) × task demand from Reality; skill from Knowledge |
| recipe quantities, yields (ECON-5) | `recipes.json` nulls | Reality mass/element balance (transformations); Life for biological yields |
| `spoilagePerDay` | `Good` | Life (decomposition, microbes), Reality (degradation) |
| `perCapitaPerDay`, `headcount` | `tick/index.ts:79–80` | Life (requirement, life-21; cohort headcount, C-Q26); Society later (DUP-41) |
| `TransportProvider.days` | `providers.ts:57` | Reality/Life locomotion and sailing (M1b) |
| `basePrice` | five numbers | data stays; History/Catalogue seeds (researched) |

**Outputs.** Stock and mass reads; prices and quotes; `takenKg`; refusals and `shared.action.outcome`; the goods legs of transfers;
accounting view. Ports: 23 in `kernel.json`.

**Who debits and who credits food (settles the audit point at `tick/index.ts:71`).** A consumer is eaten for exactly once:
- *Individually resolved person:* intention → `takeMass` (Economy **debits** the inventory) → `eatMeal` (Life **credits** the body), one transaction.
- *Population-resolved consumers:* the aggregate path, `headcount × perCapitaPerDay`, where `headcount` is **only the cohort count** Life
  reports (C-Q26 never-both). Economy debits the inventory; the credit is Life's cohort intake (CG-23). Until Life has one, the credit is a
  declared boundary sink, the `consumed` bucket in V1.
- A fixed `consumptionPerDay` is allowed only in a market good with no individually resolved eaters. Otherwise the engine refuses it. Proposed; this is architecture, not a game rule.

**Contribution to M1a.** The "inventory decrements once" half: `takeMass` with a cause, a no-stock refusal, and the outcome
event. To close it: one transfer from the inventory to the body (needs a kg ledger view and Life's body ledger), and the never-both
split above. The test is paired, provisioned against deprived, on the same seed.

**Confirmed defects** (by code; reproduction: any E5 or three-ports run). (1) Consumption and spoilage remove stock with no
destination (`tick/index.ts:84`, `:63`), so there is no transfer record (§7a). (2) `takeMass` and `eatMeal` are two writes in one
transaction, not one `transfer()` (`commands.ts:229`; `test/food-to-body.test.ts` F1). (3) Abstract production creates goods with no
source. **Risks.** Double eating once individuals and a full headcount draw on one market. VALIDATION §2 "price stability" is read as recovery,
but a bounded price is not recovery: `base` is constant, and no rule feeds back.

**Flagged assumptions.** Demand is price- and income-inelastic (evidence 4). Price = f(shortage) only. Labour shared in order (Q15).
Debt allowed (ECON-26). Every rate in tests is a fixture.

**Next dependency-ready task (design only, no unit).** Updated 2026-11-02: the inventory→gut transfer is agreed (DC-13, LIFE-19), and
the cards for EN-1–EN-3 and the shared EN-4 contract are in §10. Next: agree the cohort-only headcount, `individuals()` and the unmet-intake feedback (EN-5) with Life,
and the `Good.catalogue` reference with Catalogue. Then CP-1/CP-2 (§9), once Rex approves.

---

## Pass 2 (the full plan)

Marks: **(Rex)** his decision; **(agreed)** a contract both keepers signed; **(proposed)** this keeper's design, open to
the named peer; **(open)** an id for Rex. Evidence labels follow PLAN-SPEC §5: measured / calibrated estimate / assumption / fiction.

### §1 Purpose and boundaries

**Determines.** Economy decides what is made from what (recipes), who holds which goods (inventories), and what goods are wanted and at
what price. It also covers how goods change hands (exchange, shipment), the labour market's quote, currencies as accepted media, and the
accounting view (CONTRACTS §1). "Capitalism never assumed" (PLATFORM §3 D): exchange is minds accepting offers (design v2 §5.5), and
a stall's posted price is one institution among others.

**Receives.** Settlement sends Q per line, posts, fixtures and the money ledger (§4b, §3, §20, §22). Life and its population provider send
headcount, labour supply, reservation wages and body uptake (§16, §19, C-Q26). Cognition sends intentions with a cause (IF-26).
Government sends issue and retire processes and legal tender (§22). The host sends travel days, the seed and the day.

**Never calculates.** Money balances (Settlement's ledger). Q, staffing and wages paid (Settlement). Food energy, digestion, satiety and
health (Life; E = m·e_food is Life's, CG-19). Element and atom balance (Reality world ledger). Location and reach (Reality and
Settlement). Whether to buy, sell, work or accept (Cognition). Tax and legality (Government). Population and households (Life, then Society, DUP-41).
Plant or animal growth (Life). Travel time (Reality and Life). A probability of loss at sea (the host, design v2 §8).

### §2 State

| Quantity | Unit | Range | Meaning | Kind |
|---|---|---|---|---|
| `Inventory.stock[good]` | count | ≥ 0 (E1; `adjust` throws below −1e-9) | units of a good a holder has in a market | **conserved** (balance below) |
| `Shipment.units` | count | ≥ 0 | goods in transit, in no market (E10) | conserved |
| `Good.weight` | kg/count | > 0 or null | mass per unit; null = unknown, mass commands refuse | parameter |
| derived mass | kg | ≥ 0 | stock × weight (`massOf`) | conserved with count; elements not modelled (UNIT-12) |
| `Good.spoilagePerDay` | 1 (fraction per one-day step) | [0,1] or null | f in S(d+1) = S(d)·(1 − f), as `tick/index.ts:51–68` applies it; not a continuous rate k. **Convention:** a source rate k (units 1/time) and an elapsed interval Δt in the same time unit give f_Δt = 1 − e^(−k·Δt), and S(t+Δt) = S(t)·(1 − f_Δt). With k per day and Δt = 1 day this is f = 1 − e^(−k). Stored f is f for Δt = 1 day; if the step changes, f is recomputed from k, never reused. **Exactly once:** Economy is the one process that applies spoilage, and each elapsed interval is charged once. Sub-steps that partition the day give the same total for constant k; charging a full-day f on every sub-step would be a defect. That first-order decay fits a given food is an empirical question per good | parameter (to come from Life/Reality) |
| `Good.food` | id | Life food id or null | link to Life's nutrition table | reference |
| `Recipe` inputs, yield, by-products | count per output unit | ≥ 0 | transformation | parameter (ECON-5) |
| `Recipe.rates` | units/fixture-day; person-h/unit | ≥ 0, finite | capacity and labour need | parameter (to come from Reality/Life) |
| five numbers per market good | count/day, count, money/count | ≥ 0 or null | Rex's ALIGNMENT §10 | parameter; null = open, never defaulted |
| `MarketGood.price` | money/count | rule bounds × base, or null | today's stall price | **invariant**: finite, inside the rule's bounds; not conserved |
| shortage | 1 | [0,1] or null | 1 − stock/reserve | derived |
| `producedLast`, `consumedLast`, `unmetLast` | count/day | ≥ 0 | yesterday's observed flows | derived record |
| `Offer` | asset units, ratio | remaining ∈ (0, original]; expires ≥ day | resting offer | invariant: withdrawn on expiry or fill |
| `Trade` | asset units | > 0 | a completed fill | append-only record |
| `Currency` | id, issuer, backing | — | a medium registered by Government's process | registry |
| `Organisation` | ids | — | a holder of inventories | record (assets: DUP-58 open) |
| wage quote | money/post-day | finite or null | a pure query, never stored | derived |

**Goods balance (system boundary = all inventories + shipments of one economy state, per good, per day):**
`Σ stock + Σ transit = start + added + produced + byproducts + addMass − inputs consumed − consumption − spoilage − takeMass − removed`.
It is checked by V1 to 1e-9 relative over 365 days. Every term on the right is today an `adjust` with a reason. After E1–E3 the sink terms
become transfers out of the boundary into named stores (body, cohort intake, waste). Money is conserved by Settlement except for logged issue and retire (§22 T1).

### §3 Mechanisms

Each line follows one chain: input → computation → output → what it changes. Registry ids are in brackets.

1. **Recipe production** [`economy.material.produce`, `.available`, `.recipe.rates`]. Settlement's Q (`floor(min(Q_equipment, Q_labour,
   Q_materials, Q_utilities))`, CONTRACTS §6) → `produce(inv, recipe, units)` → inputs −units×q, output +yield×units, by-products → stock and
   `producedToday`. Assumption: fixed coefficients (Leontief) per recipe; the `inputsAny` draw is first-available (proposed). Applies to made
   goods. It stops applying where the yield depends on biology or weather (crops, fishing): those come from Life by harvest (E5). **Gap (risk):**
   no mass balance per recipe, so a recipe can create kg. Planned check (EN-6): ΔM_process = M(all inputs) − M(all outputs), with outputs = products +
   by-products + waste, and every material input represented, including water and air. An unexplained residual is reported as an accounting
   discrepancy. It is never turned into an invented waste good. **Two separate claims.** *Mass balance checked:* every represented material input,
   output and accumulation reconciles in kg. Air or water mass may be measured or prescribed, and needs no elemental fractions. *Elemental balance
   checked:* only where the physical owners supply enough composition and transformation data. Life supplies food composition; Reality supplies
   substances, gases and reaction chemistry (`realism/src/elements.ts` has formula parsing; whether food goods carry element fractions is unchecked).
   Neither claim implies the other. Economy holds references, never its own composition record. "Boundary incomplete" names the missing input,
   so it stays a to-do for that recipe and is not a resting state.
2. **Abstract production** [`economy.production.abstract_market`]. `productionPerDay` → stock += rate. It is a stand-in for a market
   nobody models. Evidence 4. It is retired good by good when a producing mechanism exists (pass 1, external inputs).
3. **Spoilage** [`economy.spoilage`]. stock × rate per day, on shelves and in transit → stock falls, `spoiled` event. Discrete
   geometric decay per day step (the meaning of f is in §2). Rates are null today (GOODS 1i is qualitative). Target: Life (microbial decomposition) and Reality (degradation) supply the rate
   from conditions (temperature, moisture), and the lost mass goes to a waste store (M4).
4. **Aggregate consumption** [`economy.consumption.demand`] (`tick/index.ts:74`). Demand = `consumptionPerDay`, else headcount ×
   `perCapitaPerDay` → taken = min(demand, stock) → stock falls, `consumedLast`/`unmetLast`, `consumed` and `shortage` events.
   Assumptions: inelastic, free (no money), no body credit. **Where it applies (proposed, settles the audit point):** only to consumers
   held at population resolution. `headcount` must be Life's cohort count for that market (C-Q26, CG-23), never including an individually
   resolved person. A fixed `consumptionPerDay` is accepted only on a market good with no individually resolved eaters; otherwise
   the tick refuses it with "individual eaters present; use perCapitaPerDay with a cohort headcount". The flag is the population provider's
   `individuals(market, day)` count (new optional pure query, to agree with Life). **Who debits:** Economy, from the market inventory. **Who credits:**
   Life's cohort intake (CG-23, Life phase 19). Until it exists, a declared boundary sink, labelled as such in V1 and in every report.
   **Shortage reaches the cohort (EN-5):** actual = min(requested, stock) and unmet = requested − actual. Life receives the actual intake, never the
   requested amount, and its cohort model decides the bodily consequences. An unmet amount is never a silent stop. **Agreed with Life on 2026-11-02 (EN-5,
   Life lane LN-2):** D = N_c·c·Δt in kg; one transfer per (cohort, Life food id) per day, keyed by food id, in kg, to Life's cohort intake account (a declared,
   labelled boundary sink until Life phase 19). c is scenario or evidence data with a source. Life's subsistence requirement (5425) is an energy requirement,
   not intake, and is not c unless a sourced conversion turns it into kg. Economy reads membership (Life's population, disjoint by construction) once, at its
   daily step, and moves no material for a membership change. Promotion and demotion are Life's own transaction (LIFE-32).
   **Boundary-aligned transitions (M1a; review 2026-11-02):** a resolution change requested mid-interval takes effect at the next declared accounting boundary,
   the end of Economy's daily consumption step. Until then the person stays represented exactly once, at their old resolution. At the boundary, Life settles the
   prior interval and moves the person with their bodily stores and intake history. Life owns the assignment and Economy reads it. An authoritative
   membership list may implement this, but it is not enough alone: population, stores and recorded intake must also be preserved. Immediate transitions
   that transfer responsibility for the rest of the interval come later. The invariant is: total intake = Σ individual intakes + Σ cohort intakes, each actual
   intake recorded once, and each person with exactly one resolution owner at any time. There is no daily meal quota: individuals may eat several times. **Missing inputs (scoped):** an input
   is checked only for a mechanism that is enabled. A market good with cohort consumption enabled must have the inputs that mechanism declares required
   (headcount, per-capita value), or configuration fails. It is never read as zero demand (today's code takes null as no demand: a change, proposed). Optional
   inputs take only a default that is explicitly specified and approved, and it is recorded in the run's configuration and trace. A CP-1 inventory test with
   cohort consumption disabled needs neither. A market good with no enabled cohort has no aggregate demand. **Unmet is information, not a
   debit:** Life receives the actual material. The unmet amount is reported to Life's cohort model alongside it, and nothing is debited for it. **Demand is chosen once:** for an
   individually resolved person, Cognition chooses what to buy and eat, and Economy supplies prices, availability, budgets and transaction outcomes. No
   aggregate function subtracts a second amount for them. For cohorts, the demand rule stands in for those choices, with its assumptions stated.
5. **Individual eating** [`economy.inventory.holdings` → `realism.nutrition.eat_meal`, IF-36, CG-19]. Intention `consume` (cause) →
   `takeMass(inv, good, kg)` → takenKg = min(kg, stock×weight) → `eatMeal([{food: foodOf(good), kg: takenKg}])` → body +kg, energy
   E = m·e_food (Life's). Today these are two writes in one kernel transaction (F1–F5). **Target (E1, proposed to Life):** one `transfer()`.
   The kernel takes one quantity and one unit for both ends (`kernel/src/transfer.ts:17`), so quantity = the Life food id, unit kg, from
   `{ledger: economy.goods.mass, account: <inventory>/<good>}` (Economy's kg view: `apply` converts by `weight`, refuses null or 0) to
   `{ledger: <Life's body intake ledger>, account: <body id>}`, process `shared.action.consume` (mechanism row `realism.nutrition.eat_meal`). Life then digests inside its own
   ledger. Economy debits and Life credits, in one entry. **DC-13 (agreed and closed 2026-11-02; INTEGRATION-PLAN M1a-17, -20, -25):**
   the host resolution emits exactly one `shared.action.outcome` per intention, after the commit or rollback. Status `impossible` is
   decided before any transaction, with no transfer. `failed` is a rollback or a refusal, with zero journal entries. For `completed`,
   q = min(terms.kg, available kg, gastric room). Caused commands inside it carry a logged `resolvedBy: 'host'` and emit no outcome; IF-26 is
   unchanged without it. The host reads Economy's `refused` event and `takenKg`. **Economy writes the one entry**, from its kg goods view to
   Life's `life.gut` ledger, which is passed beside the command (the CONTRACTS §20 pattern), and `eatMeal` never writes the mass again. **Quantity key agreed with Life on 2026-11-02 (E1/LIFE-19; life PLAN §3.A4):** the Life
   nutrition food id, unit kg; from the `economy.goods` kg view, account `<inventory>/<good>`; to `life.gut`, account `<body>/stomach`.
   Economy maps from `Good.food`, and its kg view throws on a mismatch before anything moves. `life.gut` declares kg
   for every known food id and throws on an unknown one; an unknown food is `impossible` from Life's precondition read. No DC row is needed. Where the destination says "Life's body intake ledger"
   above, read `life.gut`. **Taking: attempt, physical
   resolution, transfer, judgement (EN-3, proposed; corrected 2026-11-02).** (1) Cognition attempts; beliefs about ownership, enforcement and
   consequences, which Society and Government shape, act before the attempt. (2) The physical resolution decides success and amount: access,
   containers and locks, custody, resistance, bodily capability and time. Reality and Life resolve the physics and the body; who owns custody and
   lock state is not settled here. Economy never decides physical success, and stock plus reach is not enough. (3) Economy moves only the quantity
   the resolver established, in the one entry. (4) Society and Government judge any violation. **Authorisation** is recorded on the transfer as
   `authorised | unauthorised | unjudged`, with the rule or source when assessed. Unknown is `unjudged`, never `unauthorised`. A withdrawal under a
   permission checks that permission. An attempted unauthorised take is neither made impossible nor automatically successful. An owner's refusal
   applies where the owner is a party acting (a stall declining a sale, an offer not accepted). Economy decides no criminal matter.
   **M1a fixture:** the stock is declared accessible and uncontested in the run configuration and the trace, and authorisation is whatever the fixture states:
   a declared household arrangement (`authorised`, source = the fixture) or `unjudged`. Locks, resistance and theft are unimplemented. That is a
   recorded limitation, not an absence from the world. There is no universal location-level `accessible` field: access can depend on actor, container and action.
6. **Shortage** [`economy.shortage.event`]. 1 − stock/reserve, clamped. A definition.
7. **Price** [`economy.price.rule`, `.king_davenant`]. price = base × f(shortage); f = 1 (`base`, the default), the interpolated
   King–Davenant table capped at ≥ 5.5 (built, not the default; econ 5 open), or linear (illustrative). The price feeds a buy or sell at the stall.
   **It feeds nothing else inside the engine.** It applies to a stall's posted quote. It stops applying to offer markets, where the ratio is the
   minds' (design v2 §5.2).
8. **Exchange** [`economy.trade.trade`, `.market.offers`, `.exchange.observed_ratios`, `.money.currencies`]. A caused buy, sell, offer or accept
   → one N-leg `transfer()` (money legs on `settlement.money`, goods legs on `economy.goods`) → balances and stock, `Trade` record,
   `shared.action.outcome`. Price-time priority at the resting ratio (Harris 2003). Refusals: no-price, beyond-stock, limit, not-accepted. No refusal
   on balance (ECON-26/Q19 open).
9. **Shipment** [`economy.trade.shipment`]. ship → transfer inventory → `shipment:<id>` → after `TransportProvider.days`, transfer to the destination.
   Spoilage in transit. `loseShipment` moves the cargo where the host says. Title passes at the fill (RESEARCH §7, Inst. 3.23.3).
10. **Wage quote** [`economy.labour.wage_quote`]. Posts' hours and wages + `LabourSupply.hours` → `posted-median` (default) or `ratio`
    (illustrative) → a quote. The host applies it only through `setWage`. ECON-24 (reservation-wage effect), econ 6 and Q15 are open.
11. **Accounting** [`economy.accounting.view`]. Ledger rows + inventories at market price → revenue, costs, profit, per currency. An identity.
12. **Not built, planned here:** demand response and household budget [`economy.household.budget`, DUP-59 with Society]; freight and duty in price
    (V-F2); burial and waste services (old step 12); record objects [`economy.goods.record_object`]; organisation assets (DUP-58).

### §4 Inputs and outputs

| Quantity | Producer → consumer | Unit, range | Timing | Failure / rollback |
|---|---|---|---|---|
| Q per line | Settlement → `produce` | count, int ≥ 1, ≤ floor(available) | Settlement tick, day N | `produce` throws; no cross-engine rollback in the pirate adapter's `runDay` (ECON-11, open until it uses the kernel transaction) |
| `rates`, `available`, `have` | Economy → Settlement | finite ≥ 0 | pure within a tick (§17) | — |
| money legs | Economy → Settlement `pay` / `exchange` | money, quantity = currency id | in the command | one `transfer()`; any leg fails → none, no row |
| headcount (cohort only) | Life → `consumption` | persons ≥ 0 | economy tick | **proposed:** missing provider → no demand (today's null), never a guess |
| `individuals(market, day)` | Life → `consumption` | persons ≥ 0 | economy tick | proposed new pure query |
| `perCapitaPerDay` | Life (requirement, life-21) → `consumption` | count/person/day | per day | null = no demand |
| `hours`, `reservationWage?`, `productivity` | Life → wage quote, Settlement | person-h, money, 0..n | pure (§16–§19) | — |
| intention with cause | Cognition → buy/sell/offer/accept/takeMass | — | when resolved | refusal → `shared.action.outcome` failed, with a reason |
| kg into the body | Economy → Life (`eatMeal`, later one transfer) | kg ≥ 0 | in the intention's transaction | both engines restored (F5) |
| harvested mass | Life plant_state → inventory (IF-42) | kg → count by weight | Life step, then Economy | **planned:** one transfer, Life debits, Economy credits |
| travel days | host map (later Reality/Life) → ship | days ≥ 0, ∞ = unreachable | at dispatch | unreachable → refused |
| issue/retire | Government process → Settlement `credit`/`debit` | money | logged | process required |
| prices, quotes, stock reads | Economy → Cognition (perception), Society, Government | money/count | after the tick | — |
| spoiled and consumed mass | Economy → waste store (Reality/Life, M4) | kg | economy tick | **planned** (today a sink) |

Tick order (CONTRACTS §9): Settlement's tick, then Economy: production, shipments, spoilage, consumption, prices, advance (`config.ts` TICK_ORDER).

### §5 Evidence

| Item | Source | Label |
|---|---|---|
| King–Davenant table (5 rows) | Davenant 1699 (ECON-DAV) | measured (period statement), exact at the rows; f(0)=1 derived; cap 5.5 assumption |
| Jevons' fit | RESEARCH §1, V-F1 | superseded (misses by up to 6.4%) |
| surplus floor 0.5–0.7 × base | ALIGNMENT §10 illustration; Barbados/London sugar | assumption |
| `shortage-linear` 0.7–3.0 | ALIGNMENT §10 | fiction (illustrative), not adopted |
| wages (Pennsylvania 1698, Navy 1653) | ECON-THO, ECON-RN | measured, not Caribbean; Caribbean rates calibrated estimate (ECON-9) |
| recipe yields (sugar per acre, rum per molasses, flour per wheat, charcoal per cord, salt per meat) | RESEARCH §5 (Ligon, Carr–Menard, Jefferson, Hoffman) | measured where cited, else calibrated estimate; molasses per hogshead, fish curing, lumber per tree and labour per unit have none (ECON-10) |
| coin as money; pieces of eight rating | ECON-BOJ, ECON-ANS | measured |
| transit risk on the buyer from the fill | Institutes 3.23.3, RESEARCH §7 | measured (legal source) |
| price-time priority at the resting ratio | Harris 2003 | measured (institutional practice) |
| dealers quote new media themselves | Spufford 1986 | measured |
| fixed-coefficient recipes | — | assumption |
| inelastic, free aggregate demand | — | assumption (evidence 4); V-F3 |
| geometric spoilage per day step | — | assumption; rates null |
| kg per unit (`Good.weight`) | host data; cask size (RESEARCH §4) | calibrated estimate |
| every rate in tests and three-ports | fixtures | not a claim |

### §6 Status

D designed · I implemented · C connected · N numerically checked · V empirically validated.

| Mechanism | D | I | C | N | V |
|---|---|---|---|---|---|
| recipe produce/available/rates | yes | yes (E2) | Settlement (I1, I2) | E2, V1 | no (ECON-5, ECON-10) |
| abstract production | yes | yes | three-ports | V1 | no; to be retired |
| inventory holdings | yes | yes | Settlement, Life (F1) | V1 to 1e-9 | n/a (conservation) |
| spoilage | yes | yes (E6) | transit (E10) | V1 | no; rates null |
| aggregate consumption | **redesign (§3.4)** | yes (E5), without the split | stub population | V1 | no |
| individual eating (takeMass→eatMeal) | **redesign to one transfer (§3.5)** | two writes (M1–M9, F1–F5) | Life (F), Cognition (IF-26 O-tests) | F2 energy to 1e-9 J | n/a |
| shortage | yes | yes | prices | V3 | definition |
| price rule | yes | yes (E8, E9, V3, V5) | stall trades | V3 bounds | King–Davenant vs its table: yes (V5); vs markets: **no** |
| exchange, offers, currencies | yes (v2) | yes (B, X, Q, M tests) | Settlement §20/§22; Cognition (demo) | conservation (T1, B) | no (the demo outcome is measured, not validated) |
| shipment | yes | yes (E10, RD1, SL1) | host map stub | V1 | n/a |
| wage quote | yes | yes (E12) | Settlement `setWage` (P1 2628/2631) | — | levels only, against Q10 benchmarks |
| accounting | yes | yes (E13) | ledger (I2) | identity | n/a |
| demand response, household budget | **no** | no | no | no | no |
| harvest into inventory (IF-42) | partly (Life DESIGN §2.4) | no | no | no | no |
| burial and waste, record objects | scope only | no | no | no | no |

### §7 Validation

Analytical results must hold exactly (1e-9 relative). Empirical tolerances are declared before the run, from the dispersion of the
source series itself. None is invented here, and an empirical check without opened data stays **not claimed**.

- **V1/V2 (held).** Goods balance per good and money constant, every command, for 365 days. Rerun on every interface change.
- **VE1 (E1): one eat = one transfer.** For a caused consume, the kernel journal holds exactly one entry for the flow: −q at
  `<inventory>/<good>` and +q at the body (kg). Stock falls by q/weight. Life's kept + waste energy = q·e_food (F2). A forced failure leaves both
  engines byte-identical (F5).
- **VE2 (E2): never both.** A paired fixture with the same seed: a market of n cohort members and one individual eater. Food leaving the
  inventory per day = n·perCapita (aggregate) + the individual's meal (takeMass), exactly. A run that counts the individual in headcount must
  fail the test. No kg is credited to both a cohort intake and a gut. A promotion and a demotion requested at midday take effect only at the boundary,
  with no extra meal debit, no omitted intake and no duplicated bodily stores, and population, inventory and body stores are conserved. (Agreed by Life,
  LN-2. M1a has one individual body and no cohort, so this test belongs to the cohort lane, EN-5 at E2. It waits on Life's cohort model (LIFE-32), not on CP-1 to CP-3.) Σ individuals + Σ cohort is invariant across a promotion (Life's transaction and test, LIFE-32; read here).
- **VE3 (M1a, provisioned against deprived).** The same seed and replay. Provisioned: stock ≥ need, and the inventory falls by exactly what bodies
  received. Deprived: stock 0, `takeMass` is refused `no-stock` on every attempt, and Life's reserves fall through its stated states. Outcomes are recorded, never tuned.
- **Price recovery: what would show it (`VALIDATION.md:42`, ECON-21, V-F3).** Today a price inside its clamp is no evidence of
  recovery. The rule is a function of stock alone, and stock recovers only if production exceeds consumption at that market.
  - *VR0, analytical, possible now; two tests, kept apart.* **Inventory:** with constant daily production P and consumption C, no other flows, the market at
    its reserve, and a one-off removal of D units after day d0's consumption step, stock first reaches the reserve again at the end of day d0 + ⌈D/(P − C)⌉
    when P > C (tick order: production before consumption, `config.ts` TICK_ORDER). It never reaches the reserve when P ≤ C. **Price, per rule:** `base`
    never moves, so it shows nothing about recovery. `king-davenant-table` and `shortage-linear` return to base on the first day the post-consumption stock ≥ reserve,
    and stay above base for ever when P ≤ C. The P = C case is the test that a bounded price is not a recovery. Exact to 1e-9.
  - *VR1, internal feedback (after a demand response exists):* a shock raises the price, consumption falls (cohort budget or minds'
    choices), stock rebuilds, and the price falls. The demand response must be **calibrated on data other than the King–Davenant table**.
    The table is already the price rule, so fitting demand to it would test a fit on the data that made it. Needed measurement: price and
    consumption around dearth years from an independent series. Candidates to open: Hoskins' harvest series and Clark's English prices.
    The statistic is the half-life of the price deviation after a bad harvest. Not claimed until a series is opened.
  - *VR2, spatial:* with freight in price (V-F2), the price gap between two linked markets after a local shock closes to the freight-plus-duty
    band through traders' fills. Independent data: grain-market integration studies (to research). Not claimed.
- **Recipe mass check (EN-6, at E6).** For every recipe whose material inputs and outputs are all represented with weights: |ΔM_process| ≤ 1e-9 × M(inputs),
  where waste is an output. Any other residual is listed as a discrepancy, per recipe. A recipe with an unrepresented input (water, air) is marked
  "boundary incomplete", naming the missing input, and no mass claim is made for it. Air and water may be measured or prescribed masses. Elemental balance is a separate claim, made only where
  Life (food) or Reality (substances, gases, reactions) supply composition and transformation data.
- **Spoilage step check (EN-8).** For constant k, one step of Δt and n sub-steps of Δt/n give the same S to 1e-12. Charging the same elapsed interval twice fails the test.
- **Superseded:** VALIDATION §2's sentence that unit 2645 checks "bounds, recovery". 2645 checks bounds only (VALIDATION-CHECK V4). VR0–VR2 replace that claim.

### §8 Build order (keyed to PLAN-SPEC §4; nothing is queued until Rex approves and the registry map is reconciled)

| Stage | Work (routing) | Needs | Smallest demonstration |
|---|---|---|---|
| E0 | Land this PLAN.md in the repo (composer copy); mark the old PLAN.md superseded | Rex's approval | — |
| **E1 (M1a)** | Contract section with Life: the `economy.goods.mass` kg ledger view and Life's body intake ledger; consume = one `transfer()` (codex ledger view; composer VE1 tests; Life's side in its own lane) | Life's body intake ledger; kernel unchanged | VE1: one journal entry per meal; rollback |
| **E2 (M1a)** | Never-both: cohort-only headcount + `individuals()` query (contract with Life); consumption refuses a fixed demand where individuals eat (codex; composer VE2) | Life's C-Q26 provider | VE2 paired fixture |
| E3 (M1a) | M1a paired run in the kernel harness with Life, Cognition and Reality's reach; Economy supplies the inventory and the refusal (composer, harness lane) | E1, E2, the CG-16 resolver | VE3 provisioned/deprived |
| E4 (M1b, M2) | Travel days from Life/Reality locomotion replace the host map; `labourHoursPerUnit` and `productivity` from Life capacity × Reality task demand (contracts first; codex) | Life DUP-15, Reality mechanics | fetching costs time and capacity; Q_labour moves with fatigue |
| E5 (M3) | Harvest IF-42: Life plant_state −kg → inventory +count in one transfer; abstract `productionPerDay` retired for modelled crops | Life plant growth, phase 19 | crop stock depends on soil, water, light |
| E6 (M4) | Spoilage and consumption sinks become transfers to Life/Reality waste stores; recipe residuals as waste goods; burial and waste services (old step 12) | Life decomposition, Reality soil | waste returns to soil |
| E7 (M5) | Demand response and household budget (with Society, DUP-59); VR0 then VR1; freight and duty in price (V-F2); affordability on Rex's ECON-26; wage rule (ECON-24, econ 6); Q15; DUP-58 assets | Rex's answers, Society households | VR0 exact; VR1 once data is opened |

VR0 needs no new mechanism and can run at any stage once units are allowed; it is listed at E7 only so that it lands with VR1.

**Carried and superseded.** Old `Toolchain/economy/PLAN.md` steps 1–10: done (carried in §6). Step 11 (realism hook) is superseded by E2–E3 (Life now owns population and
nutrition; ECON-22). Step 12 becomes E6. `P1.md` is the history of CONTRACTS §16 and superseded by it. `MULTI-ECONOMY-DESIGN-v1.md` is superseded by v2.
CONTRACTS §1–§23 stay authoritative for the interfaces and are cited, not restated. RESEARCH §1–§7 and TESTS.md stay as reference.

### §9 Work lanes (EN-) and checkpoints (CP-) (review of 2026-11-02, adopted)

EN ids name lanes of work. They are not build stages (E0–E7) and not issues (ECON-). Each lane says what exists, the rule, functional tests
and realism checks. The checkpoints describe claims; they do not force serial work, and existing exchange code can be tested before CP-3.

| Lane | Exists / needs | Rule | Functional tests | Realism | Stage | CP |
|---|---|---|---|---|---|---|
| EN-1 Good and food identity | `Good.food` exists (M6, M9); link to Life's preparation record and Catalogue's reference | one good → one Life composition record; Economy stores the reference, never a composition table | missing, unknown and mismatched references fail explicitly; two preparations never silently share a record | Life validates composition | E1 | 1 |
| EN-2 Quantity and mass | `weight`, `takeMass`/`addMass` exist; divisibility, packaging, condition changes not declared | m = n·w; withdrawal Δn = −q/w | round trip; partial portions; zero stock; invalid weights; repeated withdrawals drift-free; count and mass never diverge | w measured for the preparation and condition; an illustrative size is labelled | E1 | 1 |
| EN-3 Holdings and movements | inventories and `stockChanged` reasons exist; no per-account reconciler, no destinations for non-sale losses | closing = opening + receipts − issues, each change attributed to a flow | wrong account; unrecorded change; equal-and-opposite unrecorded changes; insufficient stock; competing withdrawals; authorisation recorded, never blocking | identity (verification only); historical holdings need evidence or a fixture label | E1 | 1 |
| EN-4 Inventory → gut transfer | agreed (DC-13, LIFE-19); today two writes | one q-kg entry, `economy.goods` kg view → `life.gut` `<body>/stomach`, one transaction | one debit and one credit; food identity; rollback; partial acceptance; one host outcome; no credit to absorbed stores | intake limits are Life's; Economy proves faithful transfer | E1 | 2 |
| EN-5 Individual / cohort consumption | aggregate path exists; split and feedback not | membership sets disjoint; D = N_c·c·Δt; actual = min(D, S); unmet = D − actual → Life | individual never in cohort demand; promotion/demotion preserves people, stores and already-counted intake; no stock → no credit; unmet is information, never a debit; a missing required input of an enabled mechanism → configuration error; approved defaults recorded | per-capita rates need evidence; a requirement is not actual intake | E2 | 2 |
| EN-6 Production and recipes | `produce` exists; quantities external (ECON-5) | batch extent x: inputs a_i·x, outputs b_j·x; x ≤ min_i S_i/a_i; ΔM_process over all inputs and outputs (§7) | limiting input; substitution; by-products; partial failure is atomic; mass balance or "boundary incomplete" | measured yields, labour and conditions; fixed coefficients only within their stated range | E4–E6 | 3 |
| EN-7 Harvest and extraction receipts | `addStock` and abstract production create from nowhere (ECON-32) | source −q kg, inventory +q through the kg view, one transfer | nothing appears without a source or a declared external input; receipt = the source's `taken` exactly, `taken` ≥ 0; depletion; rollback | Life/Reality validate yield; Economy validates receipt | E5 | 3 |
| EN-8 Spoilage and condition changes | spoilage exists; f defined in §2; no destination | f_Δt = 1 − e^(−kΔt); S(t+Δt) = S(t)·(1 − f_Δt); each elapsed interval charged once; lost mass to a named store | step consistency (one step = n sub-steps for constant k); f = 0 and 1; shelf and transit; condition change as a transformation; nothing vanishes unexplained | deterioration relations under declared storage conditions, from Life/Reality | E6 | 3 |
| EN-9 Exchange, offers, settlement | built (§20, §22, v2) | payment = q·p; barter ratio with a stated orientation; price-time priority | partial fills; expiry; insufficient assets (ECON-26 open); rollback; competing offers; currency separation; exactly once; per currency ΔΣbalances = issue − retire | evidence for the represented institution; an order book that works is not universal validation | built; E7 | 4 |
| EN-10 Transport and custody | shipments built; host travel days | origin → transit → destination; time from the transport provider | no duplicate in transit; delayed or unreachable; interrupted delivery; every loss has a destination or a declared boundary | journey models by their providers; title and risk need evidence for the scenario (RESEARCH §7) | E4 | 3 |
| EN-11 Demand, prices, budgets | price rules built; demand response and budget not | s = clamp(1 − S/R, 0, 1) for R > 0; p = p0·f(s); the demand response is a model to select | zero reserve; missing price; shocks (VR0); budget updates; observed demand only from the declared individual or aggregate path | independent price and quantity observations (VR1, VR2); reproducing a table is not market validation | E7 | 4 |
| EN-12 Accounting verification | accounting view built | revenue − expenses, with inventory valuation kept apart from cash | identity to the ledger; currency separation; a revaluation is never a cash receipt | identities only | built | 1 |
| EN-13 Labour quotes and payment | wage quote built | the quote follows its rule; payment follows the post (Settlement) | quote kept apart from payment; units of hours and rates; unpaid obligations | wage evidence for the setting (ECON-9, ECON-24) | E7 | 4 |

**Checkpoints.** CP-1 material accounting (EN-1, EN-2, EN-3, EN-12): goods are identified, measured and held in reconciled accounts. CP-2 food connection
(EN-4, EN-5 with Life): food reaches the right intake store once, and aggregate consumption never duplicates it. CP-3 production and logistics
(EN-6, EN-7, EN-8, EN-10). CP-4 economic behaviour (EN-9, EN-11, EN-13, with Cognition, Society, Settlement and Government).

**Harvest into Economy (GOV-28, agreed with Government 2026-11-02; Government PLAN §4.2 W2, shortfall GN-5).** Life's M3 yield (kg per holding per harvest day) enters
the household inventory once, as EN-7: one transfer debiting Life's harvested-yield account and crediting `<inventory>/<grain>` through the kg view, process
`life.harvest`, Life's trace id, receipt = Life's taken kg. Interim before EN-7: `addMass` with its cause (not `addStock`). The grain good has weight 1 kg/unit,
so there is no rounding residue. The configuration check refuses abstract production of the same good in the same inventory. Levy: Government's `moveStock`,
read and moved in one host transaction, moved = min(owed, stock); the shortfall is Government's obligation, never Economy debt. Stored-grain loss is EN-8.

**Ownership, unchanged by the review.** Element composition stays with the physical owner (Reality/Life). Economy references it, and with no composition it makes
no elemental claim. Money representation, precision, credit, issue and retirement stay Settlement's (CONTRACTS §3, §22). Economy's tests check that it uses
them, and there is no Economy money ledger. EN-1's Catalogue reference: check its exact evidence dependency before assuming any block.

**First demonstration (CP-2).** One person takes a measured portion of an identified bread good from an identified inventory, and exactly that mass enters
`life.gut` `<body>/stomach` once, in one entry, with one outcome. No absorption or hunger change is needed to pass. The fixture declares the stock
accessible and uncontested, and its authorisation (`authorised` by a declared household arrangement, or `unjudged`), in the configuration and the trace.

**Food-connection review: closed 2026-11-02.** Scope put forward for Rex's approval: EN-1–EN-3 (identity, composition resolution, units and holdings tests);
EN-4 (the inventory→gut transfer and linked-outcome tests, once Life's `life.gut` endpoint exists); EN-5 (design agreed; cohort implementation and
transition tests wait on LIFE-32). Physiological realism stays under Life's own model validation. No further design round; the next evidence is executable tests
once building is authorised.

**Not readiness evidence.** This plan and its cards make the checkpoints reviewable; none of them is evidence that a checkpoint passes. Once
EN-1–EN-4 are reconciled with Life, Kernel and Catalogue, the next step is executable tests, not more review of the food architecture.

### §10 Cards: EN-1, EN-2, EN-3 and the shared EN-4 contract

Seven items each: (1) mechanism and owner, (2) inputs, outputs, units and conditions, (3) rule, (4) evidence, (5) boundary and rollback tests,
(6) cross-engine test, (7) status as implemented · integrated · validated.

**EN-1 Good and food identity.**
1. Economy owns the reference on the good. Life owns the composition record. Catalogue owns the reference entity.
2. In: `Good.food` (Life food id, or null = not food), proposed `Good.catalogue` (Catalogue id; scheme to agree with Catalogue). Out: `foodOf(good)`. Applies to every good a consume can take.
3. One good = one preparation = one Life record. Different preparations (fresh bread, ship's biscuit) are different goods. There is never a fallback to another record.
4. Composition is Life's to validate. A preparation's identity needs a source per good (RESEARCH, GOODS.md), else it is labelled fixture.
5. **Missing data is not inedibility (review 2026-11-02).** There are three scenario-scoped states, and no universal edibility field: (a) the good is outside the scenario's
   supported ingestion pathway. A scenario's classification is not a physical fact: no physiological conclusion is invented for it, and it is never a stimulus Cognition
   learns from. An eat intention on such a good is a host/configuration error recorded in the trace, not an in-world outcome (corrected 2026-11-02, final review); (b) a declared food whose composition resolves
   unambiguously, which proceeds; (c) a declared food with missing or ambiguous composition, which **fails configuration before the run**. Case (c) is never an in-world
   `impossible` that Cognition could learn as a physical fact. Which goods are foods is scenario data. An unknown id → `life.gut` throws before anything moves. A mismatch between the entry's quantity and `foodOf(good)` → the kg view throws. The load check lists every food id shared by two or more goods for review and decides nothing.
6. The EN-4 harness test uses a mapped good, an unmapped good and a wrongly mapped good.
7. `Good.food` and `foodOf`: implemented (M6, M9), integrated with Life (F1–F5); preparation and Catalogue link: not implemented; validated: n/a.
8. **One authoritative mapping (agreed with Catalogue on 2026-11-02, as Catalogue amended it; Catalogue PLAN §8 stage B).** One key, pointing one way: the good
   carries `ref: catalogue/product.<slug>` (Catalogue kind `product`, one record per stated condition; there are no batch records, because a batch is Economy's run-time stock),
   and so does Life's composition row. Catalogue's record carries no Life id. `foodOf(good)` = the Life row with the same ref, resolved at load and
   re-checked on replay. `Good.food` becomes read-only and derived. A declared food whose ref has no Life row fails configuration (item 5c), and it is never read as not-food.
   **Run-pinned composition:** at load, each resolved food records its Life composition id and version (or content hash) in the run's configuration and on the
   outcome. Replay loads that version or fails explicitly on a mismatch, and never substitutes edited data silently. The resolution stays fixed for the whole run.
   The governing invariant is one unambiguous applicable composition per resolved food. **Agreed by Life on 2026-11-02 (LN-1 §1, §5; life PLAN A2):**
   every declared food resolves to exactly one row for its ref, and that row's stated condition must match the scenario's declared condition. A missing, duplicated
   or condition-mismatched row fails configuration before the run, and no outcome is ever emitted for it. At load, Life records each food id with a content hash of its rows
   (foods, foods_more, food_basis, food_refs). A replay against different content fails, naming the food. Invariants: at most one Life row per ref
   (agreed by Life on 2026-11-02, LN-1 §1 and §5: a duplicate throws at load; the refs live in Life's `nutrition.food_refs`). One ref = one preparation in one condition:
   a stale or dried good is a different Catalogue product, with its own ref, reached by an EN-2/EN-6 transformation and never a second Life row under the same ref. **Provenance (agreed with Catalogue on 2026-11-02).** A record's provenance is a required,
   non-empty set from PLATFORM §6 (real, prehistoric, mythological, fantasy, science_fiction, original_fiction), so a resolved ref never lacks provenance. Scope is `universal`
   or `game:<plugin>`. Per-value labels are researched / estimate / fiction / open, and `open` (no source) is never read as fiction or game-only. `check-refs` (build time) fails on
   dangling refs and on universal-scope data that refers to a `game:` record. At scenario load, Economy's loader calls `cat.permits(ref, {provenance, scope})` (Catalogue stage B).
   Its default is real/prehistoric/mythological plus universal (CAT-Q3, Rex); a scenario or test declares anything wider. On false the good is refused, and a refused
   declared food fails configuration (item 5c). The switch waits on Catalogue's product
   record (sourced sheet + haiku audit that must pass), check-refs, and Life's row carrying the ref. Until then `Good.food` stays the only editable field.

**EN-2 Quantity and mass.**
1. Economy owns the count n and `Good.weight` w. Mass is derived.
2. In: n (count, ≥ 0), w (kg/count, > 0, else mass commands refuse), q (kg, finite ≥ 0). Out: m = n·w, takenKg. Valid while the good's preparation and condition are fixed.
3. One authoritative state per good: n. Proposed `Good.divisible` (default true, today's behaviour: n is real, so 0.15 kg at 0.5 kg/unit removes 0.3 units, exactly).
   A discrete good (a tool, a sealed cask) refuses a fractional take. Taking part of one requires an explicit split or opening transformation (EN-6), with mass
   conserved. Container and contents are separate goods, so the edible mass is the contents good's. A drying or other change of condition is a transformation
   with a recorded flow (water out to Reality), never an edit of w.
4. w per good from a measured preparation (RESEARCH §4 cask, §5 yields); illustrative sizes are labelled fixture.
5. Round trip add q then take q restores n within 1e-12 (M3). Repeated withdrawals summing to the stock leave exactly 0, with no hidden gain (Σ takenKg = n0·w to 1e-9).
   Zero stock → 0 taken. Invalid w or q refuses with state and log untouched (M4, M5, M8). A discrete good refuses a fraction.
6. EN-4: the inventory debit in kg equals the `life.gut` credit to 1e-12.
7. Mass commands: implemented (M1–M9), integrated (F1–F5); divisible flag and split: not implemented; w validated: no.

**EN-3 Holdings and movements.**
1. Economy owns stock per (inventory, good) and the movement record. Settlement owns `Permission`. The physical resolution (Reality, Life) decides whether
   and how much is taken. Custody and lock state are not assigned here. Government and Society judge violations.
2. In: commands and transfers, after the resolver has established the quantity. Out: per-account reconciliation per day; `authorised | unauthorised | unjudged` (with the rule or source when assessed) on each take. Applies to every inventory.
3. closing(a, g) = opening(a, g) + Σ receipts − Σ issues, every change attributed to a flow (a `stockChanged` reason or a transfer entry). Non-sale movements have
   destinations: spilled → a place's store, broken → fragments or waste via a transformation, taken without authorisation → the taker's holding, leaving the model → a
   declared boundary with a named process. There is no balancing sink. An unexplained difference is reported as a discrepancy.
   Reconciliation is per native key (inventory, good) in count. Entries on the kg view are mapped back to it through the view's `native()` (EN-4, KRN-50).
4. Bookkeeping identity: verification only. Historical starting holdings need evidence or a fixture label.
5. A direct stock write outside a command is caught by the reconciler. Equal-and-opposite unrecorded changes on two accounts are caught per account, not by a global
   sum. Insufficient stock is refused with nothing changed. Two withdrawals the same day: in deterministic order, and the second gets the remainder. A take with no assessment
   records `unjudged`, never `unauthorised`. Economy moves exactly the resolver's quantity and never decides success. A permission withdrawal records the
   permission as its source. A rollback leaves the reconciliation exact.
6. With Settlement (`Permission` read) and the EN-4 harness (the take's authorisation value on the outcome payload; the M1a fixture's declared value).
7. Inventories and reasons: implemented and integrated (V1); reconciler, `authorised` and destinations: not implemented; validated: n/a.

**EN-4 Inventory → gut (shared with Life and Kernel; DC-13, LIFE-19).**
1. Economy writes the one entry. Life owns `life.gut` and everything after the stomach. Kernel owns `transfer()` and the transaction. The host resolution (History specifies, Kernel builds) emits the one outcome.
2. In: intention (cause, terms.kg), inventory, good, body. Out: one journal entry, quantity = Life food id, unit kg, from `economy.goods` kg view `<inventory>/<good>`, to `life.gut` `<body>/stomach`; `takenKg`; `refused` event. The transfer's process is `shared.action.consume` (registry); `realism.nutrition.eat_meal` is the mechanism row, not the process.
3. q = min(terms.kg, available kg, gastric room), all in kg; the room is null until {R-INTAKE} sources it. `impossible` before any transaction comes only from represented bodily and physical constraints: death record, 0 kg at the source, and "stomach full" once a sourced capacity exists (gut function is an absorption multiplier, not an ability to swallow). Invalid input and a good outside the ingestion pathway are host or configuration errors, recorded in the trace and never in-world outcomes. Other real constraints (inability to ingest, from Life; inaccessible food, from Reality's reach) need their own supported outcomes from their owners. Until then the M1a fixture declares access and does not claim them. `failed` (Rex, 2026-11-02): the rollback restores state, journal and transactional events, with zero entries, then the host emits exactly one `failed` outcome; expenditure committed before the failure stays. `completed` = one entry with the cause. Commands carry a logged `resolvedBy: 'host'` and emit no outcome. `eatMeal` never writes the mass again. Nothing is credited to absorbed stores at transfer time.
4. Intake limits and composition: Life. Economy's claim is faithful transfer only.
5. Exactly one debit and one credit. Partial acceptance takes q < terms.kg. An injected `life.gut` failure restores both engines' state, journal and event log byte for byte (F5), with zero entries. A mismatched quantity fails inside `transfer()` before anything moves. `life.gut` answers kg for a food id only at `<body>/stomach`, throws for any other quantity or account, and throws on a negative food-id delta, so it is never a consume source (Life lane LN-2).
   **Kernel's amendments (agreed 2026-11-02; Kernel PLAN §3.5 "View entries", KRN-50):** (A) the kg view's ledger implements
   `native(account, quantity, amount) → {account: <inventory>, quantity: <good>, amount: kg / w}`, so the reconciler counts the meal under the good's native
   count key, the same key as purchases. One stock never reconciles under two keys. This holds while w is fixed per good (EN-2), and a view without `native()` fails
   the check script. (B) The view's `snapshot()`/`restore()` cover all of the `economy.goods` state behind it, detached, and `restore` never throws. (C) The byte-for-byte
   restore includes Economy's command log (`resolvedBy: 'host'`) and the bus. Those sit in the host's outer transaction (DC-13), because `transfer()` alone does not snapshot them.
   The debit `apply` validates the food id before mutating anything, and `life.gut.unit()` throws on an unknown food (Life agreed), so the error comes before the first `apply`.
6. The kernel-harness test (VE1) and the first demonstration (§9).
7. Designed and agreed; implemented: no (today two writes, ECON-33); validated: n/a.
8. **Linked trace (review 2026-11-02).** An attempt may produce no transfer, so the attempt and its outcome exist apart from the material journal, linked by stable
   ids: intention (cause) → host outcome → transfer entries (each carrying the cause). From one eat attempt the trace recovers: the requested kg (terms.kg),
   the resolved food id and composition version, the accepted and executed kg, the reason for a refusal or a partial result, and the transfer entries, if any.
   Economy contributes `takenKg` and its `refused` event, tagged with the cause. Nothing is copied into every transfer.
