import { useState } from "react";
import { api, ApiError } from "../api/client.js";
import { Card, Button } from "../components/Card.js";
import { Logomark } from "../components/Logo.js";
import { USERS, DEFAULT_USER_ID } from "../data/users.js";

export function LoginPage({ onSuccess }: { onSuccess: (userId: string) => void }) {
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.login(password, userId);
      onSuccess(userId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper)] px-4">
      <Card className="w-full max-w-sm shadow-[var(--shadow-lg)]">
        <div className="flex items-center gap-2.5 mb-6">
          <Logomark size={32} />
          <span className="font-serif-heading text-lg font-semibold tracking-tight">Fiscus</span>
        </div>
        <h1 className="text-base font-semibold mb-1">Sign in to continue</h1>
        <p className="text-sm text-[var(--muted)] mb-6">Trade Credit Risk Tool</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-user" className="block text-xs font-medium mb-1.5 text-[var(--muted)]">
              Signing in as
            </label>
            <select id="login-user" value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full field">
              {USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="login-password" className="block text-xs font-medium mb-1.5 text-[var(--muted)]">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full field"
            />
          </div>
          {error && <p className="text-sm text-[var(--crit)]">{error}</p>}
          <Button type="submit" disabled={submitting || !password} className="w-full">
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
