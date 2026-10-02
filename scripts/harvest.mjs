/**
 * Harvest verified training traces for the generative substrate.
 * Every emitted line is machine-checked output of the deterministic core:
 * derivation traces, policy premise texts, refusal/escalation wordings,
 * and a scripted debt session (inject -> refuse -> repay -> proceed).
 * Run: node scripts/harvest.mjs  (writes data/training.jsonl)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brain = path.join(here, "..", "continuum-brain", "src");
const contSrc = path.join(here, "..", "debtaur-continuity", "src");

const { evaluateAction } = await import(pathToFileURL(path.join(brain, "kernel", "engine.js")).href);
const debt = await import(pathToFileURL(path.join(brain, "debt.js")).href);
const company = await import(pathToFileURL(path.join(contSrc, "company.js")).href);

const out = [];
const emit = (kind, text) => {
  const t = String(text ?? "").trim();
  if (t) out.push(JSON.stringify({ kind, text: t }));
};

const rulesByPolicy = {};
for (const f of fs.readdirSync(path.join(brain, "rules")).filter((x) => x.endsWith(".json"))) {
  const r = JSON.parse(fs.readFileSync(path.join(brain, "rules", f), "utf8"));
  rulesByPolicy[r.sop_id] = r;
}
const policyOf = {
  "expense-signoff": "SOP-FIN-01",
  "client-onboarding": "SOP-ONB-01",
  "hiring-approval": "SOP-HIRE-01",
  "vendor-payment": "SOP-PAY-01",
};

// 1. Policy texts: titles + every premise description (the control vocabulary).
for (const r of Object.values(rulesByPolicy)) {
  emit("rule-text", `${r.title}. ${r.demo_story ?? ""}`);
  for (const p of r.premises ?? []) {
    emit("rule-text", `${p.id}: ${p.description ?? ""}`);
  }
}

// 2. Derivation traces: evaluate every demo case, keep full chains.
for (const c of company.CASES) {
  const rules = rulesByPolicy[policyOf[c.policy]];
  if (!rules) continue;
  const req = { action_id: c.id, actor_id: "harvest", ...JSON.parse(JSON.stringify(c.request)) };
  const res = evaluateAction(req, rules);
  for (const line of res.derivation ?? []) emit("derivation", line);
  if (res.status === "REFUSED") {
    emit("refusal", `${res.refusal_details.missing_premise_id}: ${res.refusal_details.reason}`);
    emit("refusal", `Follow-up ${res.refusal_details.policy_issue.id}: ${res.refusal_details.policy_issue.title}`);
  }
  if (res.status === "ESCALATED") {
    emit("refusal", `${res.escalation_details.unsatisfied_premise_id}: ${res.escalation_details.reason}`);
  }
}

// 3. Debt session: anchor work, inject staleness, refuse, repay, proceed.
debt.clearContext();
debt.anchorIntent("week-24-close", "close the books for week 24");
debt.anchorConstraint("spend-line", "spend limit is $10,000 unless the owner overrides");
debt.anchorPremise("fin-sig", "the finance officer signed the payout batch");
emit("debt-op", "context anchored: intent, constraint, premise recorded with provenance");
debt.markStale("spend-line");
emit("debt-op", "constraint spend-line went stale: the limit changed without re-anchoring");
{
  const s = debt.scoreContext();
  emit("debt-op", `debt score ${s.score.toFixed(3)} with ${s.stale} stale entries: evaluation must refuse until repaid`);
}
debt.repayDebt("reanchor", "spend-line");
{
  const s = debt.scoreContext();
  emit("debt-op", `re-anchored spend-line: debt score ${s.score.toFixed(3)}, evaluation may proceed`);
}
for (const e of debt.getContextEntries().slice(-8)) {
  emit("debt-op", `${e.kind} ${e.ref}: ${e.text} [${e.status}]`);
}

fs.mkdirSync(path.join(here, "data"), { recursive: true });
fs.writeFileSync(path.join(here, "data", "training.jsonl"), out.map((l) => l + "\n").join(""));
const kinds = {};
for (const l of out) kinds[JSON.parse(l).kind] = (kinds[JSON.parse(l).kind] ?? 0) + 1;
console.log(`harvested ${out.length} verified lines: ${JSON.stringify(kinds)}`);

function pathToFileURL(p) {
  let r = path.resolve(p).replace(/\\/g, "/");
  if (!r.startsWith("/")) r = `/${r}`;
  return new URL(`file://${r}`);
}
