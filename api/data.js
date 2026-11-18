// GET  /api/data            -> plan, nokkel, dok, materiale (+ kvitt with x-admin header)
// POST /api/data {type,...} -> adds a record (anyone with the link). Receipts are write-only for non-admins.
// POST /api/data {action:"delete", type, id} -> admin only.
import { TYPES, PRIVATE_TYPES, isAdmin, sanitize, addRecord, listRecords, deleteRecord, readJson, send } from "./_lib.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const admin = isAdmin(req);
      const data = await listRecords(admin ? [...TYPES, ...PRIVATE_TYPES] : TYPES);
      return send(res, 200, { ok: true, admin, data });
    }
    if (req.method === "POST") {
      const b = await readJson(req);
      if (b.action === "delete") {
        if (!isAdmin(req)) return send(res, 403, { ok: false, error: "Kun for Rahil og Emir" });
        if (![...TYPES, ...PRIVATE_TYPES].includes(b.type) || typeof b.id !== "string" || !/^[\w-]{5,60}$/.test(b.id)) return send(res, 400, { ok: false, error: "Ugyldig" });
        const n = await deleteRecord(b.type, b.id);
        return send(res, 200, { ok: true, deleted: n });
      }
      const type = String(b.type || "");
      if (![...TYPES, ...PRIVATE_TYPES].includes(type)) return send(res, 400, { ok: false, error: "Ukjent type" });
      const data = sanitize(type, b);
      if (!data.navn) return send(res, 400, { ok: false, error: "Skriv navnet ditt" });
      const rec = await addRecord(type, data);
      return send(res, 200, { ok: true, record: PRIVATE_TYPES.includes(type) ? { id: rec.id } : rec });
    }
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return send(res, 500, { ok: false, error: "Noe gikk galt. Prøv igjen." });
  }
}
