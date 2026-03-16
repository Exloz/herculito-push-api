import type { Database } from 'bun:sqlite';
import { corsPreflight, json, withCors } from '../shared/http/http';
import type { Env } from '../shared/config/env';
import type { RequestContext } from './request-context';
import type { RequestLogMeta } from './logger';
import { handleSystemRoutes } from '../modules/system/routes';
import { handlePushRoutes } from '../modules/push/routes';
import { handleRestRoutes } from '../modules/rest/routes';
import { handleProfileRoutes } from '../modules/profile/routes';
import { handleExerciseRoutes } from '../modules/exercises/routes';
import { handleDashboardRoutes } from '../modules/dashboard/routes';
import { handleRoutineRoutes } from '../modules/routines/routes';
import { handleSessionRoutes } from '../modules/sessions/routes';
import { handleWorkoutRoutes } from '../modules/workouts/routes';
import { handleMusclewikiRoutes } from '../modules/musclewiki/routes';
import { handleAdminRoutes } from '../modules/admin/routes';
import { handleSportsRoutes } from '../modules/sports/routes';
import type { createMusclewikiService } from '../modules/musclewiki/service';

export interface AppRouteContext extends RequestContext {
  env: Env;
  db: Database;
  musclewiki: ReturnType<typeof createMusclewikiService>;
}

export type AppRouteHandler = (
  req: Request,
  url: URL,
  context: AppRouteContext,
  meta?: RequestLogMeta
) => Promise<Response | null>;

const routeHandlers: AppRouteHandler[] = [
  handleSystemRoutes,
  handlePushRoutes,
  handleRestRoutes,
  handleProfileRoutes,
  handleExerciseRoutes,
  handleDashboardRoutes,
  handleRoutineRoutes,
  handleSessionRoutes,
  handleAdminRoutes,
  handleWorkoutRoutes,
  handleMusclewikiRoutes,
  handleSportsRoutes
];

export const createAppRouter = (context: AppRouteContext) => {
  return async (req: Request, meta?: RequestLogMeta): Promise<Response> => {
    if (req.method === 'OPTIONS') {
      return corsPreflight(req, context.env.allowedOrigins);
    }

    const url = new URL(req.url);

    for (const routeHandler of routeHandlers) {
      const response = await routeHandler(req, url, context, meta);
      if (response) {
        return response;
      }
    }

    return withCors(req, json({ error: 'not_found' }, { status: 404 }), context.env.allowedOrigins);
  };
};
