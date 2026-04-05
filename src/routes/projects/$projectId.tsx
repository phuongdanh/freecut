import { createFileRoute, redirect, Navigate } from '@tanstack/react-router';
import { requireAuth } from '@/features/auth/require-auth';

export const Route = createFileRoute('/projects/$projectId')({
  beforeLoad: (ctx) => {
    requireAuth(ctx);
    const { params } = ctx;
    // Redirect to the editor — project settings are handled via the edit dialog on /
    throw redirect({ to: '/editor/$projectId', params: { projectId: params.projectId } });
  },
  component: ProjectRouteRedirect,
});

function ProjectRouteRedirect() {
  const { projectId } = Route.useParams();

  // Project settings are handled via the edit dialog on /projects/.
  return <Navigate to="/editor/$projectId" params={{ projectId }} replace />;
}
