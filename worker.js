const profiles = { parent: "我的單字庫", son: "兒子的單字庫", daughter: "女兒的單字庫" };
const cookie = "__Host-vocabulary";
const encoder = new TextEncoder();
const wordPattern = /^[a-z]+(?:[-' ][a-z]+)*$/i;

function reply(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function profileCode(env, profile) {
  return Object.hasOwn(profiles, profile) ? env[`CODE_${profile.toUpperCase()}`] : undefined;
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function equal(a, b) {
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
}

async function identity(request, env) {
  const token = request.headers.get("Cookie")?.split(/;\s*/).find(part => part.startsWith(cookie + "="))?.slice(cookie.length + 1);
  const [profile, expiry, nonce, signature, extra] = token?.split(".") ?? [];
  const code = profileCode(env, profile);
  if (!code || !signature || extra !== undefined || !/^\d+$/.test(expiry) ||
      Number(expiry) <= Date.now() || !/^[0-9a-f-]{36}$/.test(nonce)) return null;
  const expected = await sign(`${profile}.${expiry}.${nonce}`, code);
  try {
    return equal(expected, Uint8Array.from(atob(signature), char => char.charCodeAt(0))) ? profile : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.headers.get("Origin") !== url.origin) {
      return reply({ error: "請從單字網站操作。" }, 403);
    }
    if (url.pathname === "/api/login" && request.method === "POST") {
      const { profile, code } = await request.json().catch(() => ({})) ?? {};
      const secret = profileCode(env, profile);
      if (!secret || typeof code !== "string" || code.length > 128 ||
          !equal(await sign("login", code || "invalid"), await sign("login", secret))) {
        return reply({ error: "單字庫或登入碼不正確。" }, 401);
      }
      const maxAge = 30 * 86400;
      const value = `${profile}.${Date.now() + maxAge * 1000}.${crypto.randomUUID()}`;
      const signature = btoa(String.fromCharCode(...await sign(value, secret)));
      return reply({ profile, label: profiles[profile] }, 200, {
        "Set-Cookie": `${cookie}=${value}.${signature}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
      });
    }
    if (url.pathname === "/api/logout" && request.method === "POST") {
      return reply({}, 200, { "Set-Cookie": `${cookie}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
    }
    const profile = await identity(request, env);
    if (!profile) return reply({ error: "請先登入單字庫。" }, 401);
    if (url.pathname !== "/api/words") return reply({ error: "找不到頁面。" }, 404);

    if (request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT data FROM words WHERE profile = ? ORDER BY rowid").bind(profile).all();
      return reply({ profile, label: profiles[profile], words: results.map(row => JSON.parse(row.data)) });
    }
    if (request.method !== "POST" && request.method !== "PUT") return reply({}, 405);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.word !== "string" || body.word.length > 80 || !wordPattern.test(body.word)) return reply({ error: "單字格式不正確。" }, 400);
    const word = body.word.toLowerCase();
    if (request.method === "POST") {
      const entry = {
        word,
        translation: String(body.translation ?? "").slice(0, 500),
        phonetic: String(body.phonetic ?? "").slice(0, 100),
        example: String(body.example ?? "").slice(0, 1000),
        learned: body.learned === true,
        stage: 0,
        due: body.learned === true ? Date.now() : null,
      };
      await env.DB.prepare("INSERT INTO words (profile, word, data) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
        .bind(profile, word, JSON.stringify(entry)).run();
    } else {
      const prior = await env.DB.prepare("SELECT data FROM words WHERE profile = ? AND word = ?").bind(profile, word).first();
      if (!prior) return reply({ error: "找不到單字。" }, 404);
      const entry = JSON.parse(prior.data);
      if (body.due !== entry.due) return reply({ error: "這個單字已在另一台裝置更新，請重新載入。" }, 409);
      const gaps = [1, 3, 7, 14, 30, 60, 120];
      if (body.result === "learned" && !entry.learned) entry.stage = 0;
      else if (entry.learned && entry.due <= Date.now() && body.result === "remembered") entry.stage = Math.min(entry.stage + 1, gaps.length - 1);
      else if (entry.learned && entry.due <= Date.now() && body.result === "forgot") entry.stage = 0;
      else return reply({ error: "這個單字目前不用複習。" }, 409);
      entry.learned = true;
      entry.due = Date.now() + gaps[entry.stage] * 86400000;
      const result = await env.DB.prepare("UPDATE words SET data = ? WHERE profile = ? AND word = ? AND data = ?")
        .bind(JSON.stringify(entry), profile, word, prior.data).run();
      if (!result.meta.changes) return reply({ error: "這個單字已在另一台裝置更新，請重新載入。" }, 409);
    }
    return reply({});
  },
};
