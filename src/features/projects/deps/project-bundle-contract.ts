/**
 * Adapter for project-bundle — projects feature must not import @/features/project-bundle directly.
 */

export type { ImportProgress } from '@/features/project-bundle/types/bundle';
export { BUNDLE_EXTENSION } from '@/features/project-bundle/types/bundle';

export async function loadBundleImportService() {
  return import('@/features/project-bundle/services/bundle-import-service');
}
