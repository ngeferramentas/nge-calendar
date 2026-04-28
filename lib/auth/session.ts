import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/types/database";

export type SessionContext = {
  userId: string;
  email: string | undefined;
  profile: ProfileRow;
};

export async function getSessionContext(): Promise<SessionContext | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) return null;

  return {
    userId: user.id,
    email: user.email,
    profile: profile as ProfileRow,
  };
}

export function requireAdmin(ctx: SessionContext | null): SessionContext {
  if (!ctx || ctx.profile.role !== "admin") {
    throw new Error("Acesso negado: apenas administradores.");
  }
  return ctx;
}

export function requireUserManager(ctx: SessionContext | null): SessionContext {
  const adminCtx = requireAdmin(ctx);
  if (!adminCtx.profile.can_manage_users) {
    throw new Error("Acesso negado: apenas gestores de usuários.");
  }
  return adminCtx;
}
