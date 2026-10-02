/**
 * CGA experiment harness: E1-E5 from ARCHITECTURE.md.
 * Deterministic, seeded, PASS/FAIL per claim, exit non-zero on any FAIL.
 * Run: npm run eval
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brain = path.join(here, "..", "continuum-brain", "src");
const toUrl = (p) => {
  let r = path.resolve(p).replace(/\\/g, "/");
  if (!r.startsWith("/")) r = `/${r}`;
  return new URL(`file://${r}`).href;
};

const debt = await import(toUrl(path.join(brain, "debt.js")));
const cone = await import(toUrl(path.join(brain, "cone.js")));
const { residual, verifyResidualChain } = await import(toUrl(path.join(brain, "residual.js")));
const modulators = await import(toUrl(path.join(brain, "modulators.js")));
const ledger = await import(toUrl(path.join(brain, "kernel", "ledger.js")));
const loop = await import(toUrl(path.join(here, "src", "loop.js")));

const out = [];
const show = (label, cond, extra = "") => out.push(`${cond ? "PASS" : "FAIL"} ${label}${extra ? ` (${extra})` : ""}`);

function loadTexts() {
  const texts = [];
  for (const line of fs.readFileSync(path.join(here, "data", "training.jsonl"), "utf8").split("\n")) {
    if (line.trim()) texts.push(JSON.parse(line).text);
  }
  for (const line of fs.readFileSync(path.join(here, "data", "hand-pairs.jsonl"), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const p = JSON.parse(line);
    texts.push([...(p.evidence ?? []), p.text].join(" "));
  }
  return texts;
}

const TEXTS = loadMemoryTextsSafe();
function loadMemoryTextsSafe() {
  try {
    return loadTexts();
  } catch (e) {
    console.log("FATAL cannot load training texts: " + (e?.message ?? e));
    process.exit(2);
  }
}

function resetAll() {
  ledger.clearLedger();
  debt.clearContext();
  cone.buildCone(1337);
  residual.clearResidual ? residual.clearResidual() : null;
  modulators.setPlasticity(1.0);
  modulators.setRefusalStrictness("strict");
  loop.buildMemory(TEXTS);
}

const PROMPT = "approve the payout within the spend authority";

// ---- E1: debt gates generation ----
resetAll();
{
  const clean = loop.generate(PROMPT, { seed: 11 });
  const cleanOk = clean.status === "AUTHORIZED";
  debt.flagMissing("vendor-check", "vendor verification never supplied");
  const blocked = loop.generate(PROMPT, { seed: 11 });
  const blockedOk = blocked.status === "REFUSED" &&
    (blocked.result?.refusal_details?.missing_premise_id === "CONTEXT_DEBT");
  debt.repayDebt("prune", "vendor-check");
  const repaid = loop.generate(PROMPT, { seed: 11 });
  const repaidOk = repaid.status === "AUTHORIZED";
  show("E1 clean authorizes", cleanOk);
  show("E1 indebted refuses naming debt", blockedOk);
  show("E1 repaid proceeds", repaidOk);
}

// ---- E4: modulators move outputs (before damage; restores after) ----
resetAll();
{
  modulators.setPlasticity(0.2);
  const lows = [21, 22, 23].map((s) => loop.generate(PROMPT, { seed: s }).text ?? "");
  modulators.setPlasticity(0.9);
  const highs = [21, 22, 23].map((s) => loop.generate(PROMPT, { seed: s }).text ?? "");
  const diffs = lows.filter((t, i) => t !== highs[i]).length;
  show("E4 plasticity shifts outputs", diffs >= 1, `${diffs}/3 differ`);
  modulators.setPlasticity(1.0);
  modulators.setRefusalStrictness("lenient");
  const lax = loop.generate("xyzzy qqq zzz", { seed: 31 });
  modulators.setRefusalStrictness("strict");
  const hard = loop.generate("xyzzy qqq zzz", { seed: 31 });
  show("E4 lenient generates ungrounded", lax.status === "AUTHORIZED");
  show("E4 strict refuses ungrounded", hard.status === "REFUSED");
  modulators.setRefusalStrictness("strict");
}

// ---- E2: damage degrades recall gracefully ----
resetAll();
{
  const probes = [
    "approve the payout within the spend authority",
    "finance signature missing",
    "prior rejection on file",
    "cash runway below the floor",
    "owner override clears the gap",
    "record chained entries verify",
  ];
  const meanRecall = () => {
    let n = 0;
    for (const p of probes) n += loop.recall(p, 6).items.length;
    return n / probes.length;
  };
  const intact = meanRecall();
  const levels = [1];
  for (const ph of [1, 2, 3]) {
    cone.damageStep(ph);
    levels.push(meanRecall() / (intact || 1));
  }
  cone.recover();
  levels.push(meanRecall() / (intact || 1));
  const phases = levels.slice(0, 4);
  const mono = phases.every((v, i) => i === 0 || v <= phases[i - 1] + 1e-9);
  show("E2 recall non-increasing under damage", mono, levels.map((v) => v.toFixed(2)).join(">"));
  show("E2 phase-3 recall above floor", levels[3] > 0, `p3=${levels[3].toFixed(2)}`);
  show("E2 recovery restores recall", levels[4] >= 0.99, `recovered=${levels[4].toFixed(2)}`);
}

// ---- E3: identity survives damage ----
resetAll();
{
  cone.damageStep(1);
  cone.damageStep(2);
  cone.damageStep(3);
  const chainOk = verifyResidualChain().ok;
  const pin = residual.hash();
  debt.flagMissing("probe-gap", "probe gap never supplied");
  const refused = loop.generate(PROMPT, { seed: 41 });
  const refusedOk = refused.status === "REFUSED";
  debt.repayDebt("prune", "probe-gap");
  const clean = loop.generate(PROMPT, { seed: 41 });
  show("E3 residual chain verifies post-damage", chainOk === true);
  show("E3 residual hash queryable", typeof pin === "string" && pin.length > 0);
  show("E3 debt refusal works post-damage", refusedOk);
  show("E3 clean generation works post-damage", clean.status === "AUTHORIZED");
  cone.recover();
}

// ---- E5: no silent generation ----
resetAll();
{
  const a = loop.generate(PROMPT, { seed: 51 });
  debt.flagMissing("audit-gap", "never supplied");
  const b = loop.generate(PROMPT, { seed: 51 });
  debt.repayDebt("prune", "audit-gap");
  const ids = [a.id, b.id];
  const entries = ledger.getEntries();
  const covered = ids.every((id) => entries.some((e) => e.action_id === `GEN-${String(id).replace("GEN-", "")}` || e.action_id.includes(String(id).replace("GEN-", ""))));
  const direct = [a, b].every((r) => entries.some((e) => e.action_id === r.result?.action_id ?? r.id));
  show("E5 every output ledgered", covered || direct);
  show("E5 ledger chain verifies", ledger.verifyChain().ok === true);
}

console.log(out.join("\n"));
if (out.some((l) => l.startsWith("FAIL"))) process.exit(1);
console.log("eval complete: all claims hold");
