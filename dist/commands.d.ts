import { type Ctx } from './context.ts';
import type { MoneyLeg, GoodsLeg } from './providers.ts';
import type { AssetUnits, Good, MarketMode, Recipe } from './state.ts';
export type CommandCause = {
    cause?: string;
};
export type Buy = CommandCause & {
    type: 'buy';
    currency?: string;
    purpose?: 'tax' | 'debt';
    inventory: string;
    good: string;
    units: number;
    price?: number;
    priceMax?: number;
};
export type Sell = CommandCause & {
    type: 'sell';
    currency?: string;
    purpose?: 'tax' | 'debt';
    inventory: string;
    good: string;
    units: number;
    price?: number;
    priceMin?: number;
};
export type TakeMass = CommandCause & {
    type: 'takeMass';
    inventory: string;
    good: string;
    kg: number;
};
export type AddMass = CommandCause & {
    type: 'addMass';
    inventory: string;
    good: string;
    kg: number;
};
/** Delivery applies to this party's outgoing goods. Route endpoints are market ids, with travel days
 *  supplied by TransportProvider.days; inventory remains the party's receiving inventory on the offer market. */
export interface DispatchOptions {
    fromInventory?: string;
    deliver?: {
        route: {
            from: string;
            to: string;
        };
    };
}
export type Command = CommandCause & ({
    type: 'defineCurrency';
    currency: {
        id: string;
        issuer?: string | null;
        backing?: string | null;
    };
} | ({
    type: 'offer';
    market: string;
    by: string;
    inventory: string;
    give: AssetUnits;
    want: AssetUnits;
    expires?: number | null;
} & DispatchOptions) | ({
    type: 'accept';
    offer: string;
    by: string;
    inventory: string;
    units?: number;
} & DispatchOptions) | {
    type: 'withdraw';
    offer: string;
    by: string;
} | {
    type: 'exchange';
    market?: string;
    legs: {
        money?: MoneyLeg[];
        goods?: GoodsLeg[];
    };
    kind?: string;
    subject?: string | null;
    note?: string;
} | TakeMass | AddMass | {
    type: 'defineGood';
    good: Good;
} | {
    type: 'defineRecipe';
    recipe: Recipe;
} | {
    type: 'openInventory';
    holder: string;
    market: string;
} | {
    type: 'openMarket';
    id: string;
    mode: MarketMode;
} | {
    type: 'setMarketGood';
    currency?: string;
    market: string;
    good: string;
    consumptionPerDay?: number | null;
    targetReserve?: number | null;
    productionPerDay?: number | null;
    basePrice?: number | null;
    perCapitaPerDay?: number | null;
} | {
    type: 'addStock';
    inventory: string;
    good: string;
    units: number;
} | {
    type: 'removeStock';
    inventory: string;
    good: string;
    units: number;
} | {
    type: 'moveStock';
    from: string;
    to: string;
    good: string;
    units: number;
} | {
    type: 'produce';
    inventory: string;
    recipe: string;
    units: number;
} | {
    type: 'take';
    inventory: string;
    good: string;
    units: number;
} | {
    type: 'openOrganisation';
    name: string;
    kind?: string | null;
} | Sell | Buy | {
    type: 'ship';
    from: string;
    to: string;
    good: string;
    units: number;
    freight?: {
        payer: string;
        payee: string;
        amount: number;
    };
} | {
    type: 'loseShipment';
    shipment: string;
    to: string;
} | {
    type: 'tick';
});
export declare function apply(ctx: Ctx, command: Command): void;
