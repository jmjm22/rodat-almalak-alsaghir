import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";

const app = express();

const allowList = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowList.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type"],
  })
);

const PORT = process.env.PORT || 5050;

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "registrations.json");
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
/* ================= CAPACITY ================= */

const MAX_PER_GROUP = {
  "6m-1y": 7,
  "1y-1.5y": 20,
  "1.5y-2y": 25,
  "2y-3y": 30,
};

const AGE_GROUPS = new Set(Object.keys(MAX_PER_GROUP));
const VALID_STAY = new Set(["14", "15", "16"]);
const VALID_STATUS = new Set(["new", "waiting", "approved", "rejected"]);

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

/* ================= DB ================= */

const readDb = () => JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
const writeDb = (items) => fs.writeFileSync(DB_FILE, JSON.stringify(items, null, 2));

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/* ================= CAPACITY LOGIC ================= */

function countOccupiedInGroup(db, ageGroup) {
  return db.filter(
    (x) => (x.ageGroup || "") === ageGroup && ["new", "approved"].includes(x.status || "new")
  ).length;
}

function getCapacity(db, ageGroup) {
  const max = MAX_PER_GROUP[ageGroup] ?? 0;
  const current = countOccupiedInGroup(db, ageGroup);

  return {
    max,
    current,
    hasPlace: current < max,
    remaining: Math.max(0, max - current),
  };
}

/* ⭐ AUTO PROMOTE WAITING */
function promoteWaitingIfPossible(db, ageGroup) {
  while (true) {
    const cap = getCapacity(db, ageGroup);
    if (!cap.hasPlace) break;

    let idx = -1;
    for (let i = db.length - 1; i >= 0; i--) {
      const x = db[i];
      if ((x.ageGroup || "") === ageGroup && (x.status || "new") === "waiting") {
        idx = i;
        break;
      }
    }

    if (idx === -1) break;

    db[idx] = {
      ...db[idx],
      status: "new",
      promotedAt: new Date().toISOString(),
    };
  }
}

/* ================= PHONE ================= */

function normalizeIL(phone) {
  if (!phone) return "";
  let p = phone.toString().trim().replace(/\s|-/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("05")) p = "+972" + p.slice(1);
  if (p.startsWith("5")) p = "+972" + p;
  return p;
}

function isValidILPhone(phone) {
  const p = normalizeIL(phone);
  return /^\+9725\d{8}$/.test(p);
}

/* ================= UPLOAD ================= */

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename: (_, file, cb) => {
    const name = `${Date.now()}-${Math.random().toString(16).slice(2)}${path.extname(
      file.originalname
    )}`;
    cb(null, name);
  },
});

const upload = multer({ storage });
app.use("/uploads", express.static(UPLOADS_DIR));

/* ================= REGISTER ================= */

app.post("/api/registrations", (req, res) => {
  try {
    const body = req.body || {};
    const allowWaiting = body.allowWaiting === true;
    const ageGroup = (body.ageGroup || "").trim();

    if (!AGE_GROUPS.has(ageGroup)) return res.status(400).json({ error: "Invalid ageGroup" });

    const db = readDb();

    const cap = getCapacity(db, ageGroup);
    const full = !cap.hasPlace;

    if (full && !allowWaiting) {
      return res.status(409).json({
        error: "full",
        message: "אין מקום בכיתה כרגע. תרצו להירשם לרשימת ההמתנה?",
        ageGroup,
        capacity: cap,
      });
    }

    const item = {
      id: makeId(),
      createdAt: new Date().toISOString(),
      ...body,
      motherPhone: normalizeIL(body.motherPhone),
      fatherPhone: normalizeIL(body.fatherPhone),
      status: full ? "waiting" : "new",
      receiptUrl: "",

      // ✅ server-side "sent once" flags
      approvedNotifiedAt: "",
      rejectedNotifiedAt: "",
    };

    db.unshift(item);
    writeDb(db);

    res.json({
      ok: true,
      item,
      message: full ? "נכנסתם לרשימת המתנה." : "ההרשמה נקלטה בהצלחה.",
    });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

/* ================= GET ================= */

app.get("/api/registrations", (_, res) => {
  res.json(readDb());
});

/* ================= UPDATE STATUS / FIELDS ================= */

app.patch("/api/registrations/:id", (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const db = readDb();
    const idx = db.findIndex((x) => x.id === id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });

    const current = db[idx];

    // allow updating status + ageGroup (you use it in "addFromWaiting")
    const nextStatus = body.status !== undefined ? String(body.status) : undefined;
    const nextAgeGroup = body.ageGroup !== undefined ? String(body.ageGroup).trim() : undefined;

    if (nextStatus !== undefined && !VALID_STATUS.has(nextStatus)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    if (nextAgeGroup !== undefined && nextAgeGroup && !AGE_GROUPS.has(nextAgeGroup)) {
      return res.status(400).json({ error: "Invalid ageGroup" });
    }

    // ✅ prevent double send (server-side lock)
    // once approvedNotifiedAt exists -> cannot set approved again
    if (nextStatus === "approved" && current.approvedNotifiedAt) {
      return res.status(409).json({
        error: "already_notified",
        message: "כבר נשלחה הודעת 'מאושר' עבור ההרשמה הזו.",
      });
    }
    if (nextStatus === "rejected" && current.rejectedNotifiedAt) {
      return res.status(409).json({
        error: "already_notified",
        message: "כבר נשלחה הודעת 'נדחה' עבור ההרשמה הזו.",
      });
    }

    const nowIso = new Date().toISOString();

    // build updated record
    const updated = {
      ...current,
      ...body,
    };

    // keep phone normalized if sent
    if (body.motherPhone !== undefined) updated.motherPhone = normalizeIL(body.motherPhone);
    if (body.fatherPhone !== undefined) updated.fatherPhone = normalizeIL(body.fatherPhone);

    // set one-time flags when moving to approved/rejected
    if (nextStatus === "approved" && !current.approvedNotifiedAt) {
      updated.approvedNotifiedAt = nowIso;
    }
    if (nextStatus === "rejected" && !current.rejectedNotifiedAt) {
      updated.rejectedNotifiedAt = nowIso;
    }

    db[idx] = updated;
    writeDb(db);

    // ⭐ אם התפנה מקום → מקדמים waiting (רק אם עברנו ל-rejected והיינו new/approved)
    if (
      nextStatus === "rejected" &&
      ["new", "approved"].includes(current.status || "new")
    ) {
      promoteWaitingIfPossible(db, current.ageGroup);
      writeDb(db);
    }

    res.json({ ok: true, item: db[idx] });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

/* ================= DELETE ================= */

app.delete("/api/registrations/:id", (req, res) => {
  const { id } = req.params;

  const db = readDb();
  const item = db.find((x) => x.id === id);
  if (!item) return res.status(404).json({ error: "Not found" });

  const after = db.filter((x) => x.id !== id);
  writeDb(after);

  promoteWaitingIfPossible(after, item.ageGroup);
  writeDb(after);

  res.json({ ok: true });
});

/* ================= CAPACITY ================= */

app.get("/api/capacity", (_, res) => {
  const db = readDb();
  const groups = {};

  for (const g of AGE_GROUPS) {
    groups[g] = getCapacity(db, g);
  }

  res.json({ ok: true, groups });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});