"use client";

import { useActionState } from "react";

import { signIn, type SignInState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signIn, {
    error: null,
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <label className="field">
        <span>Email</span>
        <input className="input" name="email" type="email" autoComplete="username" required autoFocus />
      </label>

      <label className="field">
        <span>Password</span>
        <input
          className="input"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>

      {state.error && (
        <p
          role="alert"
          className="m-0 p-3"
          style={{
            background: "var(--color-accent-100)",
            borderLeft: "4px solid var(--color-accent)",
            color: "var(--color-accent-800)",
            fontSize: 13,
          }}
        >
          {state.error}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        <span>{pending ? "Signing in…" : "Sign in"}</span>
        <span aria-hidden>→</span>
      </button>
    </form>
  );
}
