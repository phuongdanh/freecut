import { api } from '@/services/api';

/** Server-side prompt type for caption translation (matches backend `type` filter). */
export const CAPTION_TRANSLATION_PROMPT_TYPE = 1;

export interface PromptRecord {
  id: number;
  name: string;
  type: number;
  prompt: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function listPrompts(filterType?: number): Promise<PromptRecord[]> {
  const params =
    filterType !== undefined ? { type: String(filterType) } : undefined;
  const { data } = await api.get<{ data: PromptRecord[] }>('/prompts', { params });
  return data.data;
}

export async function createPrompt(payload: {
  name: string;
  type: number;
  prompt: string;
}): Promise<PromptRecord> {
  const { data } = await api.post<{ data: PromptRecord }>('/prompts', payload);
  return data.data;
}

export async function updatePrompt(
  id: number,
  payload: {
    name: string;
    type: number;
    prompt: string;
  },
): Promise<PromptRecord> {
  const { data } = await api.put<{ data: PromptRecord }>(`/prompts/${id}`, payload);
  return data.data;
}

export async function deletePrompt(id: number): Promise<void> {
  await api.delete(`/prompts/${id}`);
}
