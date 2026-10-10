import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
export default async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const key = String(req.headers["x-tornd-key"] || "").trim();
  if (!key || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(401).json({ error: "Unlock with a valid user key first" });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const hash = createHash("sha256").update(key).digest("hex");
  const { data: access, error: keyError } = await supabase.from("access_keys").select("id,is_active,expires_at,is_permanent").eq("key_hash", hash).maybeSingle();
  if (keyError) return res.status(500).json({ error: "Could not validate access key" });
  if (!access || !access.is_active || (!access.is_permanent && (!access.expires_at || new Date(access.expires_at) <= new Date()))) return res.status(401).json({ error: "Invalid, revoked, or expired access key" });
  const { data, error } = await supabase.from("api_sources").select("name,is_enabled").eq("is_enabled", true).order("name");
  if (error) return res.status(500).json({ error: "Could not load API services" });
  const services = [];
  if ((data || []).some(x => /number|\bnum\b|phone|mobile/i.test(x.name || ""))) services.push({ value: "number", label: "📱 Number info" });
  if ((data || []).length) services.push({ value: "custom", label: "⚙️ All enabled APIs" });
  return res.status(200).json({ services });
}
