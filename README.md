# SafeSlackForce

SafeSlackForce is the repository for IncidentOS, a Slack-first incident coordination system
with a central Commander agent, specialist agents, and a live 3D command center.

The current product, architecture, Slack workflow, frontend direction, and Om/Ritesh work split
are documented in [the implementation plan](docs/INCIDENTOS-SLACK-BUILD-PLAN.md).

For the direct ownership checklist and integration checkpoints, use the
[separate build split](docs/BUILD-SPLIT.md).

Backend work is on `feat/om-backend-agents`. Start with the
[backend setup and frontend API contract](docs/BACKEND-SETUP.md) and
[OpenRouter/Exa credit budget](docs/CREDIT-BUDGET.md).

For the exact implementation status and remaining live setup, see
[Om's backend readiness checklist](docs/OM-BACKEND-READINESS.md).
Ritesh owns only frontend/UI; all agent and backend logic is under `apps/api`.
