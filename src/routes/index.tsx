import { createFileRoute } from '@tanstack/react-router';
import { ProjectsPage } from '@/features/projects/components/projects-page';
import { requireAuth } from '@/features/auth/require-auth';
import { cleanupBlobUrls } from '@/features/projects/deps/media-library-contract';
import { useProjectStore } from '@/features/projects/stores/project-store';

export const Route = createFileRoute('/')({
  component: ProjectsPage,
  beforeLoad: async (ctx) => {
    requireAuth(ctx);
    cleanupBlobUrls();
    const { loadProjects } = useProjectStore.getState();
    await loadProjects();
  },
});
