# Independent check of the validation tests (unit 2647, 2026-10-30)

Checked by a reader who did not write `test/validation.test.ts`. Sources: `VALIDATION.md` §2 and §4, `TESTS.md`
rows V1, V2, V4, the King–Davenant page (ECON-DAV, https://www.hetwebsite.net/het/essays/theorem/kingdavenant.htm,
read through a summarising fetch, so the transcription is checked against that copy, not a browser view), and
`src/config.ts` for `PriceRule` only. Tests were not run; this is a reading.

## V1 goods ledger: holds, with two weaknesses

Asserts the per-good equation `held + transit + consumed + spoiled = added + produced`, to 1e-9 relative, after every
command over 365 days, and that transfers net to zero. This is the equation `VALIDATION.md` §2 states, and the
test does pick up `add`, production (`abstract-production`, `produce:`, `byproduct:`), input consumption, and
the dedicated `consumed` and `spoiled` events, so each bucket is counted once.

- Weakness 1: `shipped` events and `ship:`/`arrive:` stock changes both feed `transfers`. Shipping and arrival still
  net to zero if both are emitted, so the netting check is weaker than it reads. It does not hide a loss, but it
  would not catch a double count on one side.
- Weakness 2: the goods list is taken from `runner.state.goods`, so a good that exists in no state and is never
  touched is never checked. Acceptable for the example, not a general proof.

## V2 money conservation: holds for the stated property, one hard-coded constant

Sums all ledger balances after every command and compares to 1000. The property (no money created or destroyed) is
asserted. Weakness: the 1000 is written in the test, and the replay funds each company with 500. The test is correct
only while the example has exactly two companies. A third company would fail it for a reason unrelated to money.
Should read the starting total from the replay's funding.

## V3 price bounds: holds

Checks each rule's own bounds at shortage 0, 0.25, 0.5, 0.75 and 1, with bases 0, 2 and 9. Finiteness and
non-null are asserted. The bounds for `base` are [1, 1] and for `king-davenant-table` [1, cap], both taken from
the rule. Bounds only: monotonicity of the table is V5's job, not V3's.

## V4 supply shock stability: holds for the shortage-linear rule only

Halves north's grain for days 60 to 89, then checks that producedLast is 15 during the shock and 30 otherwise,
that every price and balance is finite, that total money is 1000 each day, and that every price is within the
rule's bounds. This matches `TESTS.md` V4 and `VALIDATION.md` §2 for the bounds and money. Gaps against
`VALIDATION.md` §4 ("prices stay within the rule's bounds"): the test runs only `shortage-linear`, not each price
rule, and it checks bounds and finiteness but not recovery (that prices return toward base after day 90). The
§4 wording does not require recovery, so this is a narrower test than the stability claim in §2 implies.

## V5 King–Davenant table: holds against the source; one reference row is not a source row

Source table (ECON-DAV, copied from the page, values "above the common rate", in tenths):

| Defect (tenths) | Raises the price above the common rate | Multiple (1 + above) |
|---|---|---|
| 1 | 3 | 1.3 |
| 2 | 8 | 1.8 |
| 3 | 16 | 2.6 |
| 4 | 28 | 3.8 |
| 5 | 45 | 5.5 |

Test reference (`reference` in V5): `[0, 1], [0.1, 1.3], [0.2, 1.8], [0.3, 2.6], [0.4, 3.8], [0.5, 5.5]`.

- Rows 0.1 to 0.5: all five match the page exactly. **No mismatch.**
- Row 0 → 1: **not a source row.** The page has no zero-deficit row. Its only related statement is that average price
  is normalised at 1. Reading "no deficit, common rate, multiple 1" is a reasonable inference, but the test's comment
  calls it "the common rate at zero", which the source does not state. Labelled here as a derived point, not a
  finding against the table.
- The interpolation test checks only the midpoints of the five intervals, with base 2. That is consistent with
  linear interpolation and scaling by base, but a single midpoint per interval does not pin the whole segment.
  Accepted as holding for the claim made.
- The cap test (5.5 from 0.5, and 14 at base 2 with cap 7) matches the rule shape in `src/config.ts`. Holds.

## Verdict

Findings: V5 row (0, 1) is derived, not printed on ECON-DAV; V2 hard-codes the 1000 total; V4 runs only shortage-linear and checks no recovery; V1 sums shipping transfers from two event types (weak netting). The five printed V5 rows match the source exactly.
