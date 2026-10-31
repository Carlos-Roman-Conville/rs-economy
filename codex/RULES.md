# Rules for Codex (and any belt worker) in `Toolchain/economy`

1. Read `README.md`, then the `CONTRACTS.md` section your task names. It is the spec, byte-identical with
   `../settlement/CONTRACTS.md`. `CONTRACTS.md` §12 and `RESEARCH.md` list what Rex has not decided: never answer one
   of those in code; a config key whose default changes nothing, or an explicit "not decided" throw, is the only
   allowed placeholder.
2. The engine imports no game and no other engine (`@rex/kernel` is allowed once adopted). Cross-engine needs are
   provider interfaces in `src/providers.ts`; a contract block there is byte-identical to the block in `CONTRACTS.md`.
   Never edit `CONTRACTS.md` in a unit.
3. Goods, recipes, holders, markets, roles, pools and persons are the host's opaque strings: never parsed or
   interpreted here. Engine ids come from `mint` only (`inv`, `mkt`, `ship`, `ord`, `org`).
4. `reduce` clones the state first; a command either applies whole or throws. Every number a host could choose is a
   config key in `src/config.ts`, marked proposed.
5. Deterministic everywhere: no `Math.random`, no `Date.now`; records are walked in insertion order and that order
   reaches float sums, so never re-key or sort state; a replayed log mints the same ids (E3).
6. Style matches the package: TypeScript strict with `erasableSyntaxOnly` (no parameter properties, no enums),
   `verbatimModuleSyntax` (`import type`), ES modules with `.ts` import suffixes, one describe per TESTS.md row, test
   titles naming the rule. Add the row to `TESTS.md` with the test.
7. Run only your own tests while working (`npx vitest run test/<file>.test.ts -t '<name>'`); the runner runs the Gate
   (the whole suite, the typecheck, and the pirate web suite).
8. Change only the files the task names. Never touch `Games/RPG's/pirate-ship` from an economy-package unit. Never push.
9. One commit, not pushed, ending with `Co-Authored-By: OpenAI Codex <codex@openai.com>`. Nothing left uncommitted.
10. Close with a short report: done or parked, tests run, commit hash. A disagreement with the spec is parked in the
    report, not resolved in code.
