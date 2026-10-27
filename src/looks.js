/**
 * Внешности: чистая логика + загрузка wardrobe.json (необязательная).
 * Свои внешности лежат в настройках и от сайта не зависят.
 */

export function siteUrls(rawUrl) {
    let url = String(rawUrl || '').trim();
    if (!url) return null; // сайта нет — и не надо
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (/\.json(\?.*)?$/i.test(url)) return { site: url.replace(/[^/]*\.json(\?.*)?$/i, ''), data: url };
    url = url.replace(/[?#].*$/, '').replace(/index\.html?$/i, '');
    if (!url.endsWith('/')) url += '/';
    return { site: url, data: url + 'wardrobe.json' };
}

/** wardrobe.json → looks: [{ id, name, desc }] */
export function parseLooks(data) {
    const looks = Array.isArray(data?.looks) ? data.looks : [];
    return looks
        .filter(l => l && l.id)
        .map(l => ({ id: String(l.id), name: String(l.name || '').trim() || 'Без имени', desc: cleanDesc(l.desc) }));
}

export function cleanDesc(v) {
    return String(v || '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Привести сохранённый список своих внешностей к нормальному виду. */
export function normalizeMine(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const l of list) {
        if (!l || typeof l !== 'object') continue;
        const id = String(l.id || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, name: String(l.name || '').trim() || 'Без имени', desc: cleanDesc(l.desc) });
    }
    return out;
}

/** Добавить или обновить свою внешность. Возвращает { list, look }. */
export function upsertMine(list, { id, name, desc }, makeId) {
    const n = String(name || '').trim();
    const d = cleanDesc(desc);
    if (!n || !d) throw new Error('Нужны имя и теги');
    const cur = normalizeMine(list);
    const i = id ? cur.findIndex(x => x.id === id) : -1;
    if (i >= 0) {
        cur[i] = { id: cur[i].id, name: n, desc: d };
        return { list: cur, look: cur[i] };
    }
    const look = { id: makeId(), name: n, desc: d };
    cur.push(look);
    return { list: cur, look };
}

export function removeMine(list, id) {
    return normalizeMine(list).filter(x => x.id !== id);
}

// ── загрузка с сайта (с кэшем) ──

const CACHE_PREFIX = 'wlook_cache_v1:';
const TTL_MS = 10 * 60 * 1000;

function readCache(url) {
    try {
        const p = JSON.parse(localStorage.getItem(CACHE_PREFIX + url) || 'null');
        return p && p.data && typeof p.data === 'object' ? p : null;
    } catch { return null; }
}

export async function loadSiteJson(dataUrl, force = false) {
    const cached = force ? null : readCache(dataUrl);
    if (cached && Date.now() - (cached.ts || 0) < TTL_MS) return cached.data;
    try {
        const res = await fetch(dataUrl, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        try { localStorage.setItem(CACHE_PREFIX + dataUrl, JSON.stringify({ data, ts: Date.now() })); } catch { /* ignore */ }
        return data;
    } catch (e) {
        if (cached) return cached.data;
        throw e;
    }
}
