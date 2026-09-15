const { timeline: snapshotTimeline, upcoming: snapshotUpcoming } = require('./timeline.snapshot');

const TIMELINE_URL = 'https://www.marvel.com/articles/movies/mcu-timeline-order-disney-plus';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const TTL_MS = Math.max(60 * 60 * 1000, Number(process.env.MARVEL_REFRESH_MS || DEFAULT_TTL_MS));

let cache = {
  timeline: snapshotTimeline,
  upcoming: snapshotUpcoming,
  source: 'indbygget officiel snapshot',
  checkedAt: null,
  changedAt: null,
  error: null,
  expiresAt: 0,
};
let refreshPromise = null;

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[’‘]/g, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripTags(value = '') {
  return decodeHtml(String(value)
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

function cleanText(value = '') {
  return stripTags(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseSeasonLabel(rawTitle) {
  const raw = cleanText(rawTitle);
  const match = raw.match(/(?:\s|\||-|–|—)*(?:season\s*)?s(?:eason)?\s*(\d+)\s*$/i)
    || raw.match(/\s+season\s+(\d+)\s*$/i);
  if (!match) return { title: raw, season: null };
  return {
    title: cleanText(raw.slice(0, match.index)),
    season: Number(match[1]),
  };
}

function snapshotKey(entry) {
  return `${normalize(entry.title)}::${entry.season || ''}`;
}

const snapshotByKey = new Map(snapshotTimeline.map(entry => [snapshotKey(entry), entry]));
const snapshotByTitle = new Map();
for (const entry of snapshotTimeline) {
  const key = normalize(entry.title);
  if (!snapshotByTitle.has(key)) snapshotByTitle.set(key, []);
  snapshotByTitle.get(key).push(entry);
}

function findKnownEntry(title, season) {
  const exact = snapshotByKey.get(`${normalize(title)}::${season || ''}`);
  if (exact) return exact;

  const sameTitle = snapshotByTitle.get(normalize(title)) || [];
  if (season) {
    const seasonMatch = sameTitle.find(x => Number(x.season) === Number(season));
    if (seasonMatch) return seasonMatch;
  }
  if (sameTitle.length === 1) return sameTitle[0];
  return null;
}

function extractListItems(fragment) {
  const out = [];
  const re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = re.exec(fragment))) {
    const text = cleanText(match[1]);
    if (text) out.push(text);
  }
  return out;
}

function parseTimelineHtml(html) {
  const source = String(html || '');
  let items = [];

  // Prefer the list immediately following Marvel's named timeline heading.
  const headingRe = /<h([1-6])\b[^>]*>[\s\S]*?MCU\s+Complete\s+Timeline[\s\S]*?<\/h\1>/i;
  const heading = headingRe.exec(source);
  if (heading) {
    const after = source.slice(heading.index + heading[0].length);
    const nextHeading = /<h[1-6]\b/i.exec(after);
    const section = nextHeading ? after.slice(0, nextHeading.index) : after.slice(0, 250000);
    items = extractListItems(section);
  }

  // Layout fallback: score each UL/OL by how many known MCU entries it contains.
  if (items.length < 30) {
    const listRe = /<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let listMatch;
    let best = { items: [], known: 0 };
    while ((listMatch = listRe.exec(source))) {
      const candidate = extractListItems(listMatch[2]);
      if (candidate.length < 30) continue;
      const known = candidate.filter(label => {
        const parsed = parseSeasonLabel(label);
        return Boolean(findKnownEntry(parsed.title, parsed.season));
      }).length;
      if (known > best.known || (known === best.known && candidate.length > best.items.length)) {
        best = { items: candidate, known };
      }
    }
    if (best.items.length >= 30 && best.known >= 20) items = best.items;
  }

  const deduped = [];
  for (const item of items) {
    if (!item) continue;
    if (deduped[deduped.length - 1] === item) continue;
    deduped.push(item);
  }

  if (deduped.length < 30) {
    throw new Error(`Kunne kun finde ${deduped.length} tidslinje-punkter på Marvel-siden`);
  }
  return deduped;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function scoreMeta(meta, title) {
  const a = normalize(meta && meta.name);
  const b = normalize(title);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 55;
  const aw = new Set(a.split(' '));
  const bw = b.split(' ');
  return bw.reduce((score, word) => score + (aw.has(word) ? 4 : 0), 0);
}

async function discoverNewEntry(title, season) {
  const CINEMETA = 'https://v3-cinemeta.strem.io';
  const query = encodeURIComponent(title);
  const types = season ? ['series'] : ['movie', 'series'];
  const results = [];

  for (const type of types) {
    try {
      const data = await fetchJson(`${CINEMETA}/catalog/${type}/top/search=${query}.json`);
      for (const meta of (data.metas || []).slice(0, 6)) {
        results.push({ type, meta, score: scoreMeta(meta, title) });
      }
    } catch (_) {
      // One failed lookup must not break the official-list refresh.
    }
  }

  results.sort((a, b) => b.score - a.score);
  const best = results[0];
  if (!best || best.score < 55) return null;

  const yearText = String(best.meta.releaseInfo || best.meta.year || '');
  const yearMatch = yearText.match(/\b(19|20)\d{2}\b/);
  return {
    title,
    type: season ? 'series' : best.type,
    ...(season || best.type === 'series' ? { season: season || 1 } : {}),
    ...(yearMatch ? { year: Number(yearMatch[0]) } : {}),
  };
}

async function buildTimeline(rawTitles) {
  const entries = [];
  for (let i = 0; i < rawTitles.length; i += 1) {
    const { title, season } = parseSeasonLabel(rawTitles[i]);
    const known = findKnownEntry(title, season);
    let entry = known ? { ...known } : await discoverNewEntry(title, season);
    if (!entry) {
      // Keep the official title even if Cinemeta has not indexed it yet.
      // It will be omitted from a typed catalog until metadata becomes available.
      entry = { title, type: season ? 'series' : 'unknown', ...(season ? { season } : {}) };
    }
    entry.n = i + 1;
    entry.officialLabel = rawTitles[i];
    entries.push(entry);
  }
  return entries;
}

function signatures(entries) {
  return entries.map(x => `${x.n}:${normalize(x.title)}:${x.season || ''}`).join('|');
}

function validateTimelineCandidate(timeline) {
  if (!Array.isArray(timeline) || timeline.length < 50 || timeline.length > 160) {
    throw new Error(`Uventet antal tidslinje-punkter: ${timeline && timeline.length}`);
  }

  // Guard against a Marvel layout change causing navigation/menu items to be
  // mistaken for the official timeline. At least half of the current known
  // titles must still overlap. New entries are allowed freely.
  const currentTitles = new Set(cache.timeline.map(x => normalize(x.title)));
  const candidateTitles = new Set(timeline.map(x => normalize(x.title)));
  let overlap = 0;
  for (const title of currentTitles) if (candidateTitles.has(title)) overlap += 1;
  const required = Math.max(25, Math.floor(currentTitles.size * 0.5));
  if (overlap < required) {
    throw new Error(`Marvel-listen bestod validering dårligt: kun ${overlap}/${currentTitles.size} kendte titler overlapper`);
  }
}

async function refreshNow() {
  const checkedAt = new Date().toISOString();
  try {
    const html = await fetchText(TIMELINE_URL);
    const rawTitles = parseTimelineHtml(html);
    const timeline = await buildTimeline(rawTitles);
    validateTimelineCandidate(timeline);
    const previousSignature = signatures(cache.timeline);
    const nextSignature = signatures(timeline);

    // Remove projects from the fallback upcoming list once Marvel has officially
    // inserted them into the Complete Timeline.
    const liveTitles = new Set(timeline.map(x => normalize(x.title)));
    const upcoming = snapshotUpcoming.filter(x => !liveTitles.has(normalize(x.title)));

    cache = {
      timeline,
      upcoming,
      source: 'Marvel.com – MCU Complete Timeline',
      checkedAt,
      changedAt: previousSignature === nextSignature ? cache.changedAt : checkedAt,
      error: null,
      expiresAt: Date.now() + TTL_MS,
    };
  } catch (error) {
    cache = {
      ...cache,
      checkedAt,
      error: error && error.message ? error.message : String(error),
      expiresAt: Date.now() + Math.min(TTL_MS, 6 * 60 * 60 * 1000),
    };
  }
  return cache;
}

async function ensureFresh({ force = false } = {}) {
  if (!force && cache.expiresAt > Date.now()) return cache;
  if (!refreshPromise) {
    refreshPromise = refreshNow().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

function getCachedData() {
  return cache;
}

module.exports = {
  TIMELINE_URL,
  ensureFresh,
  getCachedData,
  parseTimelineHtml,
  parseSeasonLabel,
};
