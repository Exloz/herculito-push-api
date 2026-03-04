import { loadEnv } from './env';
import { corsPreflight, getJsonBody, json, withCors } from './http';
import { requireClerkAuth } from './auth';
import {
  completeSession,
  createExercise,
  createRoutine,
  deleteRoutine,
  incrementExerciseUsage,
  incrementRoutineUsage,
  getCompetitiveLeaderboard,
  listHiddenPublicRoutineIds,
  listExercises,
  setRoutineVisibility,
  listRoutines,
  listSessions,
  listWorkouts,
  startSession,
  updateExercise,
  updateRoutine,
  updateSessionProgress,
  upsertExerciseLog,
  upsertWorkout,
  listExerciseLogsForDate
} from './data';
import {
  cancelRestJob,
  cleanupTerminalJobs,
  createDb,
  deactivateSubscription,
  getDueJobs,
  isJobClaimCurrent,
  getSubscription,
  markJobCanceled,
  markJobFailed,
  markJobSent,
  rescheduleJob,
  tryClaimJob,
  upsertUserProfile,
  upsertJob,
  upsertSubscription
} from './db';
import { initWebPush, sendPush, type PushPayload, type PushSubscriptionLike } from './push';

const env = loadEnv();
const db = createDb(env.databasePath);

const MAX_COMMAND_CLOCK_DRIFT_MS = 5 * 60 * 1000;
const MAX_COMMAND_STALENESS_MS = 24 * 60 * 60 * 1000;
const MAX_SESSION_START_DRIFT_MS = 10 * 60 * 1000;
const MAX_COMPLETION_CLOCK_DRIFT_MS = 24 * 60 * 60 * 1000;
const MAX_SESSION_EXERCISES = 200;
const MAX_EXERCISE_SETS = 100;
const MAX_SET_WEIGHT = 5000;

initWebPush({
  subject: env.vapidSubject,
  publicKey: env.vapidPublicKey,
  privateKey: env.vapidPrivateKey
});

type SubscribeBody = {
  deviceId: string;
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
};

type ScheduleBody = {
  deviceId: string;
  seconds: number;
  commandAtMs?: number;
  title?: string;
  body?: string;
  url?: string;
};

type CancelBody = {
  deviceId: string;
  commandAtMs?: number;
};

type MusclewikiSuggestBody = {
  query: string;
  limit?: number;
};

type MusclewikiVideoBody = {
  slug: string;
};

type ExerciseCreateBody = {
  name: string;
  category: string;
  sets: number;
  reps: number;
  restTime: number;
  description?: string;
  isPublic?: boolean;
  createdByName?: string;
  muscleGroup?: string;
  video?: {
    provider: 'musclewiki';
    slug: string;
    url: string;
    pageUrl: string;
    variants?: { url: string; kind: string }[];
  };
};

type ExerciseUpdateBody = {
  id: string;
  updates: Partial<ExerciseCreateBody>;
};

type ExerciseUsageBody = {
  id: string;
};

type RoutineCreateBody = {
  id?: string;
  name: string;
  description?: string;
  exercises: Array<{
    id: string;
    name: string;
    sets: number;
    reps: number;
    restTime?: number;
    video?: {
      provider: 'musclewiki';
      slug: string;
      url: string;
      pageUrl: string;
      variants?: { url: string; kind: string }[];
    };
  }>;
  isPublic?: boolean;
  primaryMuscleGroup?: string;
  createdByName?: string;
};

type RoutineUpdateBody = {
  id: string;
  updates: Partial<RoutineCreateBody>;
};

type RoutineDeleteBody = {
  id: string;
};

type RoutineUsageBody = {
  id: string;
};

type RoutineVisibilityBody = {
  routineId: string;
  visible: boolean;
};

type ProfileSyncBody = {
  displayName?: string;
  avatarUrl?: string;
  email?: string;
};

type SessionStartBody = {
  id?: string;
  routineId?: string;
  routineName: string;
  primaryMuscleGroup?: string;
  startedAt?: number;
};

type SessionProgressBody = {
  sessionId: string;
  exercises: unknown[];
};

type SessionCompleteBody = {
  sessionId: string;
  exercises: unknown[];
  completedAt?: number;
  totalDuration?: number;
};

type ExerciseLogBody = {
  exerciseId: string;
  date: string;
  sets: unknown[];
  userId?: string;
};

type WorkoutUpsertBody = {
  workout: {
    id: string;
    day: string;
    name: string;
    exercises: Array<{
      id: string;
      name: string;
      sets: number;
      reps: number;
      restTime?: number;
      video?: {
        provider: 'musclewiki';
        slug: string;
        url: string;
        pageUrl: string;
        variants?: { url: string; kind: string }[];
      };
    }>;
  };
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isValidSeconds = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 60 * 60;
};

const isValidLimit = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 20;
};

const isValidSlug = (value: unknown): value is string => {
  return typeof value === 'string' && /^[a-z0-9-]+$/.test(value);
};

const isValidNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const isValidIntegerInRange = (value: unknown, min: number, max: number): value is number => {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
};

const isBoolean = (value: unknown): value is boolean => {
  return typeof value === 'boolean';
};

const sanitizeCommandAtMs = (value: unknown): number => {
  const now = Date.now();
  if (!isValidNumber(value) || value <= 0) {
    return now;
  }

  const timestamp = Math.floor(value);
  if (timestamp > now + MAX_COMMAND_CLOCK_DRIFT_MS) {
    return now;
  }

  if (timestamp < now - MAX_COMMAND_STALENESS_MS) {
    return now;
  }

  return timestamp;
};

const isValidDateKey = (value: unknown): value is string => {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
};

const sanitizeSessionStartedAtMs = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (!isValidNumber(value)) return undefined;
  const now = Date.now();
  const timestamp = Math.floor(value);
  if (Math.abs(now - timestamp) > MAX_SESSION_START_DRIFT_MS) {
    return now;
  }
  return timestamp;
};

const sanitizeCompletedAtMs = (value: unknown): number => {
  const now = Date.now();
  if (!isValidNumber(value)) return now;
  const timestamp = Math.floor(value);
  if (timestamp > now + MAX_COMPLETION_CLOCK_DRIFT_MS) {
    return now;
  }
  return timestamp;
};

const isValidSetPayload = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const set = value as Record<string, unknown>;

  if (set.setNumber !== undefined && !isValidIntegerInRange(set.setNumber, 1, 200)) {
    return false;
  }

  if (set.completed !== undefined && typeof set.completed !== 'boolean') {
    return false;
  }

  if (set.weight !== undefined) {
    if (!isValidNumber(set.weight) || set.weight < 0 || set.weight > MAX_SET_WEIGHT) {
      return false;
    }
  }

  if (set.completedAt !== undefined && set.completedAt !== null) {
    const completedAt = set.completedAt;
    if (typeof completedAt === 'number') {
      if (!Number.isFinite(completedAt) || completedAt <= 0) return false;
    } else if (typeof completedAt === 'string') {
      if (!Number.isFinite(Date.parse(completedAt))) return false;
    } else {
      return false;
    }
  }

  return true;
};

const isValidSetsPayload = (value: unknown): value is unknown[] => {
  return Array.isArray(value)
    && value.length <= MAX_EXERCISE_SETS
    && value.every((entry) => isValidSetPayload(entry));
};

const isValidSessionExercisePayload = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const exercise = value as Record<string, unknown>;
  if (!isNonEmptyString(exercise.exerciseId)) return false;
  if (!isValidSetsPayload(exercise.sets)) return false;
  return true;
};

const isValidSessionExercisesPayload = (value: unknown): value is unknown[] => {
  return Array.isArray(value)
    && value.length <= MAX_SESSION_EXERCISES
    && value.every((exercise) => isValidSessionExercisePayload(exercise));
};

const makeRestJobId = (uid: string, deviceId: string): string => `${uid}:${deviceId}:rest`;

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

type MusclewikiVideoCacheEntry = {
  fetchedAtMs: number;
  pageUrl: string;
  defaultVideoUrl: string;
  variants: { url: string; kind: string }[];
};

let musclewikiSlugCache: MusclewikiCache | null = null;
let musclewikiSlugPromise: Promise<string[]> | null = null;
const musclewikiVideoCache = new Map<string, MusclewikiVideoCacheEntry>();
const musclewikiSlugTokensCache = new Map<string, string[]>();

