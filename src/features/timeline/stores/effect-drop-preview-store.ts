import { create } from 'zustand';

interface EffectDropPreviewState {
  targetItemIds: string[];
  hoveredItemId: string | null;
  setPreview: (targetItemIds: string[], hoveredItemId: string) => void;
  clearPreview: () => void;
}

export const useEffectDropPreviewStore = create<EffectDropPreviewState>((set) => ({
  targetItemIds: [],
  hoveredItemId: null,
  setPreview: (targetItemIds, hoveredItemId) => set({ targetItemIds, hoveredItemId }),
  clearPreview: () => set({ targetItemIds: [], hoveredItemId: null }),
}));
