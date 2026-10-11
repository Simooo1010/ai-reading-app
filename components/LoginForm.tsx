"use client";

// Sign-in form. Posts to the `login` server action; it also works without
// JavaScript (the browser posts the form and the page shows the result).

import { useActionState } from "react";
import { login, type LoginState } from "@/app/login/actions";

const INITIAL: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, INITIAL);
  const error = state.error;

  return (
    <form action={formAction} className="rr-login">
      <p className="rr-body-italic">Enter the password to open your reading list.</p>
      {/* Hidden user name so iPhone Passwords can save and fill the password
          (it needs a user name field). Not shown, not focusable, not read
          out; the login action reads only "password". */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        defaultValue="AI Reading"
        className="rr-sr-only"
        tabIndex={-1}
        aria-hidden="true"
        readOnly
      />
      <div className="rr-field">
        <label htmlFor="password" className="rr-field__label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="rr-field__input"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
        />
        {error && (
          <p id="login-error" className="rr-field__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="rr-login__actions">
        <button type="submit" className="rr-btn rr-btn--primary" disabled={pending}>
          Enter
        </button>
      </div>
    </form>
  );
}