const MUSCLEWIKI_STOPWORDS = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'con',
  'sin',
  'para',
  'por',
  'y',
  'o',
  'en',
  'al',
  'a'
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
  mancuerna: 'dumbbell',
  mancuernas: 'dumbbell',
  barra: 'barbell',
  polea: 'cable',
  poleas: 'cable',
  biceps: 'biceps',
  bíceps: 'biceps',
  triceps: 'triceps',
  tríceps: 'triceps',
  pecho: 'chest',
  pectoral: 'chest',
  pectorales: 'chest',
  espalda: 'back',
  dorsal: 'lat',
  dorsales: 'lat',
  lat: 'lat',
  lats: 'lat',
  pierna: 'leg',
  piernas: 'leg',
  hombro: 'shoulder',
  hombros: 'shoulder',
  deltoides: 'delt',
  deltoide: 'delt',
  press: 'press',
  curl: 'curl',
  dominadas: 'pullup',
  dominada: 'pullup',
  pullup: 'pullup',
  pullups: 'pullup',
  chinup: 'chinup',
  chinups: 'chinup',
  jalon: 'pulldown',
  jalones: 'pulldown',
  pulldown: 'pulldown',
  pulldowns: 'pulldown',
  remo: 'row',
  remos: 'row',
  sentadilla: 'squat',
  sentadillas: 'squat',
  inclinado: 'incline',
  inclinada: 'incline',
  declinado: 'decline',
  declinada: 'decline',
  martillo: 'hammer',
  fondos: 'dip',
  fondo: 'dip',
  dips: 'dip',
  extension: 'extension',
  extensión: 'extension',
  elevacion: 'raise',
  elevación: 'raise',
  elevaciones: 'raise',
  lateral: 'lateral',
  laterales: 'lateral',
  frontal: 'front',
  frontales: 'front',
  trasero: 'rear',
  traseros: 'rear',
  posterior: 'rear',
  gemelos: 'calf',
  pantorrilla: 'calf',
  pantorrillas: 'calf',
  cuadriceps: 'quadriceps',
  cuádriceps: 'quadriceps',
  isquios: 'hamstring',
  isquiotibiales: 'hamstring',
  femoral: 'hamstring',
  femorales: 'hamstring',
  gluteo: 'glute',
  glúteo: 'glute',
  gluteos: 'glute',
  glúteos: 'glute',
  cadera: 'hip',
  abduccion: 'abduction',
  abducción: 'abduction',
  aduccion: 'adduction',
  aducción: 'adduction',
  crunch: 'crunch',
  plank: 'plank',
  plancha: 'plank',
  abdominales: 'abs',
  abdominal: 'abs',
  abs: 'abs',
  trapecio: 'trap',
  trapecios: 'trap',
  encogimiento: 'shrug',
  encogimientos: 'shrug',
  shrug: 'shrug',
  apertura: 'fly',
  aperturas: 'fly',
  crossover: 'crossover',
  cruz: 'crossover',
  pajaros: 'fly',
  pájaros: 'fly',
  facepull: 'facepull',
  face: 'face',
  prensa: 'press',
  prensas: 'press',
  zancada: 'lunge',
  zancadas: 'lunge',
  lunge: 'lunge',
  bulgaro: 'bulgarian',
  búlgaro: 'bulgarian',
  bulgara: 'bulgarian',
  búlgara: 'bulgarian',
  rumano: 'romanian',
  rumana: 'romanian',
  sumo: 'sumo',
  hack: 'hack',
  zercher: 'zercher',
  goblet: 'goblet',
  copa: 'goblet',
  split: 'split',
  stepup: 'stepup',
  step: 'step',
  flexion: 'pushup',
  flexión: 'pushup',
  flexiones: 'pushup',
  pushup: 'pushup',
  pushups: 'pushup',
  paralelas: 'parallel',
  maquina: 'machine',
  máquina: 'machine',
  predicador: 'preacher',
  scott: 'scott',
  acostado: 'lying',
  acostada: 'lying',
  sentado: 'seated',
  sentada: 'seated',
  'de pie': 'standing',
  pendlay: 'pendlay',
  tbar: 'tbar',
  't bar': 'tbar',
  menton: 'upright',
  mentón: 'upright',
  vertical: 'upright',
  up: 'up',
  down: 'down',
  low: 'low',
  high: 'high',
  close: 'close',
  wide: 'wide',
  agarre: 'grip',
  agarres: 'grip',
  estrecho: 'narrow',
  estrecha: 'narrow',
  ancho: 'wide',
  ancha: 'wide',
  neutro: 'neutral',
  neutra: 'neutral',
  prona: 'prone',
  pronas: 'prone',
  supina: 'supine',
  supinas: 'supine',
  alterno: 'alternate',
  alterna: 'alternate',
  simultaneo: 'simultaneous',
  simultáneo: 'simultaneous',
  unilateral: 'unilateral',
  bilateral: 'bilateral',
  smith: 'smith',
  multipower: 'smith',
  landmine: 'landmine',
  trasnuca: 'behind',
  nuca: 'neck'
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

