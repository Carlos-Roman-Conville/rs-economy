// What this engine asks of the host (CONTRACTS.md §3, §4b, §4c, §5). The engine imports no other engine; the host
// implements these from @rex/settlement, @rex/realism, its map and its population model, or the stubs below.
import { finite, nonempty, simTime, transfer, TransferJournal } from '@rex/kernel';
// In-memory stubs for tests and examples.
export class StubLedger {
    balances = {};
    log = [];
    day = 0;
    byCurrency = {};
    currencies;
    checkCurrency(id) {
        if (id !== 'money' && !this.currencies?.isCurrency(id))
            throw new Error(`unknown currency: ${id}`);
    }
    balance(holder, currency = 'money') {
        this.checkCurrency(currency);
        const balances = currency === 'money' ? this.balances : this.byCurrency[currency];
        return balances && Object.hasOwn(balances, holder) ? balances[holder] : 0;
    }
    exchange(legs, kind, subject, note = '', goods) {
        if (legs.goods !== undefined && !goods)
            throw new Error('goods legs require a goods ledger');
        if (goods && legs.goods === undefined)
            throw new Error('goods ledger requires goods legs');
        for (const leg of legs.money) {
            this.checkCurrency(leg.currency);
            nonempty(leg.from, 'from');
            nonempty(leg.to, 'to');
            finite(leg.amount, 'amount', 0);
        }
        for (const leg of legs.goods ?? []) {
            nonempty(leg.from, 'from');
            nonempty(leg.to, 'to');
            nonempty(leg.good, 'good');
            finite(leg.units, 'units', 0);
            goods.unit(leg.from, leg.good);
            goods.unit(leg.to, leg.good);
        }
        const money = {
            id: 'stub.money',
            unit: (_account, currency) => { this.checkCurrency(currency); return 'money'; },
            apply: (account, currency, delta) => {
                const next = this.balance(account, currency) + delta;
                if (currency !== 'money' && !Object.hasOwn(this.byCurrency, currency)) {
                    Object.defineProperty(this.byCurrency, currency, { value: {}, enumerable: true, writable: true, configurable: true });
                }
                const balances = currency === 'money' ? this.balances : this.byCurrency[currency];
                Object.defineProperty(balances, account, { value: next, enumerable: true, writable: true, configurable: true });
            },
            snapshot: () => structuredClone({ balances: this.balances, byCurrency: this.byCurrency }),
            restore: snapshot => {
                const saved = snapshot;
                this.balances = saved.balances;
                this.byCurrency = saved.byCurrency;
            },
        };
        const t = simTime(this.day * 86_400_000);
        const requests = [];
        for (const leg of legs.money)
            if (leg.amount > 0 && leg.from !== leg.to)
                requests.push({
                    t, process: 'economy.trade.trade', quantity: leg.currency, unit: 'money', amount: leg.amount,
                    from: { ledger: money, account: leg.from }, to: { ledger: money, account: leg.to },
                });
        for (const leg of legs.goods ?? [])
            if (leg.units > 0)
                requests.push({
                    t, process: 'economy.trade.trade', quantity: leg.good, unit: goods.unit(leg.from, leg.good), amount: leg.units,
                    from: { ledger: goods, account: leg.from }, to: { ledger: goods, account: leg.to },
                });
        transfer(new TransferJournal('economy.stub-ledger'), ...requests);
        const batch = `txn.${String(this.log.length + 1).padStart(4, '0')}`;
        return legs.money.map(({ from, to, currency, amount }) => {
            const id = `txn.${String(this.log.length + 1).padStart(4, '0')}`;
            this.log.push({ id, day: this.day, kind, from, to, subject, amount, authority: null, note,
                ...(currency === 'money' ? {} : { currency }), batch });
            return id;
        });
    }
    transfer(from, to, amount, kind, subject, note = '', goods) {
        if (!Number.isFinite(amount) || amount < 0)
            throw new Error(`amount must be a number >= 0`);
        if (goods === undefined) {
            this.balances[from] = this.balance(from) - amount;
            this.balances[to] = this.balance(to) + amount;
        }
        else {
            const money = {
                id: 'stub.money',
                unit: () => 'money',
                apply: (account, _quantity, delta) => { this.balances[account] = this.balance(account) + delta; },
                snapshot: () => structuredClone(this.balances),
                restore: snapshot => { this.balances = structuredClone(snapshot); },
            };
            const t = simTime(this.day * 86_400_000);
            const requests = [];
            if (amount > 0 && from !== to)
                requests.push({
                    t, process: 'economy.trade.trade', quantity: 'money', unit: 'money', amount,
                    from: { ledger: money, account: from }, to: { ledger: money, account: to },
                });
            if (goods.units > 0)
                requests.push({
                    t, process: 'economy.trade.trade', quantity: goods.good,
                    unit: goods.ledger.unit(goods.from, goods.good), amount: goods.units,
                    from: { ledger: goods.ledger, account: goods.from }, to: { ledger: goods.ledger, account: goods.to },
                });
            transfer(new TransferJournal('economy.stub-ledger'), ...requests);
        }
        const id = `txn.${String(this.log.length + 1).padStart(4, '0')}`;
        this.log.push({ id, day: this.day, kind, from, to, subject, amount, authority: null, note });
        return id;
    }
    rows(holder, fromDay, toDay) {
        return this.log.filter((row) => (row.from === holder || row.to === holder) && row.day >= fromDay && row.day <= toDay);
    }
}
export class StubPopulation {
    counts = {};
    headcount(market) { return this.counts[market] ?? 0; }
}
export class StubLabourSupply {
    rows = {};
    table = {}; // key `${source}:${role}`, person-hours
    away = new Set();
    factors = {}; // key `${holder}:${role}`
    grants = new Map();
    set(source, role, hours) { this.table[`${source}:${role}`] = hours; }
    supply(day) { return this.rows[day] ?? []; }
    available(person, _day) { return !this.away.has(person); }
    hours(source, role, _day) { return this.table[`${source}:${role}`] ?? 0; }
    draw(pool, role, _requires, wantedHours, day) {
        const key = JSON.stringify([pool, role, day]);
        const granted = this.grants.get(key) ?? 0;
        const hours = Math.max(0, Math.min(wantedHours, this.hours(pool, role, day) - granted));
        this.grants.set(key, granted + hours);
        return hours;
    }
    productivity(holder, role) { return this.factors[`${holder}:${role}`] ?? 1; }
}
export class StubTransport {
    table = {}; // key `${from}>${to}`
    set(from, to, days) { this.table[`${from}>${to}`] = days; this.table[`${to}>${from}`] = days; }
    days(from, to) { return from === to ? 0 : (this.table[`${from}>${to}`] ?? Number.POSITIVE_INFINITY); }
}
/** A SettlementReader over plain lists, for tests of the labour market without a settlement engine on disk. */
export class StubSettlementReader {
    bizRows = {};
    postRows = {};
    productionRows = {};
    fixtures = {};
    businesses(market) { return this.bizRows[market] ?? []; }
    posts(market) { return this.postRows[market] ?? []; }
    production(biz, day) { const r = this.productionRows[biz]; return r && r.day === day ? r.lines : null; }
    hasFixture(market, fixture) { return (this.fixtures[market] ?? []).includes(fixture); }
}
export function stubProviders() {
    return { ledger: new StubLedger(), population: new StubPopulation(), labour: new StubLabourSupply(), transport: new StubTransport() };
}
