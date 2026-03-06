const MUSCLEWIKI_SITEMAP_URL = 'https://musclewiki.com/sitemap.xml';
const MUSCLEWIKI_PAGE_BASE = 'https://musclewiki.com/es-es/exercise';
const MUSCLEWIKI_SLUG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MUSCLEWIKI_VIDEO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MUSCLEWIKI_FETCH_TIMEOUT_MS = 10_000;
const MUSCLEWIKI_VIDEO_CACHE_MAX_ENTRIES = 500;

type MusclewikiCache = {
  slugs: string[];
  fetchedAtMs: number;
};

export type MusclewikiVideoEntry = {
  fetchedAtMs: number;
  pageUrl: string;
  defaultVideoUrl: string;
  variants: { url: string; kind: string }[];
};

export type MusclewikiSuggestion = {
  slug: string;
  displayName: string;
  score: number;
};

const MUSCLEWIKI_STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'con', 'sin', 'para', 'por', 'y', 'o', 'en', 'al', 'a'
]);

const MUSCLEWIKI_PHRASES: Array<[string, string]> = [
  ['peso muerto', 'deadlift'],
  ['peso muerto rumano', 'romanian deadlift'],
  ['peso muerto sumo', 'sumo deadlift'],
  ['press de banca', 'bench press'],
  ['press banca', 'bench press'],
  ['press inclinado', 'incline press'],
  ['press declinado', 'decline press'],
  ['press militar', 'military press'],
  ['press hombros', 'shoulder press'],
  ['press piernas', 'leg press'],
  ['elevaciones laterales', 'lateral raise'],
  ['elevaciones frontales', 'front raise'],
  ['elevaciones de hombro', 'shoulder raise'],
  ['curl martillo', 'hammer curl'],
  ['curl de biceps', 'biceps curl'],
  ['curl de bíceps', 'biceps curl'],
  ['curl predicador', 'preacher curl'],
  ['curl en banco scott', 'preacher curl'],
  ['extension de triceps', 'triceps extension'],
  ['extensión de triceps', 'triceps extension'],
  ['extension de tríceps', 'triceps extension'],
  ['fondos en paralelas', 'parallel dips'],
  ['fondos maquina', 'machine dips'],
  ['remo con barra', 'barbell row'],
  ['remo con mancuerna', 'dumbbell row'],
  ['remo en polea', 'cable row'],
  ['remo sentado', 'seated row'],
  ['remo pendlay', 'pendlay row'],
  ['sentadilla bulgara', 'bulgarian squat'],
  ['sentadilla frontal', 'front squat'],
  ['sentadilla goblet', 'goblet squat'],
  ['sentadilla hack', 'hack squat'],
  ['sentadilla split', 'split squat'],
  ['sentadilla sumo', 'sumo squat'],
  ['sentadilla zercher', 'zercher squat'],
  ['prensa de piernas', 'leg press'],
  ['prensa piernas', 'leg press'],
  ['extension de cuadriceps', 'leg extension'],
  ['extensión de cuadriceps', 'leg extension'],
  ['curl de piernas', 'leg curl'],
  ['curl femoral', 'leg curl'],
  ['curl acostado', 'lying leg curl'],
  ['elevacion de talones', 'calf raise'],
  ['elevación de talones', 'calf raise'],
  ['elevacion de gemelos', 'calf raise'],
  ['elevación de gemelos', 'calf raise'],
  ['pantorrilla', 'calf'],
  ['pantorrillas', 'calf'],
  ['gemelos', 'calf'],
  ['hip thrust', 'hip thrust'],
  ['puente de gluteos', 'glute bridge'],
  ['puente de glúteos', 'glute bridge'],
  ['patada de gluteos', 'glute kickback'],
  ['patada de glúteos', 'glute kickback'],
  ['abduccion de cadera', 'hip abduction'],
  ['abducción de cadera', 'hip abduction'],
  ['aduccion de cadera', 'hip adduction'],
  ['aducción de cadera', 'hip adduction'],
  ['jalon al pecho', 'lat pulldown'],
  ['jalón al pecho', 'lat pulldown'],
  ['jalon tras nuca', 'lat pulldown behind'],
  ['jalón tras nuca', 'lat pulldown behind'],
  ['dominadas supinas', 'chin up'],
  ['dominadas pronas', 'pull up'],
  ['face pull', 'face pull'],
  ['aperturas con mancuernas', 'dumbbell fly'],
  ['aperturas en cruz', 'cable crossover'],
  ['aperturas en polea', 'cable fly'],
  ['crunch abdominal', 'crunch'],
  ['elevacion de piernas', 'leg raise'],
  ['elevación de piernas', 'leg raise'],
  ['plancha abdominal', 'plank'],
  ['rueda abdominal', 'ab wheel'],
  ['encogimientos de hombros', 'shrug'],
  ['encogimientos de trapecio', 'shrug'],
  ['elevaciones de trapecio', 'shrug'],
  ['pajaros', 'reverse fly'],
  ['pájaros', 'reverse fly'],
  ['posterior de hombro', 'rear delt fly'],
  ['remo al menton', 'upright row'],
  ['remo al mentón', 'upright row'],
  ['remo vertical', 'upright row'],
  ['copa con mancuerna', 'goblet squat'],
  ['sentadilla copa', 'goblet squat'],
  ['flexiones', 'push up'],
  ['flexion de pecho', 'push up'],
  ['flexión de pecho', 'push up'],
  ['push ups', 'push up'],
  ['fondos', 'dip'],
  ['fondos en banco', 'bench dip'],
  ['bulgarian split squat', 'bulgarian split squat'],
  ['split squat bulgaro', 'bulgarian split squat'],
  ['zancada', 'lunge'],
  ['zancadas', 'lunge'],
  ['pasos', 'step up'],
  ['step ups', 'step up']
];

