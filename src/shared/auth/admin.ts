import type { AuthContext } from './clerk-auth';

export const ADMIN_EMAIL = 'exloz26@gmail.com';
export const ADMIN_CLERK_USER_ID = 'user_3AC1fVPB8cpo0blGds7MPQHq7Fo';

const normalizeEmail = (value?: string): string => {
  return value?.trim().toLowerCase() ?? '';
};

export const isAdminAuth = (auth: Pick<AuthContext, 'email' | 'clerkUserId'>): boolean => {
  return normalizeEmail(auth.email) === ADMIN_EMAIL && auth.clerkUserId === ADMIN_CLERK_USER_ID;
};
