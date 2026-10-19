"use client";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ErrorText, Modal } from "./ui";
export default function AuthDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password") ?? "");
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: String(form.get("name")).trim() },
            emailRedirectTo: `${location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        if (data.session) onClose();
        else
          setMessage(
            "Check your email to confirm your account, then come back and sign in.",
          );
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/auth/callback?recovery=1`,
        });
        if (error) throw error;
        setMessage(
          "If this email has an account, a password reset link is on its way.",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onClose();
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not sign in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        mode === "signup"
          ? "Your wishes. Your little world."
          : mode === "reset"
            ? "A fresh start"
            : "Welcome to your next obsession."
      }
      subtitle="A private shelf for you. Shared spaces for your people."
    >
      <div className="auth-badge">
        <Sparkles size={14} /> MAKE ROOM FOR YOUR WANTS
      </div>
      <div className="segmented">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            className={mode === m ? "active" : ""}
            onClick={() => {
              setMode(m);
              setError("");
              setMessage("");
            }}
          >
            {m === "login" ? "Sign in" : "Create an account"}
          </button>
        ))}
      </div>
      <form className="form-stack" onSubmit={submit}>
        {mode === "signup" && (
          <label>
            Your name
            <input
              name="name"
              autoComplete="name"
              required
              maxLength={80}
              placeholder="What should we call you?"
            />
          </label>
        )}
        <label>
          Email
          <div className="input-icon">
            <Mail size={17} />
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </div>
        </label>
        {mode !== "reset" && (
          <label>
            Password
            <div className="input-icon">
              <LockKeyhole size={17} />
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                minLength={mode === "signup" ? 8 : 1}
                required
                placeholder={
                  mode === "signup" ? "At least 8 characters" : "Your password"
                }
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
        )}
        <ErrorText>{error}</ErrorText>
        {message && (
          <p className="notice success" role="status">
            {message}
          </p>
        )}
        <button className="btn primary full" disabled={busy}>
          {busy
            ? "One moment…"
            : mode === "signup"
              ? "Create my shelf"
              : mode === "reset"
                ? "Send reset link"
                : "Step into my shelf"}
          <ArrowRight size={17} />
        </button>
        {mode === "login" && (
          <button
            type="button"
            className="text-btn centered"
            onClick={() => setMode("reset")}
          >
            Forgot your password?
          </button>
        )}
        <p className="form-footnote">
          Your personal library is private. Only the people you invite can
          access your shared libraries.
        </p>
      </form>
    </Modal>
  );
}
