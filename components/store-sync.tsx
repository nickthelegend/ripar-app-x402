"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchOnboardingRow, fetchProfileRow, saveOnboardingRow } from "@/lib/db";
import { getCredits, hydrateCredits, hydrateProfile, resetLocalState } from "@/lib/store";

// Mounted once in the root layout. When a Supabase session exists, hydrates
// the local stores from the database (and pushes merged onboarding progress
// back up). Renders nothing; signed-out sessions are untouched.
export function StoreSync() {
  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      const [profile, onboarding] = await Promise.all([fetchProfileRow(), fetchOnboardingRow()]);
      if (cancelled) return;
      if (profile) hydrateProfile(profile);
      if (onboarding) {
        const aheadOfDb = hydrateCredits(onboarding);
        if (aheadOfDb) saveOnboardingRow(getCredits());
      }
    };

    sync();

    const supabase = createClient();
    const sub = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") sync();
      // Clear local caches on sign-out so the next account on this browser
      // neither sees nor union-merges the previous user's state.
      if (event === "SIGNED_OUT") resetLocalState();
    });
    return () => {
      cancelled = true;
      sub?.data.subscription.unsubscribe();
    };
  }, []);

  return null;
}
