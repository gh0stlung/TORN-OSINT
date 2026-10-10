import { createHash, randomBytes } from "node:crypto";
import { requireAdmin } from "../_lib/auth.js";

export default async function handler(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const { supabase, user } = auth;

  if (req.method === "GET") {
    const { data, error } = await supabase.from("access_keys")
      .select("id,label,expires_at,is_permanent,is_active,created_at")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: "Could not list keys" });
    return res.status(200).json({ items: data });
  }

  if (req.method === "POST") {
    const { label, duration, expires_at } = req.body || {};
    if (typeof label !== "string" || !label.trim() || label.length > 100)
      return res.status(400).json({ error: "A label of 1–100 characters is required" });
    const allowed = ["2h", "24h", "7d", "30d", "custom", "permanent"];
    if (!allowed.includes(duration)) return res.status(400).json({ error: "Unsupported duration" });
    let expiry = null;
    const permanent = duration === "permanent";
    if (duration === "custom") {
      const parsed = new Date(expires_at);
      if (!expires_at || Number.isNaN(parsed.getTime()) || parsed <= new Date())
        return res.status(400).json({ error: "Custom expiry must be a valid future date" });
      expiry = parsed.toISOString();
    } else if (!permanent) {
      const hours = { "2h": 2, "24h": 24, "7d": 168, "30d": 720 }[duration];
      expiry = new Date(Date.now() + hours * 3600000).toISOString();
    }

    const plain = "TORND-" + randomBytes(24).toString("hex").toUpperCase();
    const key_hash = createHash("sha256").update(plain).digest("hex");
    const { error } = await supabase.from("access_keys").insert({
      label: label.trim(), key_hash, expires_at: expiry, is_permanent: permanent,
      is_active: true, created_by: user.id
    });
    if (error) return res.status(500).json({ error: "Could not save access key" });
    await supabase.from("audit_logs").insert({
      actor_id: user.id, action: "access_key.created",
      metadata: { label: label.trim(), duration }
    });
    return res.status(201).json({ key: plain, warning: "Copy this key now. Plaintext is not stored." });
  }

  if (req.method === "PATCH") {
    const { id, is_active } = req.body || {};
    if (typeof id !== "string" || typeof is_active !== "boolean")
      return res.status(400).json({ error: "id and boolean is_active are required" });
    const { error } = await supabase.from("access_keys").update({ is_active }).eq("id", id);
    if (error) return res.status(500).json({ error: "Could not update access key" });
    await supabase.from("audit_logs").insert({
      actor_id: user.id, action: is_active ? "access_key.activated" : "access_key.revoked",
      metadata: { id }
    });
    return res.status(200).json({ status: "ok" });
  }

  res.setHeader("Allow", "GET, POST, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}
