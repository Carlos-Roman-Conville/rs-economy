// reduce(state, command, config, providers) -> { state, events, minted, taken }: pure; a failed command throws and
// the caller's state is untouched. The Runner keeps a state and a command log so a run replays (E3).

import { Runner as KernelRunner } from '@rex/kernel'
import { apply, type Command } from './commands.ts'
import { assertPriceRule, defaultConfig, type EconomyConfig } from './config.ts'
import { nonempty, type Ctx } from './context.ts'
import type { EconomyEvent } from './events.ts'
import { stubProviders, type Providers } from './providers.ts'
import { initialState, type EconomyState } from './state.ts'

export interface ReduceResult { state: EconomyState; events: EconomyEvent[]; minted: string | null; taken: number | null; takenKg?: number }

export function reduce(state: EconomyState, command: Command, config: EconomyConfig = defaultConfig(), providers: Providers = stubProviders()): ReduceResult {
  const ctx: Ctx = { state: structuredClone(state), config, providers, events: [], minted: null, taken: null }
  if (command.cause !== undefined) nonempty(command.cause, 'cause')
  apply(ctx, command)
  if (command.cause !== undefined) {
    for (const event of ctx.events) event.cause = command.cause
  }
  const result: ReduceResult = { state: ctx.state, events: ctx.events, minted: ctx.minted, taken: ctx.taken }
  if (command.type === 'takeMass') result.takenKg = ctx.takenKg
  return result
}

export class Runner extends KernelRunner<EconomyState, Command, ReduceResult, EconomyEvent> {
  config: EconomyConfig
  providers: Providers
  constructor(state: EconomyState = initialState(), config: EconomyConfig = defaultConfig(), providers: Providers = stubProviders()) {
    assertPriceRule(config.priceRule)
    super(state, (current, command) => reduce(current, command, this.config, this.providers))
    this.config = config; this.providers = providers
  }
}
