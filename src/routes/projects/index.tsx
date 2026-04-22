import { createFileRoute } from '@tanstack/react-router';
import { requireAuth } from '@/features/auth/require-auth';
import { cleanupBlobUrls } from '@/features/media-library/utils/media-resolver';
import { useProjectStore } from '@/features/projects';
import { ProjectsPage } from '@/features/projects/components/projects-page';

export const Route = createFileRoute('/projects/')({
  component: ProjectsPage,
  beforeLoad: async (ctx) => {
    requireAuth(ctx);
    cleanupBlobUrls();
    const { loadProjects } = useProjectStore.getState();
    await loadProjects();
  },
});
