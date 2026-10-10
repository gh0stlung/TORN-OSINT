import { createClient } from "@supabase/supabase-js";

export async function requireAdmin(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    res.status(503).json({ error: "Backend configuration missing" });
    return null;
  }
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Sign in required" });
    return null;
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userResult?.user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return null;
  }
  const { data: profile, error } = await supabase
    .from("profiles").select("role,is_active").eq("id", userResult.user.id).maybeSingle();
  if (error) {
    res.status(500).json({ error: "Could not verify admin role" });
    return null;
  }
  if (!profile || profile.role !== "admin" || profile.is_active !== true) {
    res.status(403).json({ error: "Active admin access required" });
    return null;
  }
  return { supabase, user: userResult.user };
}
