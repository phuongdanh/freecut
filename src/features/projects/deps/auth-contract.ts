/**
 * Adapter for auth — projects feature must not import @/features/auth directly.
 */

export { useAuth } from '@/features/auth/auth-context';
export type { AuthUser } from '@/features/auth/auth-context';
