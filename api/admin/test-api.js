import { requireAdmin } from "../_lib/auth.js";

function publicHttpsUrl(raw, query) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("API endpoint URL is missing");
  const original = raw.trim();
  const hasPlaceholder = original.includes("{query}");
  const filled = hasPlaceholder ? original.replaceAll("{query}", encodeURIComponent(query)) : original;
  let url;
  try { url = new URL(filled); } catch { throw new Error("API endpoint URL is invalid"); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Only public HTTPS endpoints are allowed");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "metadata.google.internal") throw new Error("Local/private endpoints are not allowed");
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === "0.0.0.0" || host === "::1") throw new Error("Local/private IP endpoints are not allowed");
  if (!hasPlaceholder) url.searchParams.set("query", query);
  return url;
}
export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const { supabase } = auth;
  const id = String(req.body?.id || "");
  const query = String(req.body?.query || "TORND_TEST").trim().slice(0, 200);
  if (!id) return res.status(400).json({ error: "API integration id is required" });
  const { data: source, error } = await supabase.from("api_sources").select("id,name,endpoint_url,is_enabled").eq("id", id).maybeSingle();
  if (error) return res.status(500).json({ error: "Could not load API integration" });
  if (!source) return res.status(404).json({ error: "API integration not found" });
  let url;
  try { url = publicHttpsUrl(source.endpoint_url, query); }
  catch (e) { return res.status(400).json({ ok: false, message: e.message, status: 0 }); }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal, redirect: "error" });
    const body = await response.text();
    let data;
    try { data = JSON.parse(body); }
    catch { return res.status(200).json({ ok: false, status: response.status, message: `Endpoint returned non-JSON: ${body.slice(0, 160)}` }); }
    const ok = response.ok;
    await supabase.from("audit_logs").insert({ actor_id: auth.user.id, action: "api_source.tested", metadata: { id: source.id, status: response.status, ok } });
    return res.status(200).json({ ok, status: response.status, message: ok ? "HTTP response is successful JSON" : `Endpoint returned HTTP ${response.status}`, sample: data });
  } catch (e) {
    const message = e.name === "AbortError" ? "Timed out after 10 seconds" : String(e.message || "API request failed");
    return res.status(200).json({ ok: false, status: 0, message });
  } finally { clearTimeout(timeout); }
}
