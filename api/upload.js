// POST /api/upload?kind=bilde|kvitt&name=file.jpg  (raw file body, max ~4 MB)
// Stores the file in Vercel Blob with a random, unguessable name and returns its URL.
import { send, putFile } from "./_lib.js";

export const config = { api: { bodyParser: false } };
const OK = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!OK[type]) return send(res, 415, { ok: false, error: "Bare bilder (JPG, PNG, HEIC) eller PDF" });
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 4_300_000) return send(res, 413, { ok: false, error: "Filen er for stor (maks 4 MB)" }); chunks.push(c); }
    const kind = req.query?.kind === "kvitt" ? "kvitt" : "bilde";
    const blob = await putFile(`filer/${kind}/${Date.now()}.${OK[type]}`, Buffer.concat(chunks), { access: "public", contentType: type, addRandomSuffix: true });
    return send(res, 200, { ok: true, url: blob.url });
  } catch (e) {
    console.error(e);
    return send(res, 500, { ok: false, error: "Opplasting feilet. Prøv igjen." });
  }
}
