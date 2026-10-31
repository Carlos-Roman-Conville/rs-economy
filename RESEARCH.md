# Research for the economy's open rows (economy keeper, 2026-10-30)

Rex's rule (ENGINES.md, 2026-10-30): historical data fills an answer wherever it exists; he rules only where there
is none. Each row of `files/pirate-ship/STARTING_TOWN.md` that is the economy's gets a value here with one of three
labels: **researched** (source named), **estimate** (derived from research, derivation shown), **fiction** (no data;
a proposal for Rex). Source keys are the pirate repo's (`files/pirate-ship/SOURCES.md`, section "Economy sources";
GOODS.md Part 4 keys such as L, J, PY, ML, PO keep their meaning). Nothing here is adopted until Rex approves the
row; the engine's defaults stay as they are (`priceRule: base`, `wageRule: posted-median`, quantities from the host).

## 1. econ 5: the price formula (researched + estimate)

**What the period supports (researched).** The one period statement of how price answers scarcity is the
King–Davenant table, printed by Charles Davenant in 1699 (ECON-DAV; data credited to Gregory King, c. 1696): a
shortfall of the corn harvest raises the price above the common rate thus:

| Harvest short by | Price above common |
|---|---|
| 1/10 | +3/10 |
| 2/10 | +8/10 |
| 3/10 | +16/10 |
| 4/10 | +28/10 |
| 5/10 | +45/10 |

Caribbean price series already in GOODS.md 1h show the same shape in trade goods: Bordeaux wine at Amsterdam 81–162
guilders a tun in peace and 360–450 in the 1690s war (PO; about ×3); logwood £5 a ton at the camps against £25–30
sold from Jamaica in 1670 (DV, CSP); tobacco 1–2d a lb at the plantation and 15d in London (CSP, TR). Sugar at
Barbados 3d a lb against 12d in London (L). Those gaps mix freight, duty and profit with scarcity, so they bound the
curve rather than fit it.

