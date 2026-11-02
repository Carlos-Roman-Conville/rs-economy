// reduce(state, command, config, providers) -> { state, events, minted, taken }: pure; a failed command throws and
// the caller's state is untouched. The Runner keeps a state and a command log so a run replays (E3).
import { Runner as KernelRunner } from '@rex/kernel';
import { apply } from "./commands.js";
import { assertPriceRule, defaultConfig } from "./config.js";
import { nonempty } from "./context.js";
import { stubProviders } from "./providers.js";
import { initialState } from "./state.js";
export function reduce(state, command, config = defaultConfig(), providers = stubProviders()) {
    const ctx = { state: structuredClone(state), config, providers, events: [], minted: null, taken: null };
    if (command.cause !== undefined)
        nonempty(command.cause, 'cause');
    apply(ctx, command);
    if (command.cause !== undefined) {
        for (const event of ctx.events)
            event.cause = command.cause;
        if (command.type === 'offer' || command.type === 'accept') {
            const refused = ctx.events.find(e => e.type === 'refused');
            const fills = ctx.events.filter(e => e.type === 'offerFilled');
            const payload = refused ?? ctx.events.find(e => e.type === 'offerPosted') ?? fills[0] ?? ctx.events[0];
            if (payload) {
                const { type, cause, ...fields } = refused ?? { type: 'refused', cause: command.cause };
                ctx.events.push({ type: 'shared.action.outcome', cause: command.cause,
                    status: refused ? 'failed' : 'completed',
                    stimuli: refused ? [fields] : [{ fills: fills.length, units: fills.reduce((n, e) => n + e.gave.units, 0) }], payload });
            }
        }
        if (command.type === 'buy' || command.type === 'sell' || command.type === 'takeMass' || command.type === 'exchange') {
            const payload = ctx.events.find(event => event.type === 'refused' || event.type === 'bought' || event.type === 'sold' || event.type === 'exchanged'
                || (command.type === 'takeMass' && event.type === 'stockChanged'));
            if (payload) {
                let stimuli;
                if (payload.type === 'refused') {
                    const { type, cause, ...fields } = payload;
                    stimuli = [fields];
                }
                else if (payload.type === 'bought' || payload.type === 'sold') {
                    const { good, units, price, amount, market, inventory } = payload;
                    stimuli = [{ good, units, price, amount, market, inventory }];
                }
                else if (payload.type === 'exchanged') {
                    stimuli = [{ legs: payload.money.length + (payload.goods?.length ?? 0), txns: payload.txns.length }];
                }
                else if (command.type === 'takeMass') {
                    stimuli = [{ inventory: command.inventory, good: command.good, kg: ctx.takenKg }];
                }
                else {
                    stimuli = [];
                }
                ctx.events.push({ type: 'shared.action.outcome', cause: command.cause,
                    status: payload.type === 'refused' ? 'failed' : 'completed', stimuli, payload });
            }
        }
    }
    const result = { state: ctx.state, events: ctx.events, minted: ctx.minted, taken: ctx.taken };
    if (command.type === 'takeMass')
        result.takenKg = ctx.takenKg;
    return result;
}
export class Runner extends KernelRunner {
    config;
    providers;
    constructor(state = initialState(), config = defaultConfig(), providers = stubProviders()) {
        assertPriceRule(config.priceRule);
        super(state, (current, command) => reduce(current, command, this.config, this.providers));
        this.config = config;
        this.providers = providers;
    }
}
