import { type TransferLedger } from '@rex/kernel';
export interface MoneyLeg {
    from: string;
    to: string;
    currency: string;
    amount: number;
}
export interface GoodsLeg {
    from: string;
    to: string;
    good: string;
    units: number;
}
export interface LedgerRow {
    currency?: string;
    batch?: string;
    process?: string;
    id: string;
    day: number;
    kind: string;
    from: string | null;
    to: string | null;
    subject: string | null;
    amount: number;
    authority: string | null;
    note: string;
}
/** Money has one home (§3): Settlement's accounts in the pirate game. Economy keeps no balances. */
export interface LedgerProvider {
    balance(holder: string, currency?: string): number;
    /** The pirate host adds this optional seam in unit 5269. */
    exchange?(legs: {
        money: MoneyLeg[];
        goods?: GoodsLeg[];
    }, kind: string, subject: string | null, note?: string, goods?: TransferLedger): string[];
    transfer(from: string, to: string, amount: number, kind: string, subject: string | null, note?: string, 
    /** The goods leg of a paid exchange. `ledger` is the economy's goods TransferLedger, built by the economy inside
     *  the command that calls `transfer`; `from` and `to` are its accounts (inventory ids), `good` its quantity (a good
     *  id), `units` the amount (a finite number >= 0; fractions allowed). */
    goods?: {
        ledger: TransferLedger;
        from: string;
        to: string;
        good: string;
        units: number;
    }): string;
    rows(holder: string, fromDay: number, toDay: number): LedgerRow[];
}
/** Read-only view of a settlement (§4b); the host builds it from SettlementState each day. */
export interface SettlementReader {
    businesses(market: string): {
        id: string;
        inventory: string;
        account: string;
        status: string;
        open: boolean;
    }[];
    posts(market: string): {
        id: string;
        biz: string;
        role: string;
        wage: number;
        hours: number;
        filledBy: string | null;
    }[];
    production(biz: string, day: number): {
        recipe: string;
        q: number;
    }[] | null;
    hasFixture(market: string, fixture: string): boolean;
}
export interface PopulationProvider {
    headcount(market: string, day: number): number;
}
export interface LabourRow {
    category: string;
    persons: number;
    personHours: number;
}
export interface LabourSupply {
    /** The population's supply today by category (adult men, adult women, elders, children: Reality's
     *  categories); persons = cohort × health × (1 − sick share), health applied once; personHours = persons ×
     *  the host's hours per day (one number, Settlement's `hoursPerDay`, SET-12). */
    supply(day: number): LabourRow[];
    /** False while a person is aboard, dead or away: the host knows, the engines do not. */
    available(person: string, day: number): boolean;
    /** Person-hours a person or a pool offers for a role today. */
    hours(source: string, role: string, day: number): number;
    /** Person-hours a pool grants a post today: at most `wantedHours` and at most what it has not granted yet. */
    draw(pool: string, role: string, requires: unknown, wantedHours: number, day: number): number;
    /** 0..n output factor of a holder in a role; the host maps skill bands to it. */
    productivity(holder: string, role: string): number;
}
export interface TransportProvider {
    /** Travel days from one market to another; Infinity when unreachable. */
    days(from: string, to: string): number;
}
export interface Providers {
    ledger: LedgerProvider;
    population: PopulationProvider;
    labour: LabourSupply;
    transport: TransportProvider;
}
export declare class StubLedger implements LedgerProvider {
    balances: Record<string, number>;
    log: LedgerRow[];
    day: number;
    byCurrency: Record<string, Record<string, number>>;
    currencies?: {
        isCurrency(id: string): boolean;
    };
    private checkCurrency;
    balance(holder: string, currency?: string): number;
    exchange(legs: {
        money: MoneyLeg[];
        goods?: GoodsLeg[];
    }, kind: string, subject: string | null, note?: string, goods?: TransferLedger): string[];
    transfer(from: string, to: string, amount: number, kind: string, subject: string | null, note?: string, goods?: {
        ledger: TransferLedger;
        from: string;
        to: string;
        good: string;
        units: number;
    }): string;
    rows(holder: string, fromDay: number, toDay: number): LedgerRow[];
}
export declare class StubPopulation implements PopulationProvider {
    counts: Record<string, number>;
    headcount(market: string): number;
}
export declare class StubLabourSupply implements LabourSupply {
    rows: Record<number, LabourRow[]>;
    table: Record<string, number>;
    away: Set<string>;
    factors: Record<string, number>;
    private grants;
    set(source: string, role: string, hours: number): void;
    supply(day: number): LabourRow[];
    available(person: string, _day: number): boolean;
    hours(source: string, role: string, _day: number): number;
    draw(pool: string, role: string, _requires: unknown, wantedHours: number, day: number): number;
    productivity(holder: string, role: string): number;
}
export declare class StubTransport implements TransportProvider {
    table: Record<string, number>;
    set(from: string, to: string, days: number): void;
    days(from: string, to: string): number;
}
/** A SettlementReader over plain lists, for tests of the labour market without a settlement engine on disk. */
export declare class StubSettlementReader implements SettlementReader {
    bizRows: Record<string, {
        id: string;
        inventory: string;
        account: string;
        status: string;
        open: boolean;
    }[]>;
    postRows: Record<string, {
        id: string;
        biz: string;
        role: string;
        wage: number;
        hours: number;
        filledBy: string | null;
    }[]>;
    productionRows: Record<string, {
        day: number;
        lines: {
            recipe: string;
            q: number;
        }[];
    }>;
    fixtures: Record<string, string[]>;
    businesses(market: string): {
        id: string;
        inventory: string;
        account: string;
        status: string;
        open: boolean;
    }[];
    posts(market: string): {
        id: string;
        biz: string;
        role: string;
        wage: number;
        hours: number;
        filledBy: string | null;
    }[];
    production(biz: string, day: number): {
        recipe: string;
        q: number;
    }[] | null;
    hasFixture(market: string, fixture: string): boolean;
}
export declare function stubProviders(): Providers & {
    ledger: StubLedger;
    population: StubPopulation;
    labour: StubLabourSupply;
    transport: StubTransport;
};
