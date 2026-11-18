// Shared helpers for the Rødtvetveien 73B API.
// Every record is its own JSON blob (append-only), so concurrent writers never overwrite each other.
import * as realBlob from "@vercel/blob";
import crypto from "node:crypto";

// Local tests swap in an in-memory store; production always uses Vercel Blob.
const blob = () => globalThis.__BLOB_MOCK__ || realBlob;
export const putFile = (...a) => blob().put(...a);

export const TYPES = ["plan", "nokkel", "dok", "materiale"]; // visible to everyone with the link
export const PRIVATE_TYPES = ["kvitt"]; // receipts: only with the admin password

// Salted PBKDF2 hash of the admin password (same password as the Admin view). Not the password itself.
const ADMIN_SALT = "758a98413fa448c894ef603e994303bc";
const ADMIN_HASH = "bf8ed3d91befb93ed52f4d3a18730c6a99f9bc034830724061e3201caddbca67";

export function isAdmin(req) {
  const pw = String(req.headers["x-admin"] || "");
  if (!pw || pw.length > 200) return false;
  const h = crypto.pbkdf2Sync(pw, Buffer.from(ADMIN_SALT, "hex"), 200000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(ADMIN_HASH, "hex"));
}

const clean = (v, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const okUrl = (u) => typeof u === "string" && (/^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i.test(u) || (!!globalThis.__BLOB_BASE__ && u.startsWith(globalThis.__BLOB_BASE__)));
const cleanUrls = (a) => (Array.isArray(a) ? a.filter(okUrl).slice(0, 12) : []);

// Whitelisted fields per type, so nothing else can be stored.
export function sanitize(type, b) {
  const base = { navn: clean(b.navn, 80), fag: clean(b.fag, 60) };
  switch (type) {
    case "plan": return { ...base, dato: clean(b.dato, 10), fra: clean(b.fra, 5), til: clean(b.til, 5), hva: clean(b.hva, 400) };
    case "nokkel": return { ...base, hos: clean(b.hos, 80), kommentar: clean(b.kommentar, 400) };
    case "dok": return { ...base, oppgave: clean(b.oppgave, 200), oppgaveId: clean(b.oppgaveId, 80), ferdig: !!b.ferdig, tekst: clean(b.tekst, 1500), bilder: cleanUrls(b.bilder) };
    case "materiale": return { ...base, hva: clean(b.hva, 120), valg: clean(b.valg, 300), lenke: /^https?:\/\//.test(clean(b.lenke, 500)) ? clean(b.lenke, 500) : "", status: clean(b.status, 30), kommentar: clean(b.kommentar, 400), bilder: cleanUrls(b.bilder) };
    case "kvitt": return { ...base, hva: clean(b.hva, 200), belop: clean(b.belop, 20), dato: clean(b.dato, 10), filer: cleanUrls(b.filer) };
    default: return null;
  }
}

export async function addRecord(type, data) {
  const ts = new Date().toISOString();
  const id = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const rec = { id, type, ts, ...data };
  await blob().put(`rec/${type}/${id}.json`, JSON.stringify(rec), { access: "public", contentType: "application/json", addRandomSuffix: true });
  return rec;
}

export async function listRecords(types) {
  const out = {};
  await Promise.all(types.map(async (type) => {
    const blobs = [];
    let cursor;
    do {
      const r = await blob().list({ prefix: `rec/${type}/`, cursor, limit: 1000 });
      blobs.push(...r.blobs);
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    const recs = await Promise.all(blobs.map(async (b) => {
      try { const r = await (globalThis.__FETCH_MOCK__ || fetch)(b.url); if (!r.ok) return null; const j = await r.json(); j._url = b.url; return j; } catch { return null; }
    }));
    out[type] = recs.filter(Boolean).sort((a, b) => (a.ts < b.ts ? 1 : -1));
  }));
  return out;
}

export async function deleteRecord(type, id) {
  const r = await blob().list({ prefix: `rec/${type}/${id}` });
  if (r.blobs.length) await blob().del(r.blobs.map((b) => b.url));
  return r.blobs.length;
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}
