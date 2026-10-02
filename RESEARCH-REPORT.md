# CGA Research Report — Continuum Generative Architecture, prototype v0

Date: 2026-10-02. Package: `continuumbrain/continuum-research/`
(Friday demos and the song side project are separate repos, untouched.)

## What was built and why

The ContinuumBrain-v1 build had the right harness but the wrong center: a
policy engine surrounded by research vocabulary, with nothing that learns or
generates. Worse, its one trainable piece was briefly pointed at folk lyrics.
This prototype replaces the center with a real (if tiny) generative loop
governed by the harness pieces that earned their keep:

- **Generator:** trigram sampler over 3,852 hand-fed tokens (216 texts),
  seeded RNG, temperature from the plasticity modulator.
- **Hand-fed training:** 138 machine-harvested lines (every one a verified
  engine derivation, policy text, refusal, or debt op) + 78 hand-authored
  grounding pairs (47 licensed conclusions, 31 refused overreaches).
- **Loop:** prompt → debt gate → cone recall → seeded sampling →
  residual pin → ledger entry. Refusals (debt, no-grounding) are first-class
  ledgered outputs. Full run: `npm run demo`.
- **Memory over the substrate:** 216 training texts mapped onto cone nodes;
  recall keeps only items reachable via live structural edges, so pruning
  measurably shrinks what the model can say.

## Experiment results (`npm run eval`, 16/16 PASS)

- **E1 debt-gates-generation:** clean authorizes, injected debt refuses naming
  unpaid items, repaid proceeds. Same prompt all three times.
- **E2 damage-degrades-gracefully:** mean recall intact 1.00 → P1 1.00 →
  P2 0.83 → P3 0.69 → recovered 1.00. Non-increasing under damage, no cliff,
  full recovery. (First version of this metric passed flat 1.00s and proved
  nothing; it was strengthened until it could see damage, caught a real
  test bug — recovery must be excluded from the monotonic chain — and now
  shows the hypothesized graceful curve.)
- **E3 identity-survives-damage:** residual chain verifies, hash queryable,
  debt refusal and clean generation both work post-Phase-3.
- **E4 modulators-move-outputs:** plasticity 0.2 vs 0.9 changes 3/3 sampled
  outputs; lenient generates ungrounded, strict refuses it.
- **E5 no-silent-generation:** every output ledgered, chain verifies.

## Honest limits

- The trigram substrate is a stand-in: claims cover architectural behavior
  (gating, recall, identity, modulation), never linguistic quality.
- Damage schedule is scripted; graph statistics are descriptive at this size.
- Determinism holds except the audit clock (same caveat as the policy demos).
- Falsifiers from ARCHITECTURE.md remain open invitations, not closed proofs:
  none have fired, but the harness is built to catch them, not to flatter.

## Reproduce

`npm run train` (retrains substrate) · `npm run demo` (loop showcase) ·
`npm run eval` (all five experiments, exit non-zero on any failure).
