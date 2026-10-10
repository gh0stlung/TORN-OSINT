import { requireAdmin } from "../_lib/auth.js";

export default async function handler(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const { supabase, user } = auth;

  if (req.method === "GET") {
    const { data, error } = await supabase.from("api_sources")
      .select("id,name,endpoint_url,is_enabled,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: "Could not list integrations" });
    return res.status(200).json({ items: data });
  }

  if (req.method === "POST") {
    const { name, endpoint_url } = req.body || {};
    if (typeof name !== "string" || !name.trim() || name.length > 100)
      return res.status(400).json({ error: "A name of 1–100 characters is required" });
    let endpoint = null;
    if (endpoint_url) {
      try {
        const parsed = new URL(endpoint_url);
        if (parsed.protocol !== "https:") throw new Error();
        endpoint = parsed.toString();
      } catch {
        return res.status(400).json({ error: "Endpoint must be a valid HTTPS URL" });
      }
    }
    const { data, error } = await supabase.from("api_sources")
      .insert({ name: name.trim(), endpoint_url: endpoint, is_enabled: false })
      .select("id,name,endpoint_url,is_enabled,created_at").single();
    if (error) return res.status(500).json({ error: "Could not add integration" });
    await supabase.from("audit_logs").insert({
      actor_id: user.id, action: "api_source.created", metadata: { id: data.id, name: data.name }
    });
    return res.status(201).json({ item: data, note: "Saved as disabled; no provider requests are made." });
  }

  if (req.method === "PATCH") {
    const { id, is_enabled } = req.body || {};
    if (typeof id !== "string" || typeof is_enabled !== "boolean")
      return res.status(400).json({ error: "id and boolean is_enabled are required" });
    const { error } = await supabase.from("api_sources")
      .update({ is_enabled, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return res.status(500).json({ error: "Could not update integration" });
    await supabase.from("audit_logs").insert({
      actor_id: user.id, action: is_enabled ? "api_source.enabled" : "api_source.disabled", metadata: { id }
    });
    return res.status(200).json({ status: "ok" });
  }

  if (req.method === "DELETE") {
    const id = new URL(req.url, "https://local.invalid").searchParams.get("id");
    if (!id) return res.status(400).json({ error: "id query parameter required" });
    const { error } = await supabase.from("api_sources").delete().eq("id", id);
    if (error) return res.status(500).json({ error: "Could not remove integration" });
    await supabase.from("audit_logs").insert({
      actor_id: user.id, action: "api_source.deleted", metadata: { id }
    });
    return res.status(200).json({ status: "ok" });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
