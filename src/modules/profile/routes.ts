import { getJsonBody, json, withCors } from '../../shared/http/http';
import {
  upsertUserProfile,
  insertBodyMeasurement,
  updateBodyMeasurement,
  deleteBodyMeasurement,
  listBodyMeasurements,
  getBodyMeasurement
} from '../../shared/persistence/sqlite';
import { isNonEmptyString, isValidLimitParam, sanitizeBodyMeasurementInput } from '../../shared/validation/request';
import type { AppRouteHandler } from '../../app/router';

type ProfileSyncBody = {
  displayName?: string;
  avatarUrl?: string;
  email?: string;
};

export const handleProfileRoutes: AppRouteHandler = async (req, url, context, meta) => {
  if (req.method === 'POST' && url.pathname === '/v1/data/profile') {
    const auth = await context.requireAuth(req, meta);
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

    upsertUserProfile(context.db, {
      uid: auth.uid,
      displayName,
      avatarUrl,
      email
    });

    return withCors(req, json({ ok: true }), context.env.allowedOrigins);
  }

  // GET /v1/data/profile/measurements - List body measurements
  if (req.method === 'GET' && url.pathname === '/v1/data/profile/measurements') {
    const { uid } = await context.requireAuth(req, meta);
    const limit = isValidLimitParam(url.searchParams.get('limit'), 100, 50) ?? 50;

    const measurements = listBodyMeasurements(context.db, uid, limit);
    return withCors(req, json({ measurements }), context.env.allowedOrigins);
  }

  // POST /v1/data/profile/measurements - Create or update body measurement
  if (req.method === 'POST' && url.pathname === '/v1/data/profile/measurements') {
    const { uid } = await context.requireAuth(req, meta);
    const body = await getJsonBody<Record<string, unknown>>(req);

    const input = sanitizeBodyMeasurementInput(body);
    if (!input) {
      return withCors(
        req,
        json({ error: 'invalid_measurement_data' }, { status: 400 }),
        context.env.allowedOrigins
      );
    }

    // If id is provided, update existing; otherwise create new
    if (input.id) {
      const updated = updateBodyMeasurement(context.db, {
        id: input.id,
        uid,
        measuredAtMs: input.measuredAt,
        weightKg: input.weightKg,
        heightCm: input.heightCm,
        bodyFatPercentage: input.bodyFatPercentage,
        waistCm: input.waistCm,
        hipsCm: input.hipsCm,
        chestCm: input.chestCm,
        armsCm: input.armsCm,
        thighsCm: input.thighsCm,
        calvesCm: input.calvesCm,
        notes: input.notes
      });

      if (!updated) {
        return withCors(
          req,
          json({ error: 'measurement_not_found' }, { status: 404 }),
          context.env.allowedOrigins
        );
      }

      return withCors(req, json({ ok: true, updated: true }), context.env.allowedOrigins);
    }

    // Create new measurement
    const id = crypto.randomUUID();
    insertBodyMeasurement(context.db, {
      id,
      uid,
      measuredAtMs: input.measuredAt!,
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      bodyFatPercentage: input.bodyFatPercentage,
      waistCm: input.waistCm,
      hipsCm: input.hipsCm,
      chestCm: input.chestCm,
      armsCm: input.armsCm,
      thighsCm: input.thighsCm,
      calvesCm: input.calvesCm,
      notes: input.notes
    });

    return withCors(req, json({ ok: true, id }), context.env.allowedOrigins);
  }

  // DELETE /v1/data/profile/measurements/:id - Delete body measurement
  if (req.method === 'DELETE' && url.pathname.startsWith('/v1/data/profile/measurements/')) {
    const { uid } = await context.requireAuth(req, meta);
    const id = url.pathname.split('/').pop();

    if (!id || !isNonEmptyString(id)) {
      return withCors(
        req,
        json({ error: 'invalid_measurement_id' }, { status: 400 }),
        context.env.allowedOrigins
      );
    }

    const deleted = deleteBodyMeasurement(context.db, id, uid);

    if (!deleted) {
      return withCors(
        req,
        json({ error: 'measurement_not_found' }, { status: 404 }),
        context.env.allowedOrigins
      );
    }

    return withCors(req, json({ ok: true }), context.env.allowedOrigins);
  }

  return null;
};
