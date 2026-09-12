# Provider use and hackathon credit budget

OpenRouter redemption confirmed by Om's screenshot: $5 added. Current remaining balance
must be checked in the provider dashboard; the application cannot infer spending elsewhere.
Exa balance and expiry have not been verified. A subsequent authorized live check on
12 September succeeded and reported $0.007 for one cached public-reference search. This
does not establish the account's remaining balance. Never commit API keys or redemption codes.

## Where each provider belongs

| Provider | Use | Do not use for |
|---|---|---|
| OpenRouter | Agent reasoning, bounded tool selection, interpreting updates, sourced summaries | IDs, timers, retries, authorization, persistence or ordinary UI updates |
| Exa | Optional public background references for a coordinator to review | Patient data, witness statements, incident text, emergency instructions or replacing site procedures |

The Commander delegates only needed work. Specialists share a configured model but have
different tool permissions. There is no automatic multi-provider fallback or expensive
model escalation. Select a tool-calling model in `INCIDENTOS_MODEL` after checking its
current provider price; the repository deliberately does not guess a model or price.

## Proposed allocation, not money already spent

| Phase | OpenRouter allowance |
|---|---:|
| Wiring, unit tests and frontend development in fixture mode | $0 |
| First live agent integration | $1 |
| Rehearsal and corrections, unlocked after checking usage | $1 |
| Final demonstration reserve | $3 |

Start with `MODEL_BUDGET_USD=1`. If appropriate, increase it to `2` for rehearsals.
It is a cumulative limit for this database, not a fresh per-session allowance. Do not
delete the database to bypass accounting. Other tools or teammates using the same key
can spend credits outside this ledger, so reconcile with the provider dashboard.

## Implemented guards

- Fixture mode calls neither OpenRouter nor Exa automatically.
- Each OpenRouter call reserves $0.05 before sending; default maximum is 40 calls.
- Provider-reported cost replaces the reservation when available. Unknown-cost and
  failed calls retain their reservation. Usage survives server restarts in SQLite.
- One agent run has at most five model rounds, each with at most eight tool calls.
  Delegation is one level deep. These are ceilings, not a target number of calls.
- Prompts are size-bounded; model responses request at most 1,000 output tokens.
- No automatic model retry after provider errors. Failed work remains visible.
- `/api/usage` exposes consumed calls, reported cost and accounted cost separately.
- Optional image inspection shares this same allowance. It is disabled by default,
  cached per stored image, and limited to 400 output tokens. Never enable it just for animation.

**This is not a guaranteed dollar billing cap.** A selected model's actual request cost
can exceed the reservation. Set a provider-side key spending limit as well and use a
model whose worst-case request fits the reservation. Hitting the application guard stops
new calls; it cannot undo a charge already incurred. No live provider calls have been
made as part of the automated test suite.

## Exa: opt in only when it helps

`EXA_ENABLED=false` by default. When enabled, `POST /api/research` accepts only
`incident-documentation` or `handoff-communication`. Queries are fixed generic text,
limited to OSHA and Ready.gov, with three results and short excerpts per search.
Results are cached for 24 hours and marked as public references requiring human review.

`EXA_CALL_LIMIT=5` counts attempted calls, including failures, across restarts. It is a
call cap, not an Exa dollar cap. Check Exa's own balance and terms before enabling it.
The core incident workflow works without Exa, and agents do not search it on every update.

## Before switching live

1. Check both provider balances and expiry dates privately.
2. Create restricted API keys; redemption codes are not API keys.
3. Select and price-check one tool-capable OpenRouter model.
4. Configure a provider-side spending limit and keep the application allowance at $1.
5. Run one incident, inspect `/api/usage` and the provider dashboard, then decide whether
   another rehearsal is worth the spend. Do not run continuous paid polling.

References: [OpenRouter API](https://openrouter.ai/docs/api_reference/overview),
[usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting),
[Exa search](https://exa.ai/docs/reference/search).
