import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type AuthState = { session: Session | null; loading: boolean };

// One shared auth state, so every consumer (header, root, pages) sees the same
// result from a single session lookup instead of resolving it separately.
const serverState: AuthState = { session: null, loading: Boolean(supabase) };
let state: AuthState = serverState;
const listeners = new Set<() => void>();

function setState(next: AuthState) {
  state = next;
  listeners.forEach((listener) => listener());
}

let started = false;
function start() {
  if (started || !supabase) return;
  started = true;
  void supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
  supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function signInWithGoogle() {
  if (!supabase) return { error: new Error("Supabase is not configured") };
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
}

async function signOut() {
  if (!supabase) return { error: new Error("Supabase is not configured") };
  return supabase.auth.signOut();
}

export function useAuth() {
  const { session, loading } = useSyncExternalStore(subscribe, () => state, () => serverState);
  return { session, loading, configured: Boolean(supabase), signInWithGoogle, signOut };
}
