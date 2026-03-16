import { describe, it, expect } from 'vitest';
import { isAdminAuth, ADMIN_EMAIL, ADMIN_CLERK_USER_ID } from './admin';

describe('isAdminAuth', () => {
  it('should return true for admin email and user ID', () => {
    const auth = {
      email: ADMIN_EMAIL,
      clerkUserId: ADMIN_CLERK_USER_ID
    };
    expect(isAdminAuth(auth)).toBe(true);
  });

  it('should be case insensitive for email', () => {
    const auth = {
      email: 'EXLOZ26@GMAIL.COM',
      clerkUserId: ADMIN_CLERK_USER_ID
    };
    expect(isAdminAuth(auth)).toBe(true);
  });

  it('should return false for wrong email', () => {
    const auth = {
      email: 'user@example.com',
      clerkUserId: ADMIN_CLERK_USER_ID
    };
    expect(isAdminAuth(auth)).toBe(false);
  });

  it('should return false for wrong clerk user ID', () => {
    const auth = {
      email: ADMIN_EMAIL,
      clerkUserId: 'wrong-user-id'
    };
    expect(isAdminAuth(auth)).toBe(false);
  });

  it('should return false when both are wrong', () => {
    const auth = {
      email: 'user@example.com',
      clerkUserId: 'wrong-user-id'
    };
    expect(isAdminAuth(auth)).toBe(false);
  });

  it('should return false when email is missing', () => {
    const auth = {
      clerkUserId: ADMIN_CLERK_USER_ID
    };
    expect(isAdminAuth(auth)).toBe(false);
  });

  it('should return false when clerk user ID is missing', () => {
    const auth = {
      email: ADMIN_EMAIL,
      clerkUserId: ''
    };
    expect(isAdminAuth(auth)).toBe(false);
  });

  it('should handle undefined email', () => {
    const auth = {
      email: undefined,
      clerkUserId: ADMIN_CLERK_USER_ID
    };
    expect(isAdminAuth(auth)).toBe(false);
  });

  it('should handle empty email', () => {
    const auth = {
      email: '',
      clerkUserId: ADMIN_CLERK_USER_ID
    };
    expect(isAdminAuth(auth)).toBe(false);
  });
});
