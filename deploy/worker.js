/**
 * Hosted CGA research exhibit (overwrites the final-verify slot).
 * Serves a pre-rendered demo transcript + eval results + architecture doc:
 *   GET /api/demo  — recorded loop showcase (prompt, gated refusal, damage run)
 *   GET /api/eval  — recorded experiment results (E1-E5 PASS/FAIL lines)
 * Generation itself runs locally (`npm run demo`); the page says so.
 * No Durable Objects, no KV.
 */
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/api/demo" || url.pathname === "/api/eval") {
      if (req.method !== "GET") {
        return new Response(JSON.stringify({ error: "method not allowed; use GET" }), { status: 405, headers: JSON_HEADERS });
      }
      try {
        const file = url.pathname === "/api/demo" ? "/demo.json" : "/eval.json";
        const res = await env.ASSETS.fetch(new URL(file, req.url));
        if (!res.ok) throw new Error(`missing bundled ${file}`);
        const payload = await res.json();
        return new Response(JSON.stringify(payload), { headers: JSON_HEADERS });
      } catch (e) {
        return new Response(JSON.stringify({ error: `api failure: ${e?.message ?? e}` }), { status: 500, headers: JSON_HEADERS });
      }
    }
    return env.ASSETS.fetch(req);
  },
};
