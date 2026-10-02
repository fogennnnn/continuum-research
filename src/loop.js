/**
 * Continuum Generative Architecture — the loop.
 * prompt -> debt gate -> cone recall -> seeded generate -> residual pin -> ledger.
 * Every output (including refusals) is ledgered. Deterministic given seed.
 * Pure JS, zero deps. Run: node src/loop.js --demo
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brain = path.join(here, "..", "continuum-brain", "src");
const toFileUrl = (p) => {
  let r = path.resolve(p).replace(/\\/g, "/");
  if (!r.startsWith("/")) r = `/${r}`;
  return new URL(`file://${r}`).href;
};

const debt = await import(toFileUrl(path.join(brain, "debt.js")));
const cone = await import(toFileUrl(path.join(brain, "cone.js")));
const { residual } = await import(toFileUrl(path.join(brain, "residual.js")));
const modulators = await import(toFileUrl(path.join(brain, "modulators.js")));
const ledger = await import(toFileUrl(path.join(brain, "kernel", "ledger.js")));

const genModel = JSON.parse(fs.readFileSync(path.join(here, "data", "gen-model.json"), "utf8"));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length > 0);
}

// ---- memory over the substrate ------------------------------------------------
// Training texts are mapped onto local-column nodes round-robin. Recall scores
// every item by prompt-term overlap, then keeps only items on nodes reachable
// (via live structural edges) from the top item's node. Pruning shrinks the
// reachable set, so recall degrades gracefully with damage. Real mechanism,
// not a metaphor: disconnected nodes are unreachable by construction.
let memItems = [];
let nodeOf = [];

export function buildMemory(texts) {
  cone.buildCone(1337);
  const g = cone.graph();
  const locals = g.nodes.filter((n) => (g.nodeScale[n] ?? "local") === "local");
  const pool = locals.length > 0 ? locals : g.nodes;
  memItems = texts.map((t) => ({ text: t }));
  nodeOf = texts.map((_, i) => pool[i % pool.length]);
  return { items: memItems.length, nodes: pool.length };
}

function reachableNodes() {
  const g = cone.graph();
  const adj = new Map();
  for (const n of g.nodes) adj.set(n, []);
  for (const e of g.edges) {
    adj.get(e.a)?.push(e.b);
    adj.get(e.b)?.push(e.a);
  }
  return adj;
}

function overlapScore(promptTerms, text) {
  const set = new Set(tokenize(text));
  let s = 0;
  for (const t of new Set(promptTerms)) if (set.has(t)) s += 1;
  return s;
}

export function recall(prompt, k = 3) {
  const terms = tokenize(prompt);
  const scored = memItems.map((item, i) => ({ i, s: overlapScore(terms, item.text) }));
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  const top = scored[0];
  if (!top || top.s === 0) return { items: [], topScore: 0 };
  const adj = reachableNodes();
  const seen = new Set([nodeOf[top.i]]);
  const queue = [nodeOf[top.i]];
  while (queue.length > 0) {
    const n = queue.pop();
    for (const m of adj.get(n) ?? []) {
      if (!seen.has(m)) {
        seen.add(m);
        queue.push(m);
      }
    }
  }
  const out = [];
  for (const c of scored) {
    if (c.s === 0) continue;
    if (!seen.has(nodeOf[c.i])) continue;
    out.push({ index: c.i, text: memItems[c.i].text, score: c.s });
    if (out.length >= k) break;
  }
  return { items: out, topScore: top.s };
}

// ---- seeded trigram sampler ----------------------------------------------------
function sampleNext(dist, rnd, temp) {
  const entries = Object.entries(dist);
  if (entries.length === 0) return null;
  const weights = entries.map(([, c]) => Math.pow(c, 1 / temp));
  let total = weights.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < entries.length; i++) {
    r -= weights[i];
    if (r <= 0) return entries[i][0];
  }
  return entries[entries.length - 1][0];
}

export function sampleContinuation(seedWords, seed, maxTokens = 24) {
  const rnd = mulberry32(seed);
  const temp = 1.6 - modulators.getState().plasticity;
  const { tri, bi, uni } = genModel;
  let w1 = seedWords[seedWords.length - 2] ?? "<s>";
  let w2 = seedWords[seedWords.length - 1] ?? "<s>";
  const out = [];
  const uniOpen = Object.fromEntries(Object.entries(uni).filter(([w]) => w !== "</s>"));
  for (let n = 0; n < maxTokens; n++) {
    const t3 = tri[`${w1} ${w2}`];
    const b2 = bi[w2];
    let dist = t3 ?? b2 ?? uni;
    if (out.length < 6) {
      const open = Object.fromEntries(Object.entries(dist).filter(([w]) => w !== "</s>"));
      dist = Object.keys(open).length > 0 ? open : uniOpen;
    }
    if (!dist) break;
    const w3 = sampleNext(dist, rnd, temp);
    if (!w3 || w3 === "</s>") break;
    out.push(w3);
    w1 = w2;
    w2 = w3;
  }
  return out.join(" ");
}

// ---- the loop ------------------------------------------------------------------
let sessionSeq = 0;

export function generate(prompt, opts = {}) {
  const seed = opts.seed ?? 1;
  const id = `GEN-${String((sessionSeq += 1)).padStart(3, "0")}`;
  const ts = new Date().toISOString();
  debt.anchorIntent(id, prompt);
  const gate = debt.gateEvaluation();
  if (!gate.ok) {
    const missing = `debt score ${gate.debt.score.toFixed(3)}: ${gate.debt.stale} stale, ${gate.debt.duplicated} duplicated, ${gate.debt.missing} missing`;
    const result = {
      status: "REFUSED",
      sop_id: "CGA-GEN",
      policy_title: "generative loop",
      action_id: id,
      actor_id: "cga-loop",
      rule_version_hash: "cga-gen-v1",
      timestamp: ts,
      derivation: [`Evaluating generation '${id}'.`, `REFUSED at CONTEXT_DEBT: ${missing}. Repay the debt, then generate.`],
      derivation_chain: [`Evaluating generation '${id}'.`, `REFUSED at CONTEXT_DEBT: ${missing}. Repay the debt, then generate.`],
      refusal_details: {
        missing_premise_id: "CONTEXT_DEBT",
        reason: missing,
        policy_issue: { id: `ISS-CGA-${id}`, title: `Generation refused - unpaid context debt`, missing_premise: "CONTEXT_DEBT", context: { debt: gate.debt } },
      },
    };
    const entry = ledger.appendDecision(result);
    return { status: "REFUSED", id, result, entry };
  }
  const rec = recall(prompt, opts.k ?? 3);
  const strictness = modulators.getState().refusalStrictness;
  if (rec.items.length === 0 && strictness !== "lenient") {
    const result = {
      status: "REFUSED",
      sop_id: "CGA-GEN",
      policy_title: "generative loop",
      action_id: id,
      actor_id: "cga-loop",
      rule_version_hash: "cga-gen-v1",
      timestamp: ts,
      derivation: [`Evaluating generation '${id}'.`, `REFUSED at NO_GROUNDING: no recalled evidence; will not generate ungrounded under '${strictness}' strictness.`],
      derivation_chain: [`Evaluating generation '${id}'.`, `REFUSED at NO_GROUNDING: no recalled evidence; will not generate ungrounded under '${strictness}' strictness.`],
      refusal_details: {
        missing_premise_id: "NO_GROUNDING",
        reason: "No recalled evidence supports generation.",
        policy_issue: { id: `ISS-CGA-${id}`, title: `Generation refused - no grounding`, missing_premise: "NO_GROUNDING", context: {} },
      },
    };
    const entry = ledger.appendDecision(result);
    return { status: "REFUSED", id, result, entry };
  }
  const seedWords = tokenize([prompt, ...rec.items.map((r) => r.text)].join(" ")).slice(-2);
  const text = sampleContinuation(seedWords.length > 0 ? seedWords : ["<s>", "<s>"], seed, opts.maxTokens ?? 24);
  const hash = ledger.sha256Hex(text);
  residual.reanchor({ key: `gen:${id}`, value: hash });
  const result = {
    status: "AUTHORIZED",
    sop_id: "CGA-GEN",
    policy_title: "generative loop",
    action_id: id,
    actor_id: "cga-loop",
    rule_version_hash: "cga-gen-v1",
    timestamp: ts,
    derivation: [
      `Evaluating generation '${id}'.`,
      `Debt gate: score 0 - context balanced.`,
      `Recalled ${rec.items.length} evidence items from the cone.`,
      `Sampled ${text.split(" ").filter(Boolean).length} tokens at plasticity ${modulators.getState().plasticity}.`,
      `AUTHORIZED: output pinned to residual chain.`,
    ],
    derivation_chain: [
      `Evaluating generation '${id}'.`,
      `Debt gate: score 0 - context balanced.`,
      `Recalled ${rec.items.length} evidence items from the cone.`,
      `Sampled ${text.split(" ").filter(Boolean).length} tokens at plasticity ${modulators.getState().plasticity}.`,
      `AUTHORIZED: output pinned to residual chain.`,
    ],
  };
  const entry = ledger.appendDecision(result);
  return { status: "AUTHORIZED", id, text, evidence: rec.items.map((r) => r.index), entry, residualTip: residual.hash() };
}

export function memorySize() {
  return { items: memItems.length };
}

function loadMemoryTexts() {
  const out = [];
  for (const line of fs.readFileSync(path.join(here, "data", "training.jsonl"), "utf8").split("\n")) {
    if (!line.trim()) continue;
    out.push(JSON.parse(line).text);
  }
  for (const line of fs.readFileSync(path.join(here, "data", "hand-pairs.jsonl"), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const p = JSON.parse(line);
    out.push([...(p.evidence ?? []), p.text].join(" "));
  }
  return out;
}

if (process.argv[1] && String(process.argv[1]).endsWith("loop.js")) {
  const mode = process.argv[2] ?? "";
  buildMemory(loadMemoryTexts());
  if (mode === "--demo") {
    console.log("== clean prompt ==");
    console.log(JSON.stringify(generate("approve the payout within the spend authority", { seed: 7 }), null, 1).slice(0, 900));
    console.log("== indebted prompt ==");
    debt.flagMissing("vendor-check", "vendor verification never supplied");
    console.log(JSON.stringify(generate("approve the payout within the spend authority", { seed: 7 }), null, 1).slice(0, 500));
    debt.repayDebt("prune", "vendor-check");
    console.log("== damage phases ==");
    for (const ph of [1, 2, 3]) {
      cone.damageStep(ph);
      const rec = recall("approve the payout within the spend authority", 3);
      console.log(`phase ${ph}: recalled ${rec.items.length} items`);
    }
    cone.recover();
    console.log("== ledger ==");
    console.log("chain ok: " + ledger.verifyChain().ok + ", entries: " + ledger.getEntries().length);
  }
}