const fetchWithTimeout = async (input: string, init?: RequestInit, timeoutMs = MUSCLEWIKI_FETCH_TIMEOUT_MS): Promise<Response> => {
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

const fetchMusclewikiSlugs = async (): Promise<string[]> => {
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

const getMusclewikiSlugs = async (): Promise<string[]> => {
  const now = Date.now();
  if (musclewikiSlugCache && now - musclewikiSlugCache.fetchedAtMs < MUSCLEWIKI_SLUG_CACHE_TTL_MS) {
    return musclewikiSlugCache.slugs;
  }
  if (musclewikiSlugPromise) {
    return musclewikiSlugPromise;
  }
  musclewikiSlugPromise = (async () => {
    const slugs = await fetchMusclewikiSlugs();
    musclewikiSlugCache = { slugs, fetchedAtMs: Date.now() };
    musclewikiSlugTokensCache.clear();
    slugs.forEach((slug) => {
      musclewikiSlugTokensCache.set(slug, tokenizeSlug(slug));
    });
    return slugs;
  })();
  try {
    return await musclewikiSlugPromise;
  } finally {
    musclewikiSlugPromise = null;
  }
};

const suggestMusclewiki = async (query: string, limit: number): Promise<Array<{ slug: string; displayName: string; score: number }>> => {
  const slugs = await getMusclewikiSlugs();
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];
  const scored = slugs
    .map((slug) => {
      const slugTokens = musclewikiSlugTokensCache.get(slug) ?? tokenizeSlug(slug);
      if (!musclewikiSlugTokensCache.has(slug)) {
        musclewikiSlugTokensCache.set(slug, slugTokens);
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
  return scored;
};

const parseMusclewikiVideoVariants = (urls: string[]) => {
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

const fetchMusclewikiVideos = async (slug: string): Promise<MusclewikiVideoCacheEntry> => {
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
  const variants = parseMusclewikiVideoVariants(uniqueUrls);
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

const getMusclewikiVideos = async (slug: string): Promise<MusclewikiVideoCacheEntry> => {
  const cached = musclewikiVideoCache.get(slug);
  const now = Date.now();
  if (cached && now - cached.fetchedAtMs < MUSCLEWIKI_VIDEO_CACHE_TTL_MS) {
    musclewikiVideoCache.delete(slug);
    musclewikiVideoCache.set(slug, cached);
    return cached;
  }

  if (cached) {
    musclewikiVideoCache.delete(slug);
  }

  const entry = await fetchMusclewikiVideos(slug);

  while (musclewikiVideoCache.size >= MUSCLEWIKI_VIDEO_CACHE_MAX_ENTRIES) {
    const oldestKey = musclewikiVideoCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    musclewikiVideoCache.delete(oldestKey);
  }

  musclewikiVideoCache.set(slug, entry);
  return entry;
};

type RequestLogMeta = {
  requestId: string;
  method: string;
  path: string;
  startedAtMs: number;
  uid?: string;
};

const logInfo = (payload: Record<string, unknown>): void => {
  console.log(
    JSON.stringify({
      level: 'info',
      ts: new Date().toISOString(),
      ...payload
    })
  );
};

const logError = (payload: Record<string, unknown>): void => {
  console.error(
    JSON.stringify({
      level: 'error',
      ts: new Date().toISOString(),
      ...payload
    })
  );
};

const toErrorDetails = (error: unknown): { errorName?: string; errorMessage?: string; errorStack?: string } => {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack
    };
  }

  if (typeof error === 'string') {
    return { errorMessage: error };
  }

  return {};
};


const logRequestIn = (meta: RequestLogMeta): void => {
  logInfo({
    event: 'api_in',
    requestId: meta.requestId,
    method: meta.method,
    path: meta.path,
    uid: meta.uid
  });
};

const logRequestOut = (meta: RequestLogMeta, status: number): void => {
  logInfo({
    event: 'api_out',
    requestId: meta.requestId,
    method: meta.method,
    path: meta.path,
    uid: meta.uid,
    status,
    durationMs: Date.now() - meta.startedAtMs
  });
};

const requireAuth = async (req: Request, meta?: RequestLogMeta) => {
  const auth = await requireClerkAuth(req, {
    issuer: env.clerkIssuer,
    jwksUrl: env.clerkJwksUrl,
    audience: env.clerkAudience
  });

  upsertUserProfile(db, {
    uid: auth.uid,
    email: auth.email,
    displayName: auth.displayName,
    avatarUrl: auth.avatarUrl
  });

  if (meta) {
    meta.uid = auth.uid;
  }
  return auth;
};

const isValidLimitParam = (value: string | null, max: number, defaultWhenInvalid = max): number | undefined => {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return defaultWhenInvalid;
  return Math.min(max, Math.floor(parsed));
};

const isValidExerciseEntry = (
  value: unknown
): value is {
  id: string;
  name: string;
  sets: number;
  reps: number;
  restTime?: number;
} => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  if (!isNonEmptyString(entry.id) || !isNonEmptyString(entry.name)) return false;
  if (!isValidIntegerInRange(entry.sets, 1, 20)) return false;
  if (!isValidIntegerInRange(entry.reps, 1, 100)) return false;
  if (entry.restTime !== undefined && !isValidIntegerInRange(entry.restTime, 0, 3600)) return false;
  return true;
};

const isValidExerciseList = (value: unknown): value is Array<{
  id: string;
  name: string;
  sets: number;
  reps: number;
  restTime?: number;
}> => Array.isArray(value) && value.every((entry) => isValidExerciseEntry(entry));

const SCHEDULER_BATCH_SIZE = 50;
const SCHEDULER_MAX_JOBS_PER_TICK = 200;
const TERMINAL_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TERMINAL_JOB_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const TERMINAL_JOB_CLEANUP_BATCH = 500;
let schedulerRunning = false;
const getRetryDelayMs = (attempts: number): number => {
  const base = 5_000;
  const delay = base * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(delay, 60_000);
};

const schedulerTick = async (): Promise<void> => {
  const now = Date.now();
  let processed = 0;
  while (processed < SCHEDULER_MAX_JOBS_PER_TICK) {
    const due = getDueJobs(db, now, SCHEDULER_BATCH_SIZE);
    if (due.length === 0) return;

    for (const job of due) {
      if (!tryClaimJob(db, job.id, job.requestedAtMs, job.executeAtMs, now)) continue;
      processed += 1;

      try {
        if (!isJobClaimCurrent(db, job.id, job.requestedAtMs)) {
          continue;
        }

        const subscriptionRow = getSubscription(db, job.uid, job.deviceId);
        if (!subscriptionRow || subscriptionRow.isActive !== 1) {
          markJobCanceled(db, job.id, job.requestedAtMs);
          continue;
        }

        const subscription: PushSubscriptionLike = {
          endpoint: subscriptionRow.endpoint,
          keys: {
            p256dh: subscriptionRow.p256dh,
            auth: subscriptionRow.auth
          }
        };

        const payload = JSON.parse(job.payloadJson) as PushPayload;

        if (!isJobClaimCurrent(db, job.id, job.requestedAtMs)) {
          continue;
        }

        await sendPush(subscription, payload);
        markJobSent(db, job.id, job.requestedAtMs);
      } catch (error) {
        const err = error as unknown as { statusCode?: number };
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : undefined;

        if (statusCode === 404 || statusCode === 410) {
          deactivateSubscription(db, job.uid, job.deviceId);
          markJobCanceled(db, job.id, job.requestedAtMs);
          continue;
        }

        const nextAttempts = job.attempts + 1;
        if (nextAttempts <= 3) {
          rescheduleJob(db, job.id, job.requestedAtMs, Date.now() + getRetryDelayMs(nextAttempts), nextAttempts);
        } else {
          markJobFailed(db, job.id, job.requestedAtMs);
        }
      }

      if (processed >= SCHEDULER_MAX_JOBS_PER_TICK) {
        return;
      }
    }
  }
};

setInterval(() => {
  if (schedulerRunning) {
    return;
  }

  schedulerRunning = true;
  void schedulerTick().catch((error) => {
    logError({
      event: 'scheduler_error',
      ...toErrorDetails(error)
    });
  }).finally(() => {
    schedulerRunning = false;
  });
}, 750);

setInterval(() => {
  const removed = cleanupTerminalJobs(db, {
    olderThanMs: Date.now() - TERMINAL_JOB_RETENTION_MS,
    limit: TERMINAL_JOB_CLEANUP_BATCH
  });

  if (removed > 0) {
    logInfo({
      event: 'jobs_cleanup',
      removed
    });
  }
}, TERMINAL_JOB_CLEANUP_INTERVAL_MS);

const handler = async (req: Request, meta?: RequestLogMeta): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return corsPreflight(req, env.allowedOrigins);
  }

  const url = new URL(req.url);

  if (req.method === 'GET' && url.pathname === '/health') {
    const probe = db.query<{ ok: number }, []>('SELECT 1 as ok').get();
    if (!probe || probe.ok !== 1) {
      return withCors(req, json({ ok: false, db: false }, { status: 503 }), env.allowedOrigins);
    }
    return withCors(req, json({ ok: true, db: true }), env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/push/vapidPublicKey') {
    return withCors(req, json({ vapidPublicKey: env.vapidPublicKey }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/push/subscribe') {
    const { uid } = await requireAuth(req, meta);
    const body = await getJsonBody<SubscribeBody>(req);

    if (!isNonEmptyString(body.deviceId)) {
      return withCors(req, json({ error: 'invalid_device_id' }, { status: 400 }), env.allowedOrigins);
    }

    if (!body.subscription || !isNonEmptyString(body.subscription.endpoint)) {
      return withCors(req, json({ error: 'invalid_subscription' }, { status: 400 }), env.allowedOrigins);
    }

    const keys = body.subscription.keys;
    if (!keys || !isNonEmptyString(keys.p256dh) || !isNonEmptyString(keys.auth)) {
      return withCors(req, json({ error: 'invalid_subscription_keys' }, { status: 400 }), env.allowedOrigins);
    }

    upsertSubscription(db, {
      uid,
      deviceId: body.deviceId,
      endpoint: body.subscription.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth
    });

    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/rest/schedule') {
    const { uid } = await requireAuth(req, meta);
    const body = await getJsonBody<ScheduleBody>(req);

    if (!isNonEmptyString(body.deviceId)) {
      return withCors(req, json({ error: 'invalid_device_id' }, { status: 400 }), env.allowedOrigins);
    }

    if (!isValidSeconds(body.seconds)) {
      return withCors(req, json({ error: 'invalid_seconds' }, { status: 400 }), env.allowedOrigins);
    }

    const subscriptionRow = getSubscription(db, uid, body.deviceId);
    if (!subscriptionRow || subscriptionRow.isActive !== 1) {
      return withCors(req, json({ error: 'not_subscribed' }, { status: 409 }), env.allowedOrigins);
    }

    const payload: PushPayload = {
      title: isNonEmptyString(body.title) ? body.title : '¡Descanso terminado!',
      body: isNonEmptyString(body.body) ? body.body : 'Continúa con tu entrenamiento.',
      url: isNonEmptyString(body.url) ? body.url : 'https://herculito.exloz.site',
      tag: 'rest-timer'
    };

    const jobId = makeRestJobId(uid, body.deviceId);
    const executeAtMs = Date.now() + Math.round(body.seconds * 1000);
    const requestedAtMs = sanitizeCommandAtMs(body.commandAtMs);

    upsertJob(db, {
      id: jobId,
      uid,
      deviceId: body.deviceId,
      executeAtMs,
      payloadJson: JSON.stringify(payload),
      requestedAtMs
    });

    return withCors(req, json({ ok: true, jobId, executeAtMs, requestedAtMs }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/rest/cancel') {
    const { uid } = await requireAuth(req, meta);
    const body = await getJsonBody<CancelBody>(req);

    if (!isNonEmptyString(body.deviceId)) {
      return withCors(req, json({ error: 'invalid_device_id' }, { status: 400 }), env.allowedOrigins);
    }

    const requestedAtMs = sanitizeCommandAtMs(body.commandAtMs);
    const jobId = makeRestJobId(uid, body.deviceId);
    const canceled = cancelRestJob(db, {
      id: jobId,
      uid,
      deviceId: body.deviceId,
      requestedAtMs
    });
    return withCors(req, json({ ok: true, canceled, jobId, requestedAtMs }), env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/data/exercises') {
    const { uid } = await requireAuth(req, meta);
    const limit = isValidLimitParam(url.searchParams.get('limit'), 500);
    const exercises = listExercises(db, uid, limit);
    return withCors(req, json({ exercises }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/profile') {
    const auth = await requireAuth(req, meta);
    const body = await getJsonBody<ProfileSyncBody>(req);

    const displayName = isNonEmptyString(body.displayName)
      ? body.displayName.trim()
      : auth.displayName;
    const avatarUrl = isNonEmptyString(body.avatarUrl)
      ? body.avatarUrl.trim()
      : auth.avatarUrl;
    const email = isNonEmptyString(body.email)
      ? body.email.trim().toLowerCase()
      : auth.email;

    upsertUserProfile(db, {
      uid: auth.uid,
      displayName,
      avatarUrl,
      email
    });

    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/exercises') {
    const auth = await requireAuth(req, meta);
    const body = await getJsonBody<ExerciseCreateBody>(req);

    if (!isNonEmptyString(body.name) || !isNonEmptyString(body.category)) {
      return withCors(req, json({ error: 'invalid_name_or_category' }, { status: 400 }), env.allowedOrigins);
    }

    if (
      !isValidIntegerInRange(body.sets, 1, 20)
      || !isValidIntegerInRange(body.reps, 1, 100)
      || !isValidIntegerInRange(body.restTime, 0, 3600)
    ) {
      return withCors(req, json({ error: 'invalid_defaults' }, { status: 400 }), env.allowedOrigins);
    }

    const exercise = createExercise(db, auth.uid, {
      name: body.name,
      category: body.category,
      sets: body.sets,
      reps: body.reps,
      restTime: body.restTime,
      description: body.description,
      isPublic: body.isPublic,
      createdByName: auth.displayName ?? body.createdByName,
      muscleGroup: body.muscleGroup,
      video: body.video
    });

    return withCors(req, json({ exercise }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/exercises/update') {
    const { uid } = await requireAuth(req, meta);
    const body = await getJsonBody<ExerciseUpdateBody>(req);

    if (!isNonEmptyString(body.id)) {
      return withCors(req, json({ error: 'invalid_exercise_id' }, { status: 400 }), env.allowedOrigins);
    }

    updateExercise(db, uid, body.id, body.updates ?? {});
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/exercises/use') {
    const { uid } = await requireAuth(req, meta);
    const body = await getJsonBody<ExerciseUsageBody>(req);

    if (!isNonEmptyString(body.id)) {
      return withCors(req, json({ error: 'invalid_exercise_id' }, { status: 400 }), env.allowedOrigins);
    }

    incrementExerciseUsage(db, uid, body.id);
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/data/routines') {
    const { uid } = await requireAuth(req, meta);
    const limit = isValidLimitParam(url.searchParams.get('limit'), 200);
    const routines = listRoutines(db, uid, limit);
    return withCors(req, json({ routines }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/routines') {
    const auth = await requireAuth(req, meta);
    const body = await getJsonBody<RoutineCreateBody>(req);

    if (!isNonEmptyString(body.name) || !isValidExerciseList(body.exercises)) {
      return withCors(req, json({ error: 'invalid_routine' }, { status: 400 }), env.allowedOrigins);
    }

    let routine;
    try {
      routine = createRoutine(db, auth.uid, {
        ...body,
        createdByName: auth.displayName ?? body.createdByName
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'routine_id_conflict') {
        return withCors(req, json({ error: 'routine_id_conflict' }, { status: 409 }), env.allowedOrigins);
      }
      throw error;
    }

    return withCors(req, json({ routine }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/routines/update') {
    const { uid } = await requireAuth(req, meta);
    const body = await getJsonBody<RoutineUpdateBody>(req);

    if (!isNonEmptyString(body.id)) {
      return withCors(req, json({ error: 'invalid_routine_id' }, { status: 400 }), env.allowedOrigins);
    }

    if (body.updates?.exercises && !isValidExerciseList(body.updates.exercises)) {
      return withCors(req, json({ error: 'invalid_routine_exercises' }, { status: 400 }), env.allowedOrigins);
    }

    updateRoutine(db, uid, body.id, body.updates ?? {});
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/routines/delete') {
    const { uid } = await requireAuth(req, meta);
    const body = await getJsonBody<RoutineDeleteBody>(req);

    if (!isNonEmptyString(body.id)) {
      return withCors(req, json({ error: 'invalid_routine_id' }, { status: 400 }), env.allowedOrigins);
    }

    deleteRoutine(db, uid, body.id);
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/routines/use') {
    const { uid } = await requireAuth(req, meta);
    const body = await getJsonBody<RoutineUsageBody>(req);

    if (!isNonEmptyString(body.id)) {
      return withCors(req, json({ error: 'invalid_routine_id' }, { status: 400 }), env.allowedOrigins);
    }

    incrementRoutineUsage(db, uid, body.id);
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/data/routines/visibility') {
    const { uid } = await requireAuth(req, meta);
    const hiddenRoutineIds = listHiddenPublicRoutineIds(db, uid);
    return withCors(req, json({ hiddenRoutineIds }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/routines/visibility') {
    const { uid } = await requireAuth(req, meta);
    const body = await getJsonBody<RoutineVisibilityBody>(req);

    if (!isNonEmptyString(body.routineId) || !isBoolean(body.visible)) {
      return withCors(req, json({ error: 'invalid_routine_visibility' }, { status: 400 }), env.allowedOrigins);
    }

    const updated = setRoutineVisibility(db, uid, {
      routineId: body.routineId,
      visible: body.visible
    });

    if (!updated) {
      return withCors(req, json({ error: 'routine_not_visible_to_user' }, { status: 404 }), env.allowedOrigins);
    }

    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/data/sessions') {
    const { uid } = await requireAuth(req, meta);
    const limit = isValidLimitParam(url.searchParams.get('limit'), 500) ?? 500;
    const sessions = listSessions(db, uid, limit);
    return withCors(req, json({ sessions }), env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/data/leaderboard') {
    const { uid } = await requireAuth(req, meta);
    const limit = isValidLimitParam(url.searchParams.get('limit'), 50, 10) ?? 10;
    const leaderboard = getCompetitiveLeaderboard(db, uid, limit);
    return withCors(req, json(leaderboard), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/sessions/start') {
    const { uid } = await requireAuth(req, meta);
    const body = await getJsonBody<SessionStartBody>(req);

    if (!isNonEmptyString(body.routineName)) {
      return withCors(req, json({ error: 'invalid_routine_name' }, { status: 400 }), env.allowedOrigins);
    }

    const sanitizedStartedAt = sanitizeSessionStartedAtMs(body.startedAt);
    if (body.startedAt !== undefined && sanitizedStartedAt === undefined) {
      return withCors(req, json({ error: 'invalid_started_at' }, { status: 400 }), env.allowedOrigins);
    }

    let session;
    try {
      session = startSession(db, uid, {
        id: body.id,
        routineId: body.routineId,
        routineName: body.routineName,
        primaryMuscleGroup: body.primaryMuscleGroup,
        startedAt: sanitizedStartedAt
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'session_id_conflict') {
        return withCors(req, json({ error: 'session_id_conflict' }, { status: 409 }), env.allowedOrigins);
      }
      throw error;
    }

    return withCors(req, json({ session }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/sessions/progress') {
    const { uid } = await requireAuth(req, meta);
    const body = await getJsonBody<SessionProgressBody>(req);

    if (!isNonEmptyString(body.sessionId) || !isValidSessionExercisesPayload(body.exercises)) {
      return withCors(req, json({ error: 'invalid_session' }, { status: 400 }), env.allowedOrigins);
    }

    updateSessionProgress(db, uid, body.sessionId, body.exercises);
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/sessions/complete') {
    const { uid } = await requireAuth(req, meta);
    const body = await getJsonBody<SessionCompleteBody>(req);

    if (!isNonEmptyString(body.sessionId) || !isValidSessionExercisesPayload(body.exercises)) {
      return withCors(req, json({ error: 'invalid_session' }, { status: 400 }), env.allowedOrigins);
    }

    const completedAt = sanitizeCompletedAtMs(body.completedAt);
    const totalDurationMin = isValidNumber(body.totalDuration)
      ? Math.min(24 * 60, Math.max(1, Math.round(body.totalDuration)))
      : 1;
    completeSession(db, uid, body.sessionId, body.exercises, completedAt, totalDurationMin);
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/exercise-logs') {
    const { uid } = await requireAuth(req, meta);
    const body = await getJsonBody<ExerciseLogBody>(req);

    if (!isNonEmptyString(body.exerciseId) || !isValidDateKey(body.date) || !isValidSetsPayload(body.sets)) {
      return withCors(req, json({ error: 'invalid_exercise_log' }, { status: 400 }), env.allowedOrigins);
    }

    if (isNonEmptyString(body.userId) && body.userId !== uid) {
      return withCors(req, json({ error: 'invalid_user' }, { status: 403 }), env.allowedOrigins);
    }

    upsertExerciseLog(db, uid, {
      exerciseId: body.exerciseId,
      date: body.date,
      sets: body.sets
    });
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/data/exercise-logs') {
    const { uid } = await requireAuth(req, meta);
    const date = url.searchParams.get('date') ?? '';
    if (!isValidDateKey(date)) {
      return withCors(req, json({ error: 'missing_date' }, { status: 400 }), env.allowedOrigins);
    }
    const logs = listExerciseLogsForDate(db, uid, date);
    return withCors(req, json({ logs }), env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/data/workouts') {
    const { uid } = await requireAuth(req, meta);
    const limit = isValidLimitParam(url.searchParams.get('limit'), 200);
    const workouts = listWorkouts(db, uid, limit);
    return withCors(req, json({ workouts }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/workouts') {
    const { uid } = await requireAuth(req, meta);
    const body = await getJsonBody<WorkoutUpsertBody>(req);

    if (!body.workout || !isNonEmptyString(body.workout.id) || !isNonEmptyString(body.workout.day) || !isNonEmptyString(body.workout.name)) {
      return withCors(req, json({ error: 'invalid_workout' }, { status: 400 }), env.allowedOrigins);
    }

    if (!isValidExerciseList(body.workout.exercises)) {
      return withCors(req, json({ error: 'invalid_workout_exercises' }, { status: 400 }), env.allowedOrigins);
    }

    upsertWorkout(db, uid, body.workout);
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/musclewiki/suggest') {
    await requireAuth(req, meta);
    const body = await getJsonBody<MusclewikiSuggestBody>(req);

    if (!isNonEmptyString(body.query)) {
      return withCors(req, json({ error: 'invalid_query' }, { status: 400 }), env.allowedOrigins);
    }

    const limit = isValidLimit(body.limit) ? body.limit : 5;
    const suggestions = await suggestMusclewiki(body.query, limit);
    return withCors(req, json({ suggestions }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/musclewiki/videos') {
    await requireAuth(req, meta);
    const body = await getJsonBody<MusclewikiVideoBody>(req);

    if (!isValidSlug(body.slug)) {
      return withCors(req, json({ error: 'invalid_slug' }, { status: 400 }), env.allowedOrigins);
    }

    const entry = await getMusclewikiVideos(body.slug);
    return withCors(
      req,
      json({
        pageUrl: entry.pageUrl,
        defaultVideoUrl: entry.defaultVideoUrl,
        variants: entry.variants
      }),
      env.allowedOrigins
    );
  }

  return withCors(req, json({ error: 'not_found' }, { status: 404 }), env.allowedOrigins);
};

Bun.serve({
  port: env.port,
  fetch: async (req: Request) => {
    const startedAtMs = Date.now();
    const url = new URL(req.url);

    const isHealth = req.method === 'GET' && url.pathname === '/health';
    if (isHealth) {
      try {
        return await handler(req);
      } catch (error) {
        if (error instanceof Response) {
          return withCors(req, error, env.allowedOrigins);
        }

        logError({
          event: 'api_error',
          requestId: 'health',
          method: req.method,
          path: url.pathname,
          ...toErrorDetails(error)
        });

        return withCors(req, json({ error: 'internal_error' }, { status: 500 }), env.allowedOrigins);
      }
    }

    const meta: RequestLogMeta = {
      requestId: globalThis.crypto?.randomUUID?.() ?? `req_${startedAtMs}_${Math.random().toString(16).slice(2)}`,
      method: req.method,
      path: url.pathname,
      startedAtMs
    };

    logRequestIn(meta);

    try {
      const res = await handler(req, meta);
      logRequestOut(meta, res.status);
      return res;
    } catch (error) {
      if (error instanceof Response) {
        const res = withCors(req, error, env.allowedOrigins);
        logRequestOut(meta, res.status);
        return res;
      }

      logError({
        event: 'api_error',
        requestId: meta.requestId,
        method: meta.method,
        path: meta.path,
        uid: meta.uid,
        durationMs: Date.now() - meta.startedAtMs,
        ...toErrorDetails(error)
      });

      const res = withCors(req, json({ error: 'internal_error' }, { status: 500 }), env.allowedOrigins);
      logRequestOut(meta, res.status);
      return res;
    }
  }
});
