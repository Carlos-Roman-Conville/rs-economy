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

## 7. ECON-30: who bears the loss of cargo lost at sea

Question (ISSUES ECON-30, design v2 §5.9): when an offer fills across islands the goods travel in a shipment that can
be lost, and today title passes at the fill, so the receiver bears the loss with no compensation. Labels as above.
Keys for this section (URLs in the list at the end): ECON-POI, ECON-WBO, ECON-ROM, ECON-FED, ECON-DOS, ECON-WGA,
ECON-MAT, ECON-ECH, ECON-LEO, ECON-PSY.

### 7.1 Risk in transit, by contract form

| Form | Who bore the loss at sea, and when it passed | Period, place | Label | Source |
|---|---|---|---|---|
| Commenda / colleganza, unilateral (investor supplies all the capital) | The investor ("commendator", Venetian *stans*) bore all loss of the capital; the travelling partner bore none of it and lost only his labour. Profit split 3/4 investor, 1/4 traveller. The capital stayed the investor's throughout, so title never passed | archetypal form in the statutes and contracts of Genoa, Venice, Amalfi, Marseilles, Barcelona; the first statute is Pisa's *Constitutum Usus*, 1156; Venice's *Usus Venetorum* gives the colleganza primacy over custom. Dubrovnik differed (no 3/4–1/4 rule) | researched | ECON-POI |
| Commenda, bilateral (traveller adds capital, usually half the investor's) | Loss shared 2/3 investor, 1/3 traveller (profit 1/2–1/2): loss follows each side's capital | same ports | researched | ECON-POI |
| Venetian rule on a lost colleganza | The traveller must account in detail and swear to it, "except those who suffered a shipwreck or robbery", for whom "the ancient custom" holds. So a loss at sea or by robbery discharges him from the oath, not from the account | amendment of 1229 | researched | ECON-POI |
| Sea loan (*foenus nauticum*, *cambium maritimum*), bottomry (loan on the ship), respondentia (loan on the cargo) | The lender bore the risk of the voyage ("acts of God or pirates"): the sum is forgiven if the vessel is lost. The lender's return is "interest" plus an "insurance premium" for that risk, and he does not bear the risk of buying and selling the goods. Title to the ship or cargo stayed with the borrower, charged to the lender | Greek bottomry in the 4th c. BC (Demosthenes, *Against Zenothemis*); Genoa and Venice at the time of the Crusades. Genoese rates, late 12th c.: about 50% to Syria, 25–30% to Sicily, 20–30% to North Africa, 10–20% to Sardinia, Corsica and southern France (Hoover, quoted by Poitras). Poitras warns that the fixed return may be disguised expected profit, and that the form may hide a commenda or an evasion of usury | researched | ECON-POI, ECON-WBO |
| Straight sale, delivery at the port of loading | Risk passes to the buyer once the sale is made: *emptione perfecta periculum transit ad emptorem* (Justinian's Institutes 3.23.3; Digest 18.6.8 pr). Whether the rule is classical or Justinian's own is disputed in the scholarship. Modern FOB and CIF are the same shape: the risk passes at the port of shipment (on board, since Incoterms 2010) even though CIF has the seller buy the insurance | Rome (Justinian, 6th c.); FOB/CIF from modern commercial law | researched (Rome; modern); no medieval or 17th-c. sale contract found | ECON-ROM, ECON-FED |
| Straight sale, delivery at destination (the shape of "ex ship" or "to arrive" terms) | By the form of the contract the seller bears the loss until delivery. I found no source for how often medieval or Caribbean merchants used it, and none for the Roman exceptions to *periculum est emptoris* beyond the statement that "periculum est venditoris" appears in some Digest texts | not found | **estimate** (follows from the term's meaning, not from a dated contract) | ECON-ROM |

Not found: a notarial sale that states where risk passes; the Roman exceptions in detail; the Caribbean practice for
sales (the Ligon and CSP prices in sections 1–2 are delivered or loaded prices, not stated to be either).

### 7.2 General average

**What qualifies.** A deliberate sacrifice of part of the ship or cargo (the classic case is jettison, throwing goods
overboard to lighten a ship in a storm) to save the rest from a common danger, and the voyage then succeeds. The three
elements are common danger, a voluntary sacrifice, and a saved outcome (ECON-WGA). Goods lost by the storm itself,
unchosen, do not qualify: the loss lies where it fell (the principle is the sacrifice for others, ECON-DOS).

**Who contributes, and how much.** All the parties to the venture share the loss pro rata; the owners of the goods
thrown out sue the carrier, who recovers from the owners of the goods saved ("pro rata sarcire damnum jacturae",
Cujas, quoted by ECON-DOS). Lex Rhodia de iactu, Digest 14.2: Paul's *Sentences* (and Digest 14.2.1) state that what
was given for all must be made good "by the assessment of all" (ECON-WGA, ECON-MAT). The text may come from the
Rhodian sea law (an early form dated about 800 BC by the Wikipedia article; the original is lost; ECON-WGA) or be a
Roman jurists' creation, which the scholarship leaves open (ECON-DOS). I did not retrieve the Digest's rule for how
ship, freight and cargo are valued, so the proportion is "by value, pro rata" and no more (**researched** for the pro
rata principle; the valuation basis is **not found**).

**Later practice.** The rule passed through the Rôles d'Oléron (art. VI) and the Consolat de Mar (ch. CXVIII) to the
Hanseatic, Genoese, Catalan and Amsterdam codes; the 1681 French *Ordonnance de la marine* shaped later codes; the York–
Antwerp Rules codified it in 1890 (ECON-WGA, ECON-MAT). So general average is old and constant across the whole
period the game covers.

### 7.3 Marine insurance

| Item | Figure | Period, place | Label | Source |
|---|---|---|---|---|
| Datini policy | 1,200 gold florins of goods, Genoa to Palermo, premium 54 florins = 4.5% of the insured value | December 1385, Genoa/Florence (the Datini firm bought the cover) | researched, from a project summary of the policy, not the contract text | ECON-ECH |
| Pisan merchant's policy | 100 florins insured with a Genoese merchant at 7.5%; goods cheese and leather, Palermo to Pisa | 1347 | researched, same caveat | ECON-ECH |
| Registration | policies had to be entered in a public register and taxed at 0.5% of the insured value | end of the 14th c., Genoa | researched, same caveat | ECON-ECH |
| Buyers and sellers | the buyers were merchants insuring their own cargo; the cover was written by several underwriters sharing a risk, and the same firm (Borromei) both bought and sold cover | Genoa and Florence, 14th c.; Borromei in London, 1438 (broadcloth to Bruges, 5.86%) | researched | ECON-LEO, ECON-ECH |
| London pricing | premiums are always a percentage of the insured value (ship, cargo or freight); in the 17th century London rates fell by more than half and in some cases 75% as English trade and colonial re-exports (tobacco, sugar) grew; policies were bought by merchants (Marescoe bought 108 policies from 31 underwriters in 47 months from 1664) and covered Virginia, Barbados and India | London, 1600s | researched | ECON-LEO |
| West Indies rates | a dozen London/Bristol–Jamaica rates in 1740 ran 2.5–5% (mean 4.3%); peacetime rates later 2–2.25% (1775). I found no 17th-c. West Indies rate | 18th c. | researched, not the period; no 17th-c. figure | ECON-LEO |
| Claim terms | a London underwriter of the 1660s was criticised for paying late (3 to 6 months) and deducting 10–15% from a claim in addition to the premium; paying a higher premium avoided the deduction; Hamburg and Amsterdam were preferred for cover | 1660s–70s | researched | ECON-LEO |

Amsterdam's premium lists are covered by Spooner's *Risks at Sea* (1983) but I read nothing from it, only its 1766–80
dates; the Amsterdam 17th-c. rate is **not found**.

### 7.4 What this gives the engine

For a plain fill between two holders: the period has no single rule. Every contract in 7.1 puts the loss on whoever
holds the capital at risk: the investor in a commenda, the lender in a sea loan, the buyer after a sale at the port of
loading, the seller in a sale delivered at destination. The risk follows ownership of the goods in transit, and a
price was set to compensate for it (a sea loan's premium, 10–50% of a Genoese loan; insurance, 4.5–7.5% in the 14th c.).
Insurance was the way a merchant who bore the risk laid it off.

### 7.5 Proposed mechanism

**Proposed mechanism** (the smallest set the sources support; nothing here is an engine rule until the Economy keeper
adopts it):

- **(a) Default for a plain cross-market fill: the receiving holder bears the transit risk, from the moment of the fill.**
  The form: a straight sale with delivery at the port of loading, in which the buyer owns the goods from the sale
  (ECON-ROM, Justinian's Institutes 3.23.3; the same shape as FOB and CIF, ECON-FED). This matches what the engine does
  today, so the existing rule is **researched** for the form, not merely an estimate. Why it is the right default for a
  simple barter or sale between two holders: it is the one form in 7.1 that needs no third party and no later
  accounting, and in a sale (unlike a commenda or a sea loan) there is no continuing owner-lender relationship to put
  the loss on. The sources do not support a seller-bears default; that is the "delivery at destination" form, which
  the sources show only as a contract term.
- **(b) Contracts a host can choose** (each optional; none is the default):
  1. *Delivery at destination* (seller bears loss until arrival): the same fill with a different risk holder; owner
     **Economy** (it owns the fill and the shipment). Label: estimate; no dated source.
  2. *Sea loan* (lender bears the voyage risk, repaid with premium on safe arrival, forgiven if lost): a credit
     contract with a rate decided by the host; owner **Settlement** (it owns debt and credit between holders). Label:
     researched (ECON-POI, ECON-WBO).
  3. *Commenda* (investor bears all capital loss, traveller bears none and shares profit 3/4–1/4): a partnership in
     goods carried; owner **Society** (it owns partnerships and shares). Label: researched (ECON-POI).
  4. *General average* (a sacrifice to save the shipment is shared pro rata by value among everyone with goods
     aboard): owner **Economy**, since only the shipment knows what was aboard. Label: researched for the principle
     (ECON-WGA, ECON-DOS); the valuation basis is open.
  5. *Insurance* (a premium of a fixed share of the insured value, paid by the owner at risk to an underwriter who
     pays the loss; the 14th-c. range is 4.5–7.5%): owner **Settlement**. Label: researched for the figures (ECON-ECH,
     ECON-LEO); the claim deduction of 10–15% is a 1660s London detail.
- **(c) Left open by the sources: fiction for Rex.**
  - **fiction**: the chance that a shipment is lost on a given leg. No source opened gives a loss rate per voyage
    (insurance premiums give the price of the risk, 2–7.5%, not the frequency; a premium of 4.5% is not a 4.5% chance
    of loss because it includes the underwriter's costs and margin).
  - **fiction**: whether a host starts with insurance available at all (14th-c. Genoa had it; the Caribbean island
    towns of the game's period are not shown to have had local underwriters; Marescoe bought cover in London, not in
    Barbados).
  - **fiction**: partial loss versus total loss, and who pays the cost of recovering a wreck: the sources opened say
    nothing.
  - **fiction**: the cap for general average and the valuation rule (Digest 14.2's valuation text was not retrieved).

### 7.6 Sources

- ECON-POI: Poitras, "From Commenda to Joint-Stock Company", ch. 5 of *Equity Capital*, https://www.sfu.ca/~poitras/Equity-Capital_ch5.pdf
  (commenda shares and loss, the 1156 Pisan statute, Venice's 1229 amendment, sea-loan risk and Genoese rates; read in full text).
- ECON-WBO: "Bottomry", https://en.wikipedia.org/wiki/Bottomry (lender bears the risk; Demosthenes; respondentia; secondary).
- ECON-ROM: Konstantinović and others on *periculum est emptoris*, search listing https://ceeol.com/search/article-detail?id=1110876
  and https://revistas.usp.br/rfdusp/article/view/67893 (abstracts only; classical-or-Justinianic dispute).
- ECON-FED: Federal Court of Australia, Stewart J, "World in a Box", https://www.fedcourt.gov.au/digital-law-library/judges-speeches/justice-stewart/stewart-j-20200923
  (FOB and CIF: risk passes at the port of shipment; read as a search summary).
- ECON-DOS: Dostalík, "Lex Rhodia de iactu and general average", *Gdańskie Studia Prawnicze*,
  https://czasopisma.bg.ug.edu.pl/index.php/gdanskie_studia_prawnicze/article/view/5251 (full text
  https://czasopisma.bg.ug.edu.pl/index.php/gdanskie_studia_prawnicze/article/download/5251/4580; pro rata, Cujas).
- ECON-WGA: "General average", https://en.wikipedia.org/wiki/General_average (elements, Paulus, Oléron, 1681, York–Antwerp; secondary).
- ECON-MAT: Mataix, "Lex Rhodia & the transmission of ancient maritime custom", https://msrg.blogs.lincoln.ac.uk/?p=510
  (D.14.2.1; Oléron VI and Consolat de Mar CXVIII; abstract only).
- ECON-ECH: ECONOMICHISTORY project report (Datini 1385 and 1347 policies, 0.5% tax), https://cordis.europa.eu/project/id/295710/reporting/fr
  (read as a search summary; the contract texts not seen).
- ECON-LEO: Leonard, "The pricing revolution in marine insurance", https://www.histproj.org/completed/LEONARD_Marine insurance pricing revolution.pdf
  (Borromei 1438, London falls of 50–75%, Marescoe, Jamaica rates 1740 and 1775; read in full text).
- ECON-PSY: "How 12th-century Genoese merchants invented the idea of risk", https://psyche.co/ideas/how-12th-century-genoese-merchants-invented-the-idea-of-risk
  (first *resicum* contract, Genoa, 26 April 1156; context only, not read beyond the search listing).

Not opened and flagged: Ceccarelli's Datini-archive study (https://emis.univie.ac.at/journals/JEHPS/Juin2007/Ceccarelli_Risk.pdf,
server error) and Iodice on Genoese general average and insurance (link dead); those are the first places to confirm
the premium figures and the Genoese general-average valuation.

## Log

| Date | What |
|---|---|
| 2026-10-30 | Written from the sources above; the STARTING_TOWN.md rows wait for the settlement keeper to finish its own before this file's values go in |
| 2026-11-01 | Section 7 added: ECON-30, transit risk by contract form, general average, insurance, proposed mechanism |
