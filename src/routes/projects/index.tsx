import { createFileRoute, redirect } from '@tanstack/react-router';
import { requireAuth } from '@/features/auth/require-auth';

export const Route = createFileRoute('/projects/')({
  beforeLoad: (ctx) => {
    requireAuth(ctx);
    throw redirect({ to: '/' });
  },
});
