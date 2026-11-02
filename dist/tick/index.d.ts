import { TransferJournal } from '@rex/kernel';
import { type Ctx } from '../context.ts';
type Step = (ctx: Ctx, journal: TransferJournal) => void;
/** An abstract market adds its planned `productionPerDay` to its own stock (CONTRACTS.md §6); a settlement-run market
 *  produced through `produce` already. Then today's totals roll into `producedLast`. */
export declare function production(ctx: Ctx): void;
/** Shipments whose day has come land in their destination inventory (E10). */
export declare function shipments(ctx: Ctx, journal?: TransferJournal): void;
/** Every inventory, and every shipment in transit, loses `spoilagePerDay` of each good that has one (E6). Goods with
 *  null spoil nothing (open). */
export declare function spoilage(ctx: Ctx): void;
/** Demand per market good: `consumptionPerDay` when the host set it, else headcount × `perCapitaPerDay` when both exist,
 *  else none (open). Demand draws the market's own stock; what it cannot meet is `unmet` (E5). After the draw, a
 *  market good below its target reserve raises a `shortage` event (E7). */
export declare function consumption(ctx: Ctx): void;
/** Write today's price per market good by `config.priceRule` (E8); a good with no base price keeps null (E9). */
export declare function prices(ctx: Ctx): void;
export declare function advance(ctx: Ctx): void;
export declare const STEPS: Record<string, Step>;
export declare function tick(ctx: Ctx): void;
export {};
