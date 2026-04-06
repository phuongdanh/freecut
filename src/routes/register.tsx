import { createFileRoute, Link } from '@tanstack/react-router';
import axios from 'axios';
import { useState } from 'react';
import { FreeCutLogo } from '@/components/brand/freecut-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authService } from '@/features/auth/auth-service';
import { requireGuest } from '@/features/auth/require-auth';

export const Route = createFileRoute('/register')({
  beforeLoad: () => {
    requireGuest();
  },
  component: RegisterPage,
});

function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await authService.register({ username, email, password });
      setSuccessMessage(response.message || 'Registration submitted successfully.');
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error
        : undefined;
      setError(message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-primary/25 via-background to-muted p-4">
      <div className="pointer-events-none absolute -left-32 -top-32 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-primary/5 blur-3xl" />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <FreeCutLogo size="lg" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Create an account</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Register to use CapFree
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reg-username">Username</Label>
            <Input
              id="reg-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              placeholder="Username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-email">Email</Label>
            <Input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-password">Password</Label>
            <Input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              placeholder="Password"
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
              {successMessage}
            </div>
          ) : null}

          <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
            {isLoading ? 'Submitting…' : 'Register'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
