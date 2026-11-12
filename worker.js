const profiles = { parent: "我的單字庫", son: "兒子的單字庫", daughter: "女兒的單字庫" };
const wordPattern = /^[a-z]+(?:[-' ][a-z]+)*$/i;

async function lookupWord(word) {
  const [dictionary, translated] = await Promise.allSettled([
    fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word), { signal: AbortSignal.timeout(8000) })
      .then(response => response.ok ? response.json() : []),
    fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(word) + "&langpair=en%7Czh-TW", { signal: AbortSignal.timeout(8000) })
      .then(response => response.ok ? response.json() : null),
  ]);
  const entries = dictionary.status === "fulfilled" && Array.isArray(dictionary.value) ? dictionary.value : [];
  const translation = translated.status === "fulfilled" && translated.value?.responseStatus === 200
    ? translated.value.responseData?.translatedText : "";
  const definitions = entries.flatMap(entry => entry.meanings ?? []).flatMap(meaning => meaning.definitions ?? []);
  return {
    word,
    translation: typeof translation === "string" && /\p{Script=Han}/u.test(translation) ? translation : "",
    phonetic: entries.find(entry => entry.phonetic)?.phonetic ?? "",
    example: definitions.find(definition => definition.example)?.example ?? "",
  };
}

function reply(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.headers.get("Origin") !== url.origin) {
      return reply({ error: "請從單字網站操作。" }, 403);
    }
    if (url.pathname === "/api/lookup" && request.method === "GET") {
      const word = url.searchParams.get("word")?.trim().toLowerCase() ?? "";
      if (word.length > 80 || !wordPattern.test(word)) return reply({ error: "單字格式不正確。" }, 400);
      return reply(await lookupWord(word));
    }
    if (url.pathname !== "/api/words") return reply({ error: "找不到頁面。" }, 404);

    const profile = url.searchParams.get("profile");
    if (!Object.hasOwn(profiles, profile)) return reply({ error: "請選擇單字庫。" }, 400);

    if (request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT data FROM words WHERE profile = ? ORDER BY rowid").bind(profile).all();
      return reply({ profile, label: profiles[profile], words: results.map(row => JSON.parse(row.data)) });
    }
    if (!["POST", "PUT", "PATCH"].includes(request.method)) return reply({}, 405);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.word !== "string" || body.word.length > 80 || !wordPattern.test(body.word)) return reply({ error: "單字格式不正確。" }, 400);
    const word = body.word.toLowerCase();
    if (request.method === "PATCH") {
      const translation = typeof body.translation === "string" ? body.translation.trim() : "";
      if (!translation || translation.length > 500) return reply({ error: "請輸入 1 到 500 字的中文翻譯。" }, 400);
      const result = await env.DB.prepare("UPDATE words SET data = json_set(data, '$.translation', ?) WHERE profile = ? AND word = ?")
        .bind(translation, profile, word).run();
      if (!result.meta.changes) return reply({ error: "找不到單字。" }, 404);
      return reply({ translation });
    }
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
      await env.DB.prepare(`INSERT INTO words (profile, word, data) VALUES (?, ?, ?)
        ON CONFLICT (profile, word) DO UPDATE SET data = json_set(words.data,
          '$.translation', COALESCE(NULLIF(json_extract(words.data, '$.translation'), ''), json_extract(excluded.data, '$.translation')),
          '$.phonetic', COALESCE(NULLIF(json_extract(words.data, '$.phonetic'), ''), json_extract(excluded.data, '$.phonetic')),
          '$.example', COALESCE(NULLIF(json_extract(words.data, '$.example'), ''), json_extract(excluded.data, '$.example')))`)
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
