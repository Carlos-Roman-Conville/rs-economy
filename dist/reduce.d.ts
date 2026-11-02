import { Runner as KernelRunner } from '@rex/kernel';
import { type Command } from './commands.ts';
import { type EconomyConfig } from './config.ts';
import type { EconomyEvent } from './events.ts';
import { type Providers } from './providers.ts';
import { type EconomyState } from './state.ts';
export interface ReduceResult {
    state: EconomyState;
    events: EconomyEvent[];
    minted: string | null;
    taken: number | null;
    takenKg?: number;
}
export declare function reduce(state: EconomyState, command: Command, config?: EconomyConfig, providers?: Providers): ReduceResult;
export declare class Runner extends KernelRunner<EconomyState, Command, ReduceResult, EconomyEvent> {
    config: EconomyConfig;
    providers: Providers;
    constructor(state?: EconomyState, config?: EconomyConfig, providers?: Providers);
}
