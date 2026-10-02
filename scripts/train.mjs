/**
 * Train the generative substrate on hand-fed, verified traces.
 * Sources: machine-harvested derivation/policy/refusal/debt lines
 * (data/training.jsonl, every line machine-checked) plus hand-authored
 * grounding-boundary pairs (data/hand-pairs.jsonl: licensed conclusions
 * AND refused overreaches, so the substrate learns both shapes).
 * Output is learned counts: P(w3 | w1, w2) with bigram/unigram backoff.
 * Numbers are kept as tokens (thresholds matter here).
 * Run: npm run train  (writes data/gen-model.json)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STOP = new Set(
  "a,an,am,and,are,as,at,be,been,being,but,by,can,could,do,does,did,for,from,had,has,have,he,her,his,i,in,is,it,its,me,my,not,of,on,or,she,should,so,that,the,their,they,this,to,we,were,will,would,with,you,your".split(",")
);

function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length > 0 && !STOP.has(w));
}

const texts = [];
for (const line of fs.readFileSync(path.join(here, "data", "training.jsonl"), "utf8").split("\n")) {
  if (!line.trim()) continue;
  texts.push(JSON.parse(line).text);
}
let licensed = 0;
let refused = 0;
for (const line of fs.readFileSync(path.join(here, "data", "hand-pairs.jsonl"), "utf8").split("\n")) {
  if (!line.trim()) continue;
  const p = JSON.parse(line);
  texts.push([...(p.evidence ?? []), p.text].join(" "));
  if (p.licensed) licensed++;
  else refused++;
}

const tri = Object.create(null);
const bi = Object.create(null);
const uni = Object.create(null);
let tokens = 0;

for (const text of texts) {
  const toks = ["<s>", "<s>", ...tokenize(text), "</s>"];
  for (const t of toks) uni[t] = (uni[t] ?? 0) + 1;
  for (let i = 0; i + 1 < toks.length; i++) {
    const k = toks[i];
    bi[k] = bi[k] ?? Object.create(null);
    bi[k][toks[i + 1]] = (bi[k][toks[i + 1]] ?? 0) + 1;
  }
  for (let i = 0; i + 2 < toks.length; i++) {
    const k = toks[i] + " " + toks[i + 1];
    tri[k] = tri[k] ?? Object.create(null);
    tri[k][toks[i + 2]] = (tri[k][toks[i + 2]] ?? 0) + 1;
  }
  tokens += toks.length;
}

const model = { tri, bi, uni, meta: { texts: texts.length, tokens, licensed, refused } };
fs.mkdirSync(path.join(here, "data"), { recursive: true });
fs.writeFileSync(path.join(here, "data", "gen-model.json"), JSON.stringify(model));
console.log(`trained: ${texts.length} texts (${licensed} licensed, ${refused} refused), ${tokens} tokens, ${Object.keys(tri).length} trigrams, ${Object.keys(uni).length} unigrams.`);
