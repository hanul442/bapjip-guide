// Turns a map share link (kko.to, naver.me, maps.app.goo.gl and the full map URLs) into
// { name, lat, lng }. Phones only share short links with no coordinates, and browsers can't
// follow those redirects themselves, so this runs server-side. Only map hosts are fetched.
const ALLOW = /(^|\.)(kko\.to|kakao\.com|naver\.me|naver\.com|goo\.gl|google\.com|google\.co\.kr)$/i;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

const inKorea = (lat: number, lng: number) => lat > 33 && lat < 39 && lng > 124 && lng < 132;
const ok = (lat: unknown, lng: unknown) => {
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && inKorea(a, b) ? { lat: a, lng: b } : null;
};
// Web Mercator metres (Naver's c=) to degrees
const merc = (x: number, y: number) => ({ lng: x / 20037508.34 * 180, lat: Math.atan(Math.exp(y / 20037508.34 * Math.PI)) * 360 / Math.PI - 90 });

function fromUrl(raw: string) {
  let u: URL; try { u = new URL(raw); } catch { return null; }
  const s = decodeURIComponent(u.href);
  let m;
  if ((m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/))) return ok(m[1], m[2]);
  if ((m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/))) return ok(m[1], m[2]);
  const p = u.searchParams;
  for (const [a, b] of [["lat", "lng"], ["lat", "lon"], ["y", "x"], ["latitude", "longitude"]]) {
    const r = ok(p.get(a), p.get(b)); if (r) return r;
  }
  const c = p.get("c");
  if (c) {
    const [x, y] = c.split(",").map(Number);
    const r = ok(y, x) || (Math.abs(x) > 1000 ? ok(merc(x, y).lat, merc(x, y).lng) : null); if (r) return r;
  }
  const q = p.get("q") || p.get("query") || "";
  if ((m = q.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/))) return ok(m[1], m[2]);
  if ((m = s.match(/\/link\/map\/[^,]*,(-?\d+\.\d+),(-?\d+\.\d+)/))) return ok(m[1], m[2]);
  return null;
}

// Look through any JSON for an object holding a Korean lat/lng pair, whatever the keys are called.
function scanJson(v: unknown, depth = 0): { lat: number; lng: number } | null {
  if (!v || typeof v !== "object" || depth > 8) return null;
  const o = v as Record<string, unknown>;
  const pairs = [["lat", "lng"], ["lat", "lon"], ["latitude", "longitude"], ["y", "x"], ["mapy", "mapx"]];
  for (const [a, b] of pairs) if (a in o && b in o) { const r = ok(o[a], o[b]); if (r) return r; }
  for (const k of Object.keys(o)) { const r = scanJson(o[k], depth + 1); if (r) return r; }
  return null;
}
function scanHtml(h: string) {
  let m;
  if ((m = h.match(/"x"\s*:\s*"?(12\d\.\d{4,})"?\s*,\s*"y"\s*:\s*"?(3\d\.\d{4,})"?/))) return ok(m[2], m[1]);
  if ((m = h.match(/"y"\s*:\s*"?(3\d\.\d{4,})"?\s*,\s*"x"\s*:\s*"?(12\d\.\d{4,})"?/))) return ok(m[1], m[2]);
  if ((m = h.match(/"(?:lat|latitude)"\s*:\s*"?(3\d\.\d{4,})"?\s*,\s*"(?:lng|lon|longitude)"\s*:\s*"?(12\d\.\d{4,})"?/))) return ok(m[1], m[2]);
  if ((m = h.match(/place:location:latitude"\s+content="(3\d\.\d+)"[\s\S]{0,200}?place:location:longitude"\s+content="(12\d\.\d+)"/))) return ok(m[1], m[2]);
  return null;
}
const ogTitle = (h: string) => {
  const m = h.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || h.match(/<title>([^<]+)<\/title>/i);
  if (!m) return "";
  return m[1].replace(/&amp;/g, "&").replace(/\s*[:|-]\s*(네이버(\s*지도)?|카카오\s*맵|NAVER|Naver Map|Google Maps|Google 지도).*$/i, "").trim();
};

async function get(url: string, headers: Record<string, string> = {}) {
  const h = new URL(url).hostname;
  if (!ALLOW.test(h)) throw new Error("host");
  return await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9", ...headers }, redirect: "manual", signal: AbortSignal.timeout(6000) });
}
async function follow(start: string) {
  const chain = [start]; let cur = start;
  for (let i = 0; i < 6; i++) {
    if (!ALLOW.test(new URL(cur).hostname)) break; // left the map sites; use what we have
    const res = await get(cur);
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) { cur = new URL(loc, cur).href; chain.push(cur); await res.body?.cancel(); continue; }
    const type = res.headers.get("content-type") || "";
    const html = type.includes("html") ? (await res.text()).slice(0, 600000) : (await res.body?.cancel(), "");
    return { chain, final: cur, html };
  }
  return { chain, final: cur, html: "" };
}