const MUSCLEWIKI_TOKEN_MAP: Record<string, string> = {
  mancuerna: 'dumbbell', mancuernas: 'dumbbell', barra: 'barbell', polea: 'cable', poleas: 'cable',
  biceps: 'biceps', bíceps: 'biceps', triceps: 'triceps', tríceps: 'triceps', pecho: 'chest',
  pectoral: 'chest', pectorales: 'chest', espalda: 'back', dorsal: 'lat', dorsales: 'lat',
  lat: 'lat', lats: 'lat', pierna: 'leg', piernas: 'leg', hombro: 'shoulder', hombros: 'shoulder',
  deltoides: 'delt', deltoide: 'delt', press: 'press', curl: 'curl', dominadas: 'pullup',
  dominada: 'pullup', pullup: 'pullup', pullups: 'pullup', chinup: 'chinup', chinups: 'chinup',
  jalon: 'pulldown', jalones: 'pulldown', pulldown: 'pulldown', pulldowns: 'pulldown', remo: 'row',
  remos: 'row', sentadilla: 'squat', sentadillas: 'squat', inclinado: 'incline', inclinada: 'incline',
  declinado: 'decline', declinada: 'decline', martillo: 'hammer', fondos: 'dip', fondo: 'dip',
  dips: 'dip', extension: 'extension', extensión: 'extension', elevacion: 'raise', elevación: 'raise',
  elevaciones: 'raise', lateral: 'lateral', laterales: 'lateral', frontal: 'front', frontales: 'front',
  trasero: 'rear', traseros: 'rear', posterior: 'rear', gemelos: 'calf', pantorrilla: 'calf',
  pantorrillas: 'calf', cuadriceps: 'quadriceps', cuádriceps: 'quadriceps', isquios: 'hamstring',
  isquiotibiales: 'hamstring', femoral: 'hamstring', femorales: 'hamstring', gluteo: 'glute',
  glúteo: 'glute', gluteos: 'glute', glúteos: 'glute', cadera: 'hip', abduccion: 'abduction',
  abducción: 'abduction', aduccion: 'adduction', aducción: 'adduction', crunch: 'crunch', plank: 'plank',
  plancha: 'plank', abdominales: 'abs', abdominal: 'abs', abs: 'abs', trapecio: 'trap',
  trapecios: 'trap', encogimiento: 'shrug', encogimientos: 'shrug', shrug: 'shrug', apertura: 'fly',
  aperturas: 'fly', crossover: 'crossover', cruz: 'crossover', pajaros: 'fly', pájaros: 'fly',
  facepull: 'facepull', face: 'face', prensa: 'press', prensas: 'press', zancada: 'lunge',
  zancadas: 'lunge', lunge: 'lunge', bulgaro: 'bulgarian', búlgaro: 'bulgarian', bulgara: 'bulgarian',
  búlgara: 'bulgarian', rumano: 'romanian', rumana: 'romanian', sumo: 'sumo', hack: 'hack',
  zercher: 'zercher', goblet: 'goblet', copa: 'goblet', split: 'split', stepup: 'stepup',
  step: 'step', flexion: 'pushup', flexión: 'pushup', flexiones: 'pushup', pushup: 'pushup',
  pushups: 'pushup', paralelas: 'parallel', maquina: 'machine', máquina: 'machine', predicador: 'preacher',
  scott: 'scott', acostado: 'lying', acostada: 'lying', sentado: 'seated', sentada: 'seated',
  'de pie': 'standing', pendlay: 'pendlay', tbar: 'tbar', 't bar': 'tbar', menton: 'upright',
  mentón: 'upright', vertical: 'upright', up: 'up', down: 'down', low: 'low', high: 'high',
  close: 'close', wide: 'wide', agarre: 'grip', agarres: 'grip', estrecho: 'narrow', estrecha: 'narrow',
  ancho: 'wide', ancha: 'wide', neutro: 'neutral', neutra: 'neutral', prona: 'prone', pronas: 'prone',
  supina: 'supine', supinas: 'supine', alterno: 'alternate', alterna: 'alternate', simultaneo: 'simultaneous',
  simultáneo: 'simultaneous', unilateral: 'unilateral', bilateral: 'bilateral', smith: 'smith',
  multipower: 'smith', landmine: 'landmine', trasnuca: 'behind', nuca: 'neck'
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeText = (value: string): string => {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const applyPhraseMap = (value: string): string => {
  let output = value;
  for (const [from, to] of MUSCLEWIKI_PHRASES) {
    const pattern = new RegExp(`\\b${escapeRegex(normalizeText(from))}\\b`, 'g');
    output = output.replace(pattern, to);
  }
  return output;
};

const tokenizeQuery = (value: string): string[] => {
  const normalized = applyPhraseMap(normalizeText(value));
  const rawTokens = normalized.split(/[^a-z0-9]+/g).filter(Boolean);
  const mapped = rawTokens
    .map((token) => MUSCLEWIKI_TOKEN_MAP[token] ?? token)
    .filter((token) => token.length > 1 && !MUSCLEWIKI_STOPWORDS.has(token));
  return Array.from(new Set(mapped));
};

const tokenizeSlug = (slug: string): string[] => {
  const tokens = slug
    .toLowerCase()
    .split('-')
    .map((token) => MUSCLEWIKI_TOKEN_MAP[token] ?? token)
    .filter((token) => token.length > 1);
  return Array.from(new Set(tokens));
};

const scoreSlug = (queryTokens: string[], slugTokens: string[]): number => {
  if (queryTokens.length === 0 || slugTokens.length === 0) return 0;
  const querySet = new Set(queryTokens);
  const slugSet = new Set(slugTokens);
  let intersection = 0;
  for (const token of querySet) {
    if (slugSet.has(token)) intersection += 1;
  }
  if (intersection === 0) return 0;
  const union = new Set([...querySet, ...slugSet]).size;
  let score = intersection / union;
  if (intersection === slugSet.size) score += 0.15;
  if (intersection === querySet.size) score += 0.1;
  return Math.min(score, 1.2);
};

const toDisplayName = (slug: string): string => {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
};

const fetchWithTimeout = async (
  input: string,
  init?: RequestInit,
  timeoutMs = MUSCLEWIKI_FETCH_TIMEOUT_MS
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('musclewiki_timeout');
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
};

export const createMusclewikiService = () => {
  let slugCache: MusclewikiCache | null = null;
  let slugPromise: Promise<string[]> | null = null;
  const videoCache = new Map<string, MusclewikiVideoEntry>();
  const slugTokensCache = new Map<string, string[]>();

  const fetchSlugs = async (): Promise<string[]> => {
    const res = await fetchWithTimeout(MUSCLEWIKI_SITEMAP_URL, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; HerculitoBot/1.0)' }
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch sitemap: ${res.status}`);
    }
    const xml = await res.text();
    const regex = /<loc>(https?:\/\/[^<]*?\/exercise\/[^<]+)<\/loc>/g;
    const slugs = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(xml)) !== null) {
      const url = match[1];
      const slug = url.split('/exercise/')[1];
      if (!slug) continue;
      const clean = slug.split('/')[0].toLowerCase();
      if (clean) slugs.add(clean);
    }
    return Array.from(slugs.values());
  };

  const getSlugs = async (): Promise<string[]> => {
    const now = Date.now();
    if (slugCache && now - slugCache.fetchedAtMs < MUSCLEWIKI_SLUG_CACHE_TTL_MS) {
      return slugCache.slugs;
    }
    if (slugPromise) {
      return slugPromise;
    }

    slugPromise = (async () => {
      const slugs = await fetchSlugs();
      slugCache = { slugs, fetchedAtMs: Date.now() };
      slugTokensCache.clear();
      slugs.forEach((slug) => {
        slugTokensCache.set(slug, tokenizeSlug(slug));
      });
      return slugs;
    })();

    try {
      return await slugPromise;
    } finally {
      slugPromise = null;
    }
  };

  const suggest = async (query: string, limit: number): Promise<MusclewikiSuggestion[]> => {
    const slugs = await getSlugs();
    const tokens = tokenizeQuery(query);
    if (tokens.length === 0) return [];

    return slugs
      .map((slug) => {
        const slugTokens = slugTokensCache.get(slug) ?? tokenizeSlug(slug);
        if (!slugTokensCache.has(slug)) {
          slugTokensCache.set(slug, slugTokens);
        }
        return {
          slug,
          displayName: toDisplayName(slug),
          score: scoreSlug(tokens, slugTokens)
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
      .slice(0, limit);
  };

  const parseVideoVariants = (urls: string[]) => {
    return urls.map((url) => {
      let kind = 'video';
      try {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/\/videos\/([^/]+)\/([^/]+)\.mp4$/);
        if (match) {
          const type = match[1];
          const filename = match[2];
          const parts = filename.split('-');
          const gender = parts.find((part) => part === 'male' || part === 'female');
          const angle = parts.find((part) => part === 'front' || part === 'side');
          const labels = [type, gender, angle].filter(Boolean);
          if (labels.length > 0) {
            kind = labels.join(' | ');
          }
        }
      } catch {
        // keep default kind
      }
      return { url, kind };
    });
  };

  const selectDefaultVideo = (variants: Array<{ url: string; kind: string }>): string => {
    const scored = variants.map((variant) => {
      let score = 0;
      if (variant.kind.includes('unbranded')) score += 300;
      if (variant.kind.includes('original')) score += 200;
      if (variant.kind.includes('branded')) score += 100;
      if (variant.kind.includes('front')) score += 20;
      if (variant.kind.includes('side')) score += 5;
      if (variant.kind.includes('male')) score += 2;
      if (variant.kind.includes('female')) score += 1;
      return { ...variant, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.url ?? variants[0]?.url ?? '';
  };

  const fetchVideos = async (slug: string): Promise<MusclewikiVideoEntry> => {
    const pageUrl = `${MUSCLEWIKI_PAGE_BASE}/${slug}`;
    const res = await fetchWithTimeout(pageUrl, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; HerculitoBot/1.0)' }
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch exercise page: ${res.status}`);
    }
    const html = await res.text();
    const regex = /https:\/\/media\.musclewiki\.com[^"'\s]+\.mp4/g;
    const matches = html.match(regex) ?? [];
    const uniqueUrls = Array.from(new Set(matches));
    const variants = parseVideoVariants(uniqueUrls);
    const defaultVideoUrl = selectDefaultVideo(variants);
    if (!defaultVideoUrl) {
      throw new Error('No videos found');
    }
    return {
      fetchedAtMs: Date.now(),
      pageUrl,
      defaultVideoUrl,
      variants
    };
  };

  const getVideos = async (slug: string): Promise<MusclewikiVideoEntry> => {
    const cached = videoCache.get(slug);
    const now = Date.now();
    if (cached && now - cached.fetchedAtMs < MUSCLEWIKI_VIDEO_CACHE_TTL_MS) {
      videoCache.delete(slug);
      videoCache.set(slug, cached);
      return cached;
    }

    if (cached) {
      videoCache.delete(slug);
    }

    const entry = await fetchVideos(slug);

    while (videoCache.size >= MUSCLEWIKI_VIDEO_CACHE_MAX_ENTRIES) {
      const oldestKey = videoCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      videoCache.delete(oldestKey);
    }

    videoCache.set(slug, entry);
    return entry;
  };

  return {
    suggest,
    getVideos
  };
};
