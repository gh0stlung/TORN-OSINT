import { requireAdmin } from "../_lib/auth.js";
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  return res.status(200).json({ status: "ok", service: "TORN_D", role: "admin", user: auth.user.email ?? null });
}
