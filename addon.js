const { addonBuilder } = require('stremio-addon-sdk');
const { ensureFresh, getCachedData } = require('./official-data');

const CINEMETA = 'https://v3-cinemeta.strem.io';
const PAGE_SIZE = 20;
const resolvedCache = new Map();
const metaCache = new Map();

const manifest = {
  id: 'com.freakforest.mcutimeline',
  version: '3.1.0',
  name: 'MCU Timeline – Official Chronology',
  description: 'Marvel/Disney+ MCU Complete Timeline in official chronological order. Auto-refreshes from Marvel and provides metadata only — no streams.',
  resources: ['catalog', 'meta'],
  types: ['movie', 'series'],
  idPrefixes: ['mcu-series-'],
  catalogs: [
    { type: 'movie', id: 'mcu-timeline-movies', name: 'MCU Timeline • Film & Specials', extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'mcu-timeline-series', name: 'MCU Timeline • Serier', extra: [{ name: 'skip', isRequired: false }] },
    { type: 'movie', id: 'mcu-upcoming-movies', name: 'MCU • Kommende film', extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'mcu-upcoming-series', name: 'MCU • Kommende serier', extra: [{ name: 'skip', isRequired: false }] }
  ]
};

const builder = new addonBuilder(manifest);

function normalize(value = '') {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[’‘]/g, "'")
    .replace(/marvel studios one shot:?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function yearFromMeta(meta) {
  const raw = meta.releaseInfo || meta.year || '';
  const m = String(raw).match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

function scoreResult(meta, entry) {
  const query = normalize(entry.searchTitle || entry.title);
  const name = normalize(meta.name || '');
  let score = 0;
  if (name === query) score += 100;
  else if (name.includes(query) || query.includes(name)) score += 50;
  if (entry.year && yearFromMeta(meta) === entry.year) score += 25;
  if ((meta.type || entry.type) === entry.type) score += 10;
  return score;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function searchCinemeta(entry) {
  const key = `${entry.type}:${entry.searchTitle || entry.title}:${entry.year || ''}`;
  if (resolvedCache.has(key)) return resolvedCache.get(key);

  const query = encodeURIComponent(entry.searchTitle || entry.title);
  const types = entry.type === 'unknown' ? ['movie', 'series'] : [entry.type];
  const candidates = [];
  for (const type of types) {
    try {
      const data = await fetchJson(`${CINEMETA}/catalog/${type}/top/search=${query}.json`);
      for (const meta of (data.metas || [])) candidates.push({ ...meta, type: meta.type || type });
    } catch (_) {}
  }
  if (!candidates.length) throw new Error(`Ingen Cinemeta-match: ${entry.title}`);

  const chosen = [...candidates].sort((a, b) => scoreResult(b, entry) - scoreResult(a, entry))[0];
  resolvedCache.set(key, chosen);
  return chosen;
}

async function getCinemetaMeta(type, imdbId) {
  const key = `${type}:${imdbId}`;
  if (metaCache.has(key)) return metaCache.get(key);
  const data = await fetchJson(`${CINEMETA}/meta/${type}/${imdbId}.json`);
  if (!data.meta) throw new Error(`Ingen metadata: ${type}/${imdbId}`);
  metaCache.set(key, data.meta);
  return data.meta;
}

function numberLabel(entry) {
  return String(entry.n).padStart(2, '0');
}

function seriesCustomId(entry) {
  return `mcu-series-${entry.n}`;
}

function sourceStatus() {
  const state = getCachedData();
  const checked = state.checkedAt ? new Date(state.checkedAt).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' }) : 'afventer første tjek';
  const fallback = state.error ? ` Marvel-tjek fejlede senest (${state.error}); senest kendte data bruges.` : '';
  return `Datakilde: ${state.source}. Sidst kontrolleret: ${checked}.${fallback}`;
}

function moviePreview(entry, meta) {
  return {
    ...meta,
    id: meta.id,
    type: 'movie',
    name: `${numberLabel(entry)} • ${entry.title}`,
    description: `Officiel MCU-tidslinje #${entry.n}. ${sourceStatus()}\n\n${meta.description || ''}`.trim()
  };
}

function seriesPreview(entry, meta) {
  const season = entry.season || 1;
  return {
    id: seriesCustomId(entry),
    type: 'series',
    name: `${numberLabel(entry)} • ${entry.title} — S${season}`,
    poster: meta.poster,
    posterShape: meta.posterShape || 'poster',
    background: meta.background,
    logo: meta.logo,
    releaseInfo: meta.releaseInfo,
    genres: meta.genres,
    description: `Officiel MCU-tidslinje #${entry.n}. Kun sæson ${season} vises i dette kort. ${sourceStatus()}`
  };
}

async function timelinePreview(entry) {
  const preview = await searchCinemeta(entry);
  const effectiveType = entry.type === 'unknown' ? preview.type : entry.type;
  if (effectiveType === 'movie') return moviePreview({ ...entry, type: 'movie' }, preview);

  const full = await getCinemetaMeta('series', preview.id);
  return seriesPreview({ ...entry, type: 'series', season: entry.season || 1 }, full);
}

function upcomingPreview(entry, meta) {
  const date = entry.releaseDate || entry.year || 'TBA';
  return {
    ...meta,
    name: `${entry.title} • ${date}`,
    description: `Officielt annonceret MCU-projekt. Udgivelse: ${date}. Den præcise placering i Marvel/Disney+ MCU Complete Timeline er endnu ikke offentliggjort.\n\n${meta.description || ''}`.trim()
  };
}

async function buildUpcoming(entry) {
  const meta = await searchCinemeta(entry);
  return upcomingPreview(entry, meta);
}

async function safeMap(entries, mapper) {
  const settled = await Promise.allSettled(entries.map(mapper));
  return settled.filter(x => x.status === 'fulfilled').map(x => x.value);
}

builder.defineCatalogHandler(async (args) => {
  await ensureFresh();
  const { timeline, upcoming } = getCachedData();
  const skip = Math.max(0, Number(args.extra && args.extra.skip) || 0);

  let source;
  let mapper;
  switch (args.id) {
    case 'mcu-timeline-movies':
      source = timeline.filter(x => x.type === 'movie' || x.type === 'unknown');
      mapper = async (entry) => {
        const result = await timelinePreview(entry);
        if (result.type !== 'movie') throw new Error('Ikke en film');
        return result;
      };
      break;
    case 'mcu-timeline-series':
      source = timeline.filter(x => x.type === 'series' || x.type === 'unknown');
      mapper = async (entry) => {
        const result = await timelinePreview(entry);
        if (result.type !== 'series') throw new Error('Ikke en serie');
        return result;
      };
      break;
    case 'mcu-upcoming-movies':
      source = upcoming.filter(x => x.type === 'movie');
      mapper = buildUpcoming;
      break;
    case 'mcu-upcoming-series':
      source = upcoming.filter(x => x.type === 'series');
      mapper = buildUpcoming;
      break;
    default:
      return { metas: [] };
  }

  const page = source.slice(skip, skip + PAGE_SIZE);
  const metas = await safeMap(page, mapper);
  return { metas, cacheMaxAge: 3600, staleRevalidate: 86400, staleError: 604800 };
});

builder.defineMetaHandler(async (args) => {
  await ensureFresh();
  const { timeline } = getCachedData();
  const match = /^mcu-series-(\d+)$/.exec(args.id || '');
  if (!match) return { meta: null };

  const n = Number(match[1]);
  const entry = timeline.find(x => x.n === n && (x.type === 'series' || x.type === 'unknown'));
  if (!entry) return { meta: null };

  const preview = await searchCinemeta(entry);
  if ((preview.type || entry.type) !== 'series') return { meta: null };
  const original = await getCinemetaMeta('series', preview.id);
  const season = entry.season || 1;
  const videos = (original.videos || []).filter(v => Number(v.season) === Number(season));

  return {
    meta: {
      ...original,
      id: seriesCustomId(entry),
      type: 'series',
      name: `${numberLabel(entry)} • ${entry.title} — S${season}`,
      description: `Officiel MCU-tidslinje #${entry.n}. Dette kort indeholder kun sæson ${season}. ${sourceStatus()}\n\n${original.description || ''}`,
      videos
    },
    cacheMaxAge: 3600,
    staleRevalidate: 86400,
    staleError: 604800
  };
});

module.exports = builder.getInterface();
