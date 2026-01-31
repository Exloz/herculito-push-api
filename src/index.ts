import { loadEnv } from './env';
import { corsPreflight, getJsonBody, json, withCors } from './http';
import { requireFirebaseAuth } from './auth';
import {
  completeSession,
  createExercise,
  createRoutine,
  deleteRoutine,
  incrementExerciseUsage,
  incrementRoutineUsage,
  listExercises,
  listRoutines,
  listSessions,
  listWorkouts,
  startSession,
  updateExercise,
  updateRoutine,
  updateSessionProgress,
  upsertExerciseLog,
  upsertWorkout
} from './data';
import {
  cancelJobsForDevice,
  createDb,
  deactivateSubscription,
  getDueJobs,
  getSubscription,
  markJobCanceled,
  markJobFailed,
  markJobSent,
  rescheduleJob,
  tryClaimJob,
  upsertJob,
  upsertSubscription
} from './db';
import { initWebPush, sendPush, type PushPayload, type PushSubscriptionLike } from './push';

const env = loadEnv();
const db = createDb(env.databasePath);

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
  title?: string;
  body?: string;
  url?: string;
};

type CancelBody = {
  deviceId: string;
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

const isValidOptionalNumber = (value: unknown): value is number | undefined => {
  return value === undefined || isValidNumber(value);
};

const makeRestJobId = (uid: string, deviceId: string): string => `${uid}:${deviceId}:rest`;

const MUSCLEWIKI_SITEMAP_URL = 'https://musclewiki.com/sitemap.xml';
const MUSCLEWIKI_PAGE_BASE = 'https://musclewiki.com/es-es/exercise';
const MUSCLEWIKI_SLUG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MUSCLEWIKI_VIDEO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

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
  ['press de banca', 'bench press'],
  ['press banca', 'bench press'],
  ['press militar', 'military press'],
  ['elevaciones laterales', 'lateral raise'],
  ['curl martillo', 'hammer curl'],
  ['curl de biceps', 'biceps curl'],
  ['curl de bíceps', 'biceps curl'],
  ['extension de triceps', 'triceps extension'],
  ['extensión de triceps', 'triceps extension']
];

