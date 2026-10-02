# Continuum Generative Architecture (CGA) — research prototype

A novel AI model design in which generation is **governed**, not merely
prompted: every output passes through debt gating, cone-structured memory,
residual identity, and neuromodulatory control. The generator itself is a
deliberately tiny statistical substrate (trigram, trained on-device); the
research contribution is everything around it. Swap in any stronger generator
without changing the architecture.

## 1. The problem with the default stack

A standard small generator maps prompt → output with no memory of what it
was told, no record of what it concluded, no identity across sessions, and no
mechanism that can refuse. Retrieval-augmented pipelines add context but treat
it as suggestion text: stale, duplicated, or missing context degrades output
silently. Nothing in the loop can say "I should not answer yet."

## 2. The architecture

```
prompt
  │
  ▼
[1] DEBT GATE (ContextDebtNet)
│   context ledger versions every premise, constraint, intent, why.
│   debt = (stale + duplicated + missing) / live entries.
│   debt > 0  →  REFUSE with the exact unpaid items (no generation runs).
│   debt = 0  →  proceed, citing the balanced ledger.
  │
  ▼
[2] CONE RECALL (substrate memory)
│   three-scale graph: local columns → meso modules → global hubs.
│   recall returns the highest-affinity stored items for the prompt.
│   recalled items enter the generator as grounding - the model may only
│   speak from recalled evidence plus the live prompt.
  │
  ▼
[3] GENERATE (substrate, replaceable)
│   seeded sampler over learned counts. Temperature comes from the
│   plasticity modulator, never from the prompt.
  │
  ▼
[4] RESIDUAL PIN + LEDGER (identity + audit)
    residual.reanchor() pins the output hash; the ledger entry chains it.
    The same session, damaged or not, keeps one identity: the residual
    chain, not the cone contents.
```

Modulators (`setPlasticity`, `setRefusalStrictness`, `getState`) are the only
controls: plasticity scales sampling temperature AND repair rate; strictness
scales the debt threshold AND the refusal boundary. Both are logged per output.

## 3. What is actually novel

1. **Debt as a hard gate, not a prompt.** Prior art (RAG, guidelines,
   constitutions) asks the generator to behave. Here an indebted context
   cannot reach the generator at all — refusal is structural, enforced by
   code path, and itself ledgered.
2. **Memory with damage semantics.** The cone is not a vector store; it is a
   three-scale graph with a scripted degradation schedule (binding prune →
   disconnection → residual preservation). This makes forgetting *measurable*:
   recall quality vs pruning level is a curve, not a vibe.
3. **Identity separated from content.** The residual chain identifies the
   session even when the cone is heavily pruned. Most systems identify by
   weights or history; here identity is an explicit hash-chained object with
   query/hash/reanchor semantics.
4. **Refusal as first-class output.** Refused, escalated, and authorized
   generations are all ledgered citizens with derivations — the silence of a
   refusal carries the same provenance as an answer.

## 4. Honest limits (what would change my mind)

- The trigram substrate is a stand-in. Claim scope: architectural behavior,
  not linguistic quality. A stronger generator must reproduce the gate
  curves, or the claim shrinks to trigrams.
- The damage schedule is scripted, not emergent from use. Real deployment
  would need damage driven by actual load/age metrics.
- Scale is toy (hundreds of memory items). The power-law/rich-club/small-world
  statistics are descriptive at this size, not discoveries.
- Falsifiers: (a) an indebted context that still generates; (b) a pruned cone
  whose recall does not degrade monotonically; (c) two sessions sharing one
  residual chain; (d) a modulator setting with no measurable output effect.
  The experiment harness tests exactly these.

## 5. Experiments (each deterministic, seeded, PASS/FAIL)

- E1 debt-gates-generation: indebted context → refusal naming unpaid items;
  repaid context → generation proceeds. Same prompt both times.
- E2 damage-degrades-gracefully: mean recall measured at intact, after
  each damage phase, and after recovery; curve must be non-increasing,
  never a cliff to zero before Phase 3, and Phase-3 residual recall stays
  above zero with recovery restoring the baseline.
- E3 identity-survives-damage: residual hash chain verifies and session
  verdicts match pre-damage verdicts after each phase.
- E4 modulators-move-outputs: plasticity 0.2 vs 0.9 changes sampled output
  distribution (measured distinct continuations); strictness high refuses a
  borderline context that strictness low passes.
- E5 no-silent-generation: every output (including refusals) has a ledger
  entry; ledger verifies end to end.

## 6. What this is not

Not a product, not a chatbot, not a claim about frontier capability, not a
replacement for the policy demos. It is the missing piece those demos kept
gesturing at: a generator with something to lose — memory it can corrupt,
debts it must pay, an identity it must keep.
