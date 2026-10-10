import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function safeEndpoint(raw, query) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("API endpoint URL is missing");
  let text = raw.trim();
  const hasPlaceholder = text.includes("{query}");
  if (hasPlaceholder) text = text.replaceAll("{query}", encodeURIComponent(query));
  let url;
  try { url = new URL(text); } catch { throw new Error("API endpoint URL is invalid"); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Only public HTTPS API endpoints are allowed");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "metadata.google.internal") throw new Error("Local/private endpoints are not allowed");
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === "0.0.0.0" || host === "::1") throw new Error("Local/private IP endpoints are not allowed");
  if (!hasPlaceholder) url.searchParams.set("query", query);
  return url;
}

async function readJsonResponse(response) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Provider returned non-JSON (HTTP ${response.status}): ${text.slice(0, 180)}`); }
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const key = String(req.headers["x-tornd-key"] || "").trim();
  const query = String(req.body?.query ?? req.body?.number ?? "").trim();
  const service = String(req.body?.service || "number").trim().toLowerCase();
  if (!key || key.length > 200) return res.status(401).json({ error: "Unlock with a valid user key first" });
  if (!query || query.length > 200) return res.status(400).json({ error: "Enter a valid query" });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: "Server database configuration missing" });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const key_hash = createHash("sha256").update(key).digest("hex");
  const { data: access, error: keyError } = await supabase.from("access_keys").select("id,is_active,expires_at,is_permanent").eq("key_hash", key_hash).maybeSingle();
  if (keyError) return res.status(500).json({ error: "Could not validate access key" });
  if (!access || !access.is_active || (!access.is_permanent && (!access.expires_at || new Date(access.expires_at) <= new Date()))) return res.status(401).json({ error: "Invalid, revoked, or expired access key" });
  const { data: sources, error } = await supabase.from("api_sources").select("id,name,endpoint_url,is_enabled").eq("is_enabled", true).order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: "Could not load enabled API integrations" });
  const matches = (sources || []).filter(s => {
    const n = String(s.name || "").toLowerCase();
    if (service === "custom") return true;
    if (service === "number") return /number|\bnum\b|phone|mobile/i.test(n);
    return n.includes(service);
  });
  if (!matches.length) return res.status(404).json({ error: `No enabled APIs match “${service}”. In Admin → API integrations, enable an endpoint and include the feature name in its integration label.` });
  const providers = await Promise.all(matches.slice(0, 8).map(async source => {
    try {
      const url = safeEndpoint(source.endpoint_url, query);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(url, { method: "GET", headers: { "Accept": "application/json" }, signal: controller.signal, redirect: "error" });
        const data = await readJsonResponse(response);
        if (!response.ok) return { name: source.name, ok: false, status: response.status, error: typeof data?.error === "string" ? data.error : `HTTP ${response.status}`, data };
        return { name: source.name, ok: true, status: response.status, data };
      } finally { clearTimeout(timeout); }
    } catch (e) { return { name: source.name, ok: false, status: 0, error: e.name === "AbortError" ? "Request timed out after 12 seconds" : String(e.message || "Provider request failed") }; }
  }));
  const successful = providers.filter(p => p.ok);
  if (!successful.length) return res.status(502).json({ error: "All matching APIs failed. Inspect each provider error below.", providers });
  return res.status(200).json({ status: "ok", service, providers });
}
