import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { FreeCutLogo } from '@/components/brand/freecut-logo';
import { Button } from '@/components/ui/button';
import { TIKTOK_OAUTH_COMPLETE_MESSAGE_TYPE } from '@/shared/tiktok-oauth';
import { createLogger } from '@/shared/logging/logger';

const log = createLogger('TikTokConnected');

export const Route = createFileRoute('/tiktok/connected')({
  validateSearch: (search: Record<string, unknown>) => ({
    success:
      search.success === 'true' ||
      search.success === true ||
      search.success === '1',
  }),
  component: TikTokConnectedPage,
});

function TikTokConnectedPage() {
  const { success } = Route.useSearch();

  useEffect(() => {
    if (!success) {
      return;
    }
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          { type: TIKTOK_OAUTH_COMPLETE_MESSAGE_TYPE, success: true },
          window.location.origin
        );
      }
    } catch (err) {
      log.warn('TikTok OAuth opener notify failed', err);
    }

    const timer = window.setTimeout(() => {
      window.close();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [success]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-primary/25 via-background to-muted p-6">
      <div className="pointer-events-none absolute -left-32 -top-32 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-primary/5 blur-3xl" />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3">
          <FreeCutLogo size="md" />
          {success ? (
            <>
              <p className="text-4xl" aria-hidden>
                ✅
              </p>
              <h1 className="text-xl font-semibold tracking-tight">TikTok connected</h1>
              <p className="text-sm text-muted-foreground">
                You can return to the export window to finish posting your video.
              </p>
              <p className="text-xs text-muted-foreground">This window will close automatically.</p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight">TikTok connection</h1>
              <p className="text-sm text-muted-foreground">
                If a login window was open, you can close this tab and try again from the app.
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => window.close()}>
            Close window
          </Button>
          <Button type="button" size="sm" asChild>
            <Link to="/">Open app</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
