import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/shared/ui/cn';

export interface PromptFormValues {
  name: string;
  prompt: string;
}

export interface PromptFormProps {
  /** When this value changes, name/prompt reset from `defaultValues`. */
  resetKey?: string | number;
  defaultValues?: Partial<PromptFormValues>;
  onSubmit: (values: PromptFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
  /** API or parent error (shown in addition to client-side validation). */
  error?: string | null;
  submitLabel?: string;
  cancelLabel?: string;
  nameInputId?: string;
  promptInputId?: string;
  className?: string;
}

/**
 * Shared name + prompt fields with validation and actions for caption translation prompts.
 */
export function PromptForm({
  resetKey,
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
  error = null,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  nameInputId = 'prompt-form-name',
  promptInputId = 'prompt-form-prompt',
  className,
}: PromptFormProps) {
  const [name, setName] = useState(defaultValues?.name ?? '');
  const [prompt, setPrompt] = useState(defaultValues?.prompt ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setName(defaultValues?.name ?? '');
    setPrompt(defaultValues?.prompt ?? '');
    setLocalError(null);
  }, [resetKey, defaultValues?.name, defaultValues?.prompt]);

  const displayError = error ?? localError;

  const handleSubmit = () => {
    const n = name.trim();
    const p = prompt.trim();
    if (!p) {
      setLocalError('Prompt is required');
      return;
    }
    if (!n) {
      setLocalError('Name is required');
      return;
    }
    setLocalError(null);
    void Promise.resolve(onSubmit({ name: n, prompt: p }));
  };

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-4', className)}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1">
        <div className="flex flex-col gap-2">
          <Label htmlFor={nameInputId}>Name</Label>
          <Input
            id={nameInputId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Short label"
            autoComplete="off"
            disabled={isSubmitting}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={promptInputId}>Prompt</Label>
          <Textarea
            id={promptInputId}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Instructions for translation"
            rows={14}
            disabled={isSubmitting}
            className="min-h-[min(50vh,22rem)] resize-y text-sm leading-relaxed"
          />
        </div>
        {displayError && (
          <p className="text-destructive shrink-0 text-sm">{displayError}</p>
        )}
      </div>
      <DialogFooter className="shrink-0">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {cancelLabel}
          </Button>
        )}
        <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );
}
