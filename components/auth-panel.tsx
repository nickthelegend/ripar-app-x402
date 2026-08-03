"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { GitHubLogo, GoogleLogo, MicrosoftLogo, RiparWordmark } from "@/components/brand-logos";
import { useToast } from "@/components/ui/toast";

type Provider = "google" | "azure" | "github";

export function AuthPanel() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<Provider | "email" | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

  const oauth = async (provider: Provider) => {
    setError(null);
    const supabase = createClient();
    if (!supabase) {
      setError("Add your Supabase keys to .env.local to enable sign-in.");
      return;
    }
    setLoading(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) {
      setError(error.message);
      setLoading(null);
    }
  };

  const emailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email) return;
    const supabase = createClient();
    if (!supabase) {
      setError("Add your Supabase keys to .env.local to enable sign-in.");
      return;
    }
    setLoading("email");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setLoading(null);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
      <div className="absolute left-8 top-8">
        <RiparWordmark />
      </div>

      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Welcome to Ripar</h1>
        <p className="mt-2 text-[15px] text-neutral-500">The execution layer for Algorand agents</p>

        {sent ? (
          <div className="mt-8 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-700">
            <p className="font-medium text-neutral-900">Check your inbox</p>
            <p className="mt-1 text-neutral-500">
              We sent a magic sign-in link to <span className="font-medium text-neutral-800">{email}</span>.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-8 space-y-3">
              <OAuthButton onClick={() => oauth("google")} loading={loading === "google"} icon={<GoogleLogo />}>
                Continue with Google
              </OAuthButton>
              <OAuthButton onClick={() => oauth("azure")} loading={loading === "azure"} icon={<MicrosoftLogo />}>
                Continue with Microsoft
              </OAuthButton>
              <OAuthButton onClick={() => oauth("github")} loading={loading === "github"} icon={<GitHubLogo />}>
                Continue with GitHub
              </OAuthButton>
            </div>

            <div className="my-6 flex items-center gap-4">
              <span className="h-px flex-1 bg-neutral-200" />
              <span className="text-sm text-neutral-400">or</span>
              <span className="h-px flex-1 bg-neutral-200" />
            </div>

            <form onSubmit={emailSignIn} className="space-y-3">
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400"
              />
              <button
                type="submit"
                disabled={loading === "email"}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
              >
                {loading === "email" && <Loader2 className="h-4 w-4 animate-spin" />}
                Continue with email
              </button>
            </form>
          </>
        )}

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <p className="mt-8 text-xs leading-relaxed text-neutral-400">
          By signing in, you agree to the{" "}
          <button onClick={() => toast("Terms of Use")} className="text-neutral-600 underline underline-offset-2 hover:text-neutral-900">Terms of Use</button>,{" "}
          <button onClick={() => toast("Fair Usage Policy")} className="text-neutral-600 underline underline-offset-2 hover:text-neutral-900">Fair Usage Policy</button>, and{" "}
          <button onClick={() => toast("Privacy Notice")} className="text-neutral-600 underline underline-offset-2 hover:text-neutral-900">Privacy Notice</button>.
        </p>
      </div>
    </div>
  );
}

function OAuthButton({
  children,
  icon,
  onClick,
  loading,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        "flex w-full items-center justify-center gap-3 rounded-full border border-neutral-200 bg-white py-3 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50 disabled:opacity-60"
      )}
    >
      {loading ? <Loader2 className="h-[18px] w-[18px] animate-spin text-neutral-400" /> : icon}
      {children}
    </button>
  );
}