**Proposed rule (estimate).** Price = base × f(shortage), where shortage = 1 − stock / targetReserve (0 when the
reserve is met, 1 when empty; the engine's existing reading). Treat the harvest deficit as the shortage: f(0) = 1,
f(0.1) = 1.3, f(0.2) = 1.8, f(0.3) = 2.6, f(0.4) = 3.8, f(0.5) = 5.5, and **interpolate the table linearly
between rows** (exact at every row, monotone, no fitted constant). Corrected 2026-10-30 (VALIDATION.md V-F1): this
section first proposed Jevons' fit, f(s) = 0.824 / (0.88 − s)², but checked against the table it misses by up to
6.4% (+6.4% at 0, +4.2% at 0.1, −1.0% at 0.2, −5.8% at 0.3, −5.9% at 0.4, +3.8% at 0.5), gives f(0) = 1.064 so a
market at its reserve would price above base, and has a pole at s = 0.88. Beyond the table's last row the price is
held at 5.5 × base (an extrapolation, estimate): the table never reached famine. A surplus (stock above reserve) has no period table; the
illustrative linear curve of ALIGNMENT §10 puts the floor at 0.7 × base, and the Barbados/London sugar gap says a
glutted producer market sits at a quarter of the consumer price, so a floor between 0.5 and 0.7 is an estimate
with that range. **Default proposed:** `priceRule: { kind: 'king-davenant-table', cap: 5.5 }` (the curve researched as the
table itself; the cap an estimate). The engine keeps `base` until Rex approves; the new kind is one function in
`queries.ts` when he does.

## 2. econ 6: wage levels per trade (researched + estimate)

Ownership agreed with the settlement keeper (2026-10-30): Settlement owns Q10 and writes each wage once in its
`rules.json`, from its own benchmarks (Morris: England 1700 craftsman 2s, labourer 1s 2d a day, colonies about
double; the Navy's rates; Lilly 10s a day by warrant 1692; Exquemelin's carpenter and surgeon shares; its proposed
labourer 2s, journeyman 4s, master 6s a day) plus ECON-THO from this table. The economy's econ 6 row points at Q10
for levels and keeps only "may a market quote move Post.wage" as fiction for Rex. This table is research only.

| Trade | Rate | Place, date | Label | Source |
|---|---|---|---|---|
| House and ship carpenter, bricklayer, mason | 5s–6s a day, "constantly" | Pennsylvania, 1698 | researched (colonial, not Caribbean) | ECON-THO |
| Journeyman tailor | about 12s a week with board | Pennsylvania, 1698 | researched | ECON-THO |
| Journeyman shoemaker | 2s a pair, men's or women's | Pennsylvania, 1698 | researched | ECON-THO |
| Harvest labourer | 3s–4s a day with diet | Pennsylvania, 1698 | researched | ECON-THO |
| Able seaman, Royal Navy | 24s a lunar month; ordinary seaman 19s | England, set 1653, unchanged to 1797 | researched | ECON-RN |
| Merchant seaman | about 25s a month by mid-century; higher in war | Britain, 18th c. | estimate (secondary summary; Rediker's 1700–50 figures not opened) | ECON-RED |
| Craftsmen, Port Royal | "wages comparable to those in England" (John Taylor, 1680s) | Jamaica, 1680s | researched, unverified (a thesis's summary of Taylor; the page could not be opened) | ECON-EKU |
| White plantation artisans | £20–30 a year with keep | Jamaica, later 18th c. | researched, late | ECON-EKU |
| Skimmings spirit, the one wage-adjacent price | half a crown a gallon | Barbados, 1650s | researched | L |

**Estimate for the Caribbean port, c. 1690–1720:** skilled building trades 5s–6s a day (the colonial rate; Taylor
says Port Royal paid at least English rates, and a sugar island short of white artisans would not pay less);
unskilled labour 2s–3s a day without diet (the harvest rate less the diet, a derivation not a record); seamen 24s a
month ashore as the floor (the Navy rate a man could always fall back on), 30s–45s in a merchantman in wartime
(Rediker's range, unverified). Settlement's `hoursPerDay: 10` makes a day wage one post-day. These are proposals
for Q10's placeholders, labelled estimate until a Jamaica or Barbados wage record is opened (Sloane 1707 vol. I
introduction and Taylor's manuscript are the places to look; neither was reachable this session).

## 3. econ 1 / GOODS Open 2: money or goods (researched)

- **Pieces of eight were the currency.** Jamaica's Assembly rated Spanish and Mexican pieces of eight at 5s and
  the Peruvian at 4s in 1681 (ECON-BOJ); Queen Anne's proclamation of 1704 set full-weight pieces at 6s in the
  plantations against 4s 6d sterling, re-enacted by Parliament in 1707 after most colonies ignored it (ECON-ANS).
  Newton's 1711 figure of 4s 6d intrinsic is already in GOODS.md row 117 (SB, EU). Sugar also passed as money in
  Barbados (servants sold for pounds of sugar: L).
- **Gold dust was a trade good priced by the troy ounce,** about £4 an ounce on the Gold Coast in the 1720s (ECON-ATK,
  published 1735), and the Royal African Company's gold went to the Mint as guineas (ECON-RAC).
- **Pearls were a fished commodity,** taxed by the Spanish crown at a fifth of production; the Pearl Coast fisheries
  were in decline by the 17th century and no 17th-century price was found (ECON-WAR).

**Default proposed (researched):** coin is money, not a good: the ledger's unit is the piece of eight, rated by the
host (5s Jamaica 1681; 6s after 1704), and silver plate, bar and coin found as prize convert to ledger money at the
rated value; gold dust and pearls are goods with stock and a price (gold dust by the ounce, basePrice from ECON-ATK
as a late estimate; pearls open).

## 4. GOODS Open 3, 4, 5, 7, 8 (from GOODS.md Parts 1–4 plus the keys below)

| Row | Value | Label | Basis |
|---|---|---|---|
| Open 3, grain of goods | keep three sugar grades (muscovado 3d, London muscovado 12d, white 20d a lb: three prices in one source); keep beef and pork apart (the Navy contract issues them separately); keep logwood apart from the other dyewoods (its own price series), one "other dyewood" good otherwise | researched | L; PHY-RATION; DV, CSP |
| Open 4, raw / manufactured pairs | the turn existed in the period and on the island: Barbados planters made muscovado and white sugar and distilled the skimmings; so keep the pairs apart and keep the recipes | researched | L |
| Open 5, live cargo | horses and turtle were traded goods (horses about £12 each from New England; turtle carried live by the buccaneers), so they are goods; the death rate in transit is not in any source opened | goods: researched; death clock: fiction | PY; D |
| Open 7, names | "kill-devil" is Ligon's word (1657) and "rum" is Johnson's (1724), both period; the game's one name per good is a style choice | fiction (Rex), research recorded | L; J |
| Open 8, cask size | one 63-gallon hogshead for sugar, molasses and rum fits the 17th-century evidence (two Barbados hogsheads held nine hundredweight; the 1730 large cask is a tobacco rule) | estimate (GOODS.md 1j shows the derivation) | ML, WC, VA30 |

## 5. ECON-5: recipe quantities where period yields are documented

| Recipe | Figure | Label | Source |
|---|---|---|---|
| Sugar cane → muscovado | 2,000–4,000 lb of sugar an acre, 3,000 "a medium"; a curing pot holds 30–35 lb | researched | L |
| Skimmings / molasses → spirit | the plantation's still made about £30 a week of spirit at half a crown a gallon, so about 240 gallons a week beside 3,000 lb-an-acre sugar | researched (Ligon) | L |
| Molasses → rum | about 1.5 gallons of molasses to 1 gallon of rum (a teaching text, no period citation); New England 1770: 6.5 million gallons of molasses imported, about 5 million gallons of rum made (0.77 gal per gal) | estimate: 0.7–1.0 gallon of rum per gallon of molasses | ECON-WES; ECON-CMT |
| Tobacco | about 1,710 lb a worker a year (1680–99); about three acres of tobacco a worker (Carr and Menard) | researched (per worker); estimate 570 lb an acre | ECON-TOB; ECON-CM |
| Wheat → flour | 5–5½ bushels of wheat (about 280 lb) to a 196-lb barrel of fine flour | researched, late (Jefferson's Farm Book) | ECON-TJ; FL |
| Pork, beef → salt meat | about two bushels of salt to 1,000 lb of pork, beef needing more (a secondary account); two bushels of salt a barrel of herring (the British excise assumption, Adam Smith) | estimate: 2 bushels of salt per 1,000 lb of meat or per barrel of fish | ECON-SALT; ECON-SMI |
| Wood → charcoal | 35–40 bushels of charcoal a cord of wood, a good collier | researched, 18th–19th c. iron furnaces | ECON-HOF |
| Hogs | sold live at a groat (4d) a pound, 6d when flesh was dear | researched | L |
| Cattle, horses | working cattle 25s a head usual (50s in a seller's market); horses £4–10 | researched | L |

Not found: molasses per hogshead of sugar; period fish-curing yields; lumber per tree; labour per unit for any
trade. Those stay host fixtures until a source is opened.

## 6. Rows that are fiction (Rex's alone, recorded only)

econ 2 (`port.cash` as treasury), econ 3 (who values property: Ligon's plantation prices, £400 for 500 acres before
sugar and £7,000 for half of it with stock after, are the only period valuations opened, and they are not town
buildings), econ 4 (named characters' spending), Q9 (idle fixtures), GOODS Open 1 and Open 6 (Rex's by his word).

## Log

| Date | What |
|---|---|
| 2026-10-30 | Written from the sources above; the STARTING_TOWN.md rows wait for the settlement keeper to finish its own before this file's values go in |
