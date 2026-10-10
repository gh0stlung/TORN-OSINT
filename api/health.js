export default function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    status: "ok",
    service: "TORN_D",
    version: "3.0.0",
    timestamp: new Date().toISOString()
  });
}