const MUSCLEWIKI_TOKEN_MAP: Record<string, string> = {
  mancuerna: 'dumbbell',
  mancuernas: 'dumbbell',
  barra: 'barbell',
  polea: 'cable',
  poleas: 'cable',
  biceps: 'biceps',
  triceps: 'triceps',
  pecho: 'chest',
  espalda: 'back',
  pierna: 'leg',
  piernas: 'leg',
  hombro: 'shoulder',
  hombros: 'shoulder',
  press: 'press',
  curl: 'curl',
  dominadas: 'pull',
  dominada: 'pull',
  pullup: 'pull',
  jalon: 'pulldown',
  jalones: 'pulldown',
  remo: 'row',
  sentadilla: 'squat',
  sentadillas: 'squat',
  inclinado: 'incline',
  declinado: 'decline',
  martillo: 'hammer',
  fondos: 'dip',
  fondo: 'dip',
  dips: 'dip'
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

const fetchMusclewikiSlugs = async (): Promise<string[]> => {
  const res = await fetch(MUSCLEWIKI_SITEMAP_URL, {
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
      const slugTokens = tokenizeSlug(slug);
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
  const res = await fetch(pageUrl, {
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
    return cached;
  }
  const entry = await fetchMusclewikiVideos(slug);
  musclewikiVideoCache.set(slug, entry);
  return entry;
};

type RequestLogMeta = {
  requestId: string;
  method: string;
  path: string;
  startedAtMs: number;
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


const logRequestIn = (meta: RequestLogMeta): void => {
  logInfo({
    event: 'api_in',
    requestId: meta.requestId,
    method: meta.method,
    path: meta.path
  });
};

const logRequestOut = (meta: RequestLogMeta, status: number): void => {
  logInfo({
    event: 'api_out',
    requestId: meta.requestId,
    method: meta.method,
    path: meta.path,
    status,
    durationMs: Date.now() - meta.startedAtMs
  });
};

const schedulerTick = async (): Promise<void> => {
  const now = Date.now();
  const due = getDueJobs(db, now, 20);
  if (due.length === 0) return;

  for (const job of due) {
    if (!tryClaimJob(db, job.id)) continue;

    try {
      const subscriptionRow = getSubscription(db, job.uid, job.deviceId);
      if (!subscriptionRow || subscriptionRow.isActive !== 1) {
        markJobCanceled(db, job.id);
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
      await sendPush(subscription, payload);
      markJobSent(db, job.id);
    } catch (error) {
      const err = error as unknown as { statusCode?: number };
      const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : undefined;

      if (statusCode === 404 || statusCode === 410) {
        deactivateSubscription(db, job.uid, job.deviceId);
        markJobCanceled(db, job.id);
        continue;
      }

      const nextAttempts = job.attempts + 1;
      if (nextAttempts <= 3) {
        rescheduleJob(db, job.id, Date.now() + 5_000, nextAttempts);
      } else {
        markJobFailed(db, job.id);
      }


    }
  }
};

setInterval(() => {
  void schedulerTick();
}, 750);

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return corsPreflight(req, env.allowedOrigins);
  }

  const url = new URL(req.url);

  if (req.method === 'GET' && url.pathname === '/health') {
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/push/vapidPublicKey') {
    return withCors(req, json({ vapidPublicKey: env.vapidPublicKey }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/push/subscribe') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
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
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
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

    upsertJob(db, {
      id: jobId,
      uid,
      deviceId: body.deviceId,
      executeAtMs,
      payloadJson: JSON.stringify(payload)
    });

    return withCors(req, json({ ok: true, jobId, executeAtMs }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/rest/cancel') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<CancelBody>(req);

    if (!isNonEmptyString(body.deviceId)) {
      return withCors(req, json({ error: 'invalid_device_id' }, { status: 400 }), env.allowedOrigins);
    }

    const canceled = cancelJobsForDevice(db, uid, body.deviceId);
    return withCors(req, json({ ok: true, canceled }), env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/data/exercises') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const exercises = listExercises(db, uid);
    return withCors(req, json({ exercises }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/exercises') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<ExerciseCreateBody>(req);

    if (!isNonEmptyString(body.name) || !isNonEmptyString(body.category)) {
      return withCors(req, json({ error: 'invalid_name_or_category' }, { status: 400 }), env.allowedOrigins);
    }

    if (!isValidNumber(body.sets) || !isValidNumber(body.reps) || !isValidNumber(body.restTime)) {
      return withCors(req, json({ error: 'invalid_defaults' }, { status: 400 }), env.allowedOrigins);
    }

    const exercise = createExercise(db, uid, {
      name: body.name,
      category: body.category,
      sets: body.sets,
      reps: body.reps,
      restTime: body.restTime,
      description: body.description,
      isPublic: body.isPublic,
      createdByName: body.createdByName,
      muscleGroup: body.muscleGroup,
      video: body.video
    });

    return withCors(req, json({ exercise }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/exercises/update') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<ExerciseUpdateBody>(req);

    if (!isNonEmptyString(body.id)) {
      return withCors(req, json({ error: 'invalid_exercise_id' }, { status: 400 }), env.allowedOrigins);
    }

    updateExercise(db, uid, body.id, body.updates ?? {});
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/exercises/use') {
    await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<ExerciseUsageBody>(req);

    if (!isNonEmptyString(body.id)) {
      return withCors(req, json({ error: 'invalid_exercise_id' }, { status: 400 }), env.allowedOrigins);
    }

    incrementExerciseUsage(db, body.id);
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/data/routines') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const routines = listRoutines(db, uid);
    return withCors(req, json({ routines }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/routines') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<RoutineCreateBody>(req);

    if (!isNonEmptyString(body.name) || !Array.isArray(body.exercises)) {
      return withCors(req, json({ error: 'invalid_routine' }, { status: 400 }), env.allowedOrigins);
    }

    const routine = createRoutine(db, uid, body);
    return withCors(req, json({ routine }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/routines/update') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<RoutineUpdateBody>(req);

    if (!isNonEmptyString(body.id)) {
      return withCors(req, json({ error: 'invalid_routine_id' }, { status: 400 }), env.allowedOrigins);
    }

    updateRoutine(db, uid, body.id, body.updates ?? {});
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/routines/delete') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<RoutineDeleteBody>(req);

    if (!isNonEmptyString(body.id)) {
      return withCors(req, json({ error: 'invalid_routine_id' }, { status: 400 }), env.allowedOrigins);
    }

    deleteRoutine(db, uid, body.id);
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/routines/use') {
    await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<RoutineUsageBody>(req);

    if (!isNonEmptyString(body.id)) {
      return withCors(req, json({ error: 'invalid_routine_id' }, { status: 400 }), env.allowedOrigins);
    }

    incrementRoutineUsage(db, body.id);
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'GET' && url.pathname === '/v1/data/sessions') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const sessions = listSessions(db, uid);
    return withCors(req, json({ sessions }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/sessions/start') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<SessionStartBody>(req);

    if (!isNonEmptyString(body.routineName)) {
      return withCors(req, json({ error: 'invalid_routine_name' }, { status: 400 }), env.allowedOrigins);
    }

    if (!isValidOptionalNumber(body.startedAt)) {
      return withCors(req, json({ error: 'invalid_started_at' }, { status: 400 }), env.allowedOrigins);
    }

    const session = startSession(db, uid, {
      id: body.id,
      routineId: body.routineId,
      routineName: body.routineName,
      primaryMuscleGroup: body.primaryMuscleGroup,
      startedAt: body.startedAt
    });
    return withCors(req, json({ session }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/sessions/progress') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<SessionProgressBody>(req);

    if (!isNonEmptyString(body.sessionId) || !Array.isArray(body.exercises)) {
      return withCors(req, json({ error: 'invalid_session' }, { status: 400 }), env.allowedOrigins);
    }

    updateSessionProgress(db, uid, body.sessionId, body.exercises);
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/sessions/complete') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<SessionCompleteBody>(req);

    if (!isNonEmptyString(body.sessionId) || !Array.isArray(body.exercises)) {
      return withCors(req, json({ error: 'invalid_session' }, { status: 400 }), env.allowedOrigins);
    }

    const completedAt = isValidNumber(body.completedAt) ? body.completedAt : Date.now();
    const totalDuration = isValidNumber(body.totalDuration) ? body.totalDuration : 0;
    completeSession(db, uid, body.sessionId, body.exercises, completedAt, totalDuration);
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/exercise-logs') {
    const { uid } = await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<ExerciseLogBody>(req);

    if (!isNonEmptyString(body.exerciseId) || !isNonEmptyString(body.date) || !Array.isArray(body.sets)) {
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

  if (req.method === 'GET' && url.pathname === '/v1/data/workouts') {
    await requireFirebaseAuth(req, env.firebaseProjectId);
    const workouts = listWorkouts(db);
    return withCors(req, json({ workouts }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/workouts') {
    await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<WorkoutUpsertBody>(req);

    if (!body.workout || !isNonEmptyString(body.workout.id)) {
      return withCors(req, json({ error: 'invalid_workout' }, { status: 400 }), env.allowedOrigins);
    }

    upsertWorkout(db, body.workout);
    return withCors(req, json({ ok: true }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/musclewiki/suggest') {
    await requireFirebaseAuth(req, env.firebaseProjectId);
    const body = await getJsonBody<MusclewikiSuggestBody>(req);

    if (!isNonEmptyString(body.query)) {
      return withCors(req, json({ error: 'invalid_query' }, { status: 400 }), env.allowedOrigins);
    }

    const limit = isValidLimit(body.limit) ? body.limit : 5;
    const suggestions = await suggestMusclewiki(body.query, limit);
    return withCors(req, json({ suggestions }), env.allowedOrigins);
  }

  if (req.method === 'POST' && url.pathname === '/v1/musclewiki/videos') {
    await requireFirebaseAuth(req, env.firebaseProjectId);
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
      const res = await handler(req);
      logRequestOut(meta, res.status);
      return res;
    } catch (error) {
      if (error instanceof Response) {
        const res = withCors(req, error, env.allowedOrigins);
        logRequestOut(meta, res.status);
        return res;
      }

      const res = withCors(req, json({ error: 'internal_error' }, { status: 500 }), env.allowedOrigins);
      logRequestOut(meta, res.status);
      return res;
    }
  }
});
