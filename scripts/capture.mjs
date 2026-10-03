/**
 * Record exhibit content: runs a scripted loop session + the eval harness,
 * writes public-exhibit/demo.json and eval.json (served statically).
 * Run: node scripts/capture.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toUrl = (p) => {
  let r = path.resolve(p).replace(/\\/g, "/");
  if (!r.startsWith("/")) r = `/${r}`;
  return new URL(`file://${r}`).href;
};

const loop = await import(toUrl(path.join(here, "src", "loop.js")));
const debt = await import(toUrl(path.join(here, "..", "continuum-brain", "src", "debt.js")));
const cone = await import(toUrl(path.join(here, "..", "continuum-brain", "src", "cone.js")));
const { residual, verifyResidualChain } = await import(toUrl(path.join(here, "..", "continuum-brain", "src", "residual.js")));
const modulators = await import(toUrl(path.join(here, "..", "continuum-brain", "src", "modulators.js")));
const ledger = await import(toUrl(path.join(here, "..", "continuum-brain", "src", "kernel", "ledger.js")));

function loadTexts() {
  const out = [];
  for (const line of fs.readFileSync(path.join(here, "data", "training.jsonl"), "utf8").split("\n")) {
    if (line.trim()) out.push(JSON.parse(line).text);
  }
  for (const line of fs.readFileSync(path.join(here, "data", "hand-pairs.jsonl"), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const p = JSON.parse(line);
    out.push([...(p.evidence ?? []), p.text].join(" "));
  }
  return out;
}

const PROMPT = "approve the payout within the spend authority";
loop.buildMemory(loadTexts());

const clean = loop.generate(PROMPT, { seed: 7 });
debt.flagMissing("exhibit-gap", "exhibit gap never supplied");
const blocked = loop.generate(PROMPT, { seed: 7 });
debt.repayDebt("prune", "exhibit-gap");
const repaid = loop.generate(PROMPT, { seed: 7 });

const damage = [];
for (const ph of [1, 2, 3]) {
  cone.damageStep(ph);
  damage.push({ phase: ph, recalled: loop.recall(PROMPT, 6).items.length });
}
cone.recover();

const demo = {
  generated_at: new Date().toISOString(),
  prompt: PROMPT,
  clean: { status: clean.status, text: clean.text ?? null, evidence: clean.evidence ?? null },
  indebted: {
    status: blocked.status,
    premise: blocked.result?.refusal_details?.missing_premise_id ?? null,
  },
  repaid: { status: repaid.status, text: repaid.text ?? null },
  damage,
  residual: { tip: residual.hash(), chain_ok: verifyResidualChain().ok },
  ledger: { entries: ledger.getEntries().length, chain_ok: ledger.verifyChain().ok },
  modulators: modulators.getState(),
};

let evalOut = "";
try {
  evalOut = execFileSync(process.execPath, [path.join(here, "scripts", "eval.mjs")], { encoding: "utf8", timeout: 240000 });
} catch (e) {
  evalOut = String(e?.stdout ?? e?.message ?? e);
}

fs.mkdirSync(path.join(here, "public-exhibit"), { recursive: true });
fs.writeFileSync(path.join(here, "public-exhibit", "demo.json"), JSON.stringify(demo, null, 2));
fs.writeFileSync(path.join(here, "public-exhibit", "eval.json"), JSON.stringify({ generated_at: demo.generated_at, output: evalOut }, null, 2));
console.log("exhibit recorded: demo + eval JSON written to public-exhibit/.");
