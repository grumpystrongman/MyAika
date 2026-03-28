---
children_hash: 2849af96a0d81a9a0533e7ce26eb3773beaff304f007ed2d843ee16f0bd771a2
compression_ratio: 0.7559633027522936
condensation_order: 1
covers: [aika_operating_model.md, context.md, operations_rollout.md]
covers_token_total: 545
summary_level: d1
token_count: 412
type: summary
---
# Aika Operating Model and Operational Rollout Summary

This domain provides the structural foundation for the MyAika execution environment, covering the 8-step execution protocol, intent-based command routing, and Docker-first deployment standards.

## Aika Operating Model
The operating model defines how Aika manages tasks through specialized lanes and a strict execution loop. Key components include:
* **Execution Protocol:** An 8-step cycle (Goal → Capability Map → Plan → Tool Routing → Execution → Evidence → Risks → Next Step) managed by the `laneExecutor`, `commandRouter`, and `intentProtocol` modules (`apps/server/src/aika/`).
* **Approval Policy:** Critical safety measures requiring manual approval for high-risk actions, including installs, deletions, secret handling, publishing, and git operations.
* **Execution Modes:** Supports advanced operational modes such as Mission Mode, Watchtower, and the Counterfactual Engine.
* **Reference:** [aika_operating_model.md] and [context.md]

## Operations Rollout
The deployment strategy focuses on a Docker-first architecture with enforced trust boundaries:
* **Infrastructure:** Operationalizes service lanes via `docker-compose.aika-stack.yml`, specifically targeting shell, worker, web, browser, Skyvern, and Opik lanes.
* **Trust Boundaries:** Implements separated browser trust profiles (low_trust, work_trust, high_trust) to isolate execution environments.
* **Security Constraints:** External write operations are gated via an MCP-lite approval system. Environment-specific configurations are mandatory for Skyvern and Opik integrations.
* **Reference:** [operations_rollout.md]