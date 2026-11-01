import { supabase } from "./supabase";

export type ReviewSettings = {
  dailyNewLimit: number;
  dailyReviewLimit: number;
  sessionSize: number;
};

type UserSettingsRow = {
  daily_new_limit: number;
  daily_review_limit: number;
  session_size: number;
};

function requireClient() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export async function loadReviewSettings(userId: string): Promise<ReviewSettings | null> {
  const { data, error } = await requireClient()
    .from("user_settings")
    .select("daily_new_limit, daily_review_limit, session_size")
    .eq("user_id", userId)
    .maybeSingle<UserSettingsRow>();

  if (error) throw error;
  if (!data) return null;

  return {
    dailyNewLimit: data.daily_new_limit,
    dailyReviewLimit: data.daily_review_limit,
    sessionSize: data.session_size,
  };
}

export async function saveReviewSettings(userId: string, settings: ReviewSettings): Promise<void> {
  const { error } = await requireClient()
    .from("user_settings")
    .upsert(
      {
        user_id: userId,
        daily_new_limit: settings.dailyNewLimit,
        daily_review_limit: settings.dailyReviewLimit,
        session_size: settings.sessionSize,
      },
      { onConflict: "user_id" },
    );

  if (error) throw error;
}