// Kakao's place panel API: name, point, address, category, phone and the menu board.
// deno-lint-ignore no-explicit-any
async function kakao(id: string): Promise<any> {
  try {
    const r = await get(`https://place-api.map.kakao.com/places/panel3/${id}`, { pf: "web", Referer: "https://place.map.kakao.com/", Accept: "application/json" });
    if (!r.ok) { console.log("kakao panel", r.status); await r.body?.cancel(); return null; }
    const j = await r.json();
    const sm = j?.summary || {};
    const pt = ok(sm?.point?.lat, sm?.point?.lon) || scanJson(sm) || scanJson(j);
    const regions = Array.isArray(sm.regions) ? sm.regions : [];
    const dong = regions.find((x: { depth: number }) => x.depth === 3)?.name || "";
    const gu = regions.find((x: { depth: number }) => x.depth === 2)?.name || "";
    const items = Array.isArray(j?.menu?.menus?.items) ? j.menu.menus.items : [];
    const menus = items.slice(0, 40).map((m: { name?: string; price?: number | string }) => ({
      name: String(m.name || "").trim().slice(0, 50),
      price: Number(String(m.price ?? "").replace(/[^\d]/g, "")) || 0,
    })).filter((m: { name: string }) => m.name);
    return {
      ...(pt || {}), name: String(sm.name || ""),
      info: {
        source: "kakao", placeId: id,
        address: String(sm?.address?.disp || sm?.address?.road || "").slice(0, 120),
        category: String(sm?.category?.name || "").slice(0, 30),
        phone: String(sm?.phone_numbers?.[0]?.tel || "").slice(0, 30),
        area: dong || gu,
        menus,
        url: `https://place.map.kakao.com/${id}`,
      },
    };
  } catch (e) { console.log("kakao error", String(e)); return null; }
}
// deno-lint-ignore no-explicit-any
async function naver(id: string): Promise<any> {
  for (const u of [`https://m.place.naver.com/place/${id}/home`, `https://m.place.naver.com/restaurant/${id}/home`]) {
    try {
      const r = await get(u); if (!r.ok) { await r.body?.cancel(); continue; }
      const h = await r.text();
      const pt = scanHtml(h); const name = ogTitle(h);
      if (pt || name) return { ...(pt || {}), name };
    } catch { /* next */ }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    let url = new URL(req.url).searchParams.get("url") || "";
    if (!url && req.method === "POST") { try { url = (await req.json()).url || ""; } catch { /* empty */ } }
    let start: URL; try { start = new URL(url); } catch { return json({ error: "bad_url" }, 400); }
    if (!/^https?:$/.test(start.protocol) || !ALLOW.test(start.hostname)) return json({ error: "not_map_link" }, 400);

    const { chain, final, html } = await follow(start.href);
    let pt: { lat: number; lng: number } | null = null, name = "";
    for (const u of chain) { pt = fromUrl(u); if (pt) break; }
    const all = chain.join(" ");
    let m, info = null;
    const kid = all.match(/place\.map\.kakao\.com\/(?:m\/)?(\d+)/) || all.match(/[?&]itemId=(\d+)/) || (/kakao/.test(all) ? all.match(/kakao\.com\/place\?(?:[^ ]*&)?id=(\d+)/) : null);
    if (kid) {
      const k = await kakao(kid[1]);
      if (k) { pt = pt || (k.lat ? { lat: k.lat, lng: k.lng } : null); name = k.name || name; info = k.info; }
    }
    if ((!pt || !name) && (m = all.match(/(?:entry\/place|place\.naver\.com\/[a-z]+|\/place)\/(\d{5,})/))) {
      const n = await naver(m[1]); if (n) { pt = pt || (n.lat ? { lat: n.lat, lng: n.lng! } : null); name = n.name || name; }
    }
    if (html) { pt = pt || scanHtml(html); name = name || ogTitle(html); }
    if (/^(카카오\s*맵|kakao\s*map|네이버\s*지도|naver\s*map|naver|google\s*maps?)$/i.test(name.trim())) name = "";
    console.log(JSON.stringify({ chain, found: !!pt, name, menus: info ? info.menus.length : 0 }));
    return json({ ...(pt || {}), name, final, info });
  } catch (e) {
    console.log("resolve error", String(e));
    return json({ error: "failed" }, 502);
  }
});
