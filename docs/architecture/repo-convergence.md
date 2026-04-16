# Repository Convergence Strategy

## Source repositories

- `MyAika` — primary product repository.
- `MyAikaPersonalAssistant` — duplicate companion app repo with near-identical architecture.
- `OpenAegis` — external security, policy, and approval platform.

## Strategy

1. **Make `MyAika` the product center of gravity.**
   - Keep the existing `apps/server`, `apps/web`, `packages/shared` topology.
   - Retain the working voice, avatar, and RAG systems already implemented in MyAika.

2. **Treat `MyAikaPersonalAssistant` as a secondary clone.**
   - Do not invest in separate feature branches across both repos.
   - Use it as a validation source for product documentation and demos.
   - Migrate any unique or missing modules into `MyAika` if found.

3. **Integrate `OpenAegis` as the guardrail layer.**
   - Add an OpenAegis policy adapter in `MyAika/apps/server/src/core/openAegisAdapter.js`.
   - Use OpenAegis for policy decisions, approvals, audit, and kill-switch controls.
   - Retain local safety config in `config/policy.json` for standalone operation.

## Overlap map

| Area | MyAika | MyAikaPersonalAssistant | OpenAegis | Keep/Merge/Retire |
|---|---|---|---|---|
| Companion UI | Yes | Yes | No | Keep MyAika |
| Server + Orchestrator | Yes | Yes | No | Keep MyAika |
| Memory / RAG | Yes | Yes | No | Keep MyAika |
| Safety / approvals | Yes | Yes | Yes | Merge OpenAegis safety model |
| Policy config | Yes | Yes | Yes | Keep local + add OpenAegis adapter |
| Tool registry | Yes | Yes | Yes | Merge where useful |
| Enterprise governance | No | No | Yes | Use OpenAegis as security layer |

## Convergence actions

- Create `docs/architecture/repo-convergence.md` and `docs/architecture/target-state.md`.
- Keep `MyAika` as the main working repo.
- Introduce a `core` integration layer inside `apps/server/src/core` for orchestrator, agent contracts, memory schema, and OpenAegis bridge.
- Update `apps/server/persona.json` and create `config/aika_personality.yaml` for the new AIKA personality.
- Add documentation for memory schema and security policies.

## Recommended merge decisions

- `Keep`: `MyAika/apps/server`, `MyAika/apps/web`, `MyAika/config`, `MyAika/docs`, `MyAika/packages/shared`.
- `Merge`: `OpenAegis` policy/approval/audit model into a service bridge.
- `Retire`: duplicate `MyAikaPersonalAssistant` repository as an independent product line after consolidation.

## Next step

- Start with a bootable `MyAika` core foundation.
- Add an OpenAegis adapter and agent contract scaffolding.
- Build personality and memory schema artifacts.
- Prepare a new local integration route and docs to prove the architecture.
