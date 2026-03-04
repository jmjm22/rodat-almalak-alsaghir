import express from "express";
import cors from "cors";
import multer from "multer";
import mongoose from "mongoose";
import Registration from "./models/Registration.js";

const app = express();

/* =========================
   CORS
========================= */
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

app.use(express.json());

const PORT = process.env.PORT || 5050;

/* =========================
   Mongo
========================= */
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ Missing MONGODB_URI");
  process.exit(1);
}

/* =========================
   Constants
========================= */
const MAX_PER_GROUP = {
  "6m-1y": 7,
  "1y-1.5y": 20,
  "1.5y-2y": 25,
  "2y-3y": 30,
};

const AGE_GROUPS = new Set(Object.keys(MAX_PER_GROUP));
const VALID_STAY = new Set(["14", "15", "16"]);
const VALID_STATUS = new Set(["new", "waiting", "approved", "rejected"]);

/* =========================
   Helpers
========================= */
function normalizeIL(phone) {
  if (!phone) return "";
  let p = phone.toString().trim().replace(/\s|-/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("05")) p = "+972" + p.slice(1);
  if (p.startsWith("5")) p = "+972" + p;
  return p;
}

function normStr(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function toClient(x) {
  if (!x) return x;
  const obj = x.toObject ? x.toObject() : x;
  const id = String(obj._id || obj.id || "");

  const receiptMeta = obj.receipt
    ? {
        contentType: obj.receipt.contentType,
        filename: obj.receipt.filename,
        uploadedAt: obj.receipt.uploadedAt,
      }
    : null;

  const { _id, __v, receipt, ...rest } = obj;

  return {
    id,
    ...rest,
    receipt: receiptMeta,
    hasReceipt: !!obj.receipt?.data,
  };
}

async function countOccupiedInGroup(ageGroup) {
  return Registration.countDocuments({
    ageGroup,
    status: { $in: ["new", "approved"] },
  });
}

async function getCapacity(ageGroup) {
  const max = MAX_PER_GROUP[ageGroup] ?? 0;
  const current = await countOccupiedInGroup(ageGroup);
  return {
    max,
    current,
    hasPlace: current < max,
    remaining: Math.max(0, max - current),
  };
}

async function promoteWaitingIfPossible(ageGroup) {
  while (true) {
    const cap = await getCapacity(ageGroup);
    if (!cap.hasPlace) break;

    const waiting = await Registration.findOne({ ageGroup, status: "waiting" }).sort({
      createdAt: 1,
    });
    if (!waiting) break;

    waiting.status = "new";
    waiting.promotedAt = new Date().toISOString();
    await waiting.save();
  }
}

async function isDuplicate(body) {
  const child = normStr(body.childFullName);
  const birthDate = (body.birthDate || "").toString().trim();
  const childId = (body.childId || "").toString().trim();

  const motherPhone = normalizeIL(body.motherPhone);
  const fatherPhone = normalizeIL(body.fatherPhone);

  if (!child || !birthDate || !childId) return false;

  const candidates = await Registration.find({ childId, birthDate }).lean();

  return candidates.some((x) => {
    const sameChild = normStr(x.childFullName) === child;
    const sameBirth = (x.birthDate || "").toString().trim() === birthDate;
    const sameChildId = (x.childId || "").toString().trim() === childId;

    const sameMother = normalizeIL(x.motherPhone) && normalizeIL(x.motherPhone) === motherPhone;
    const sameFather = normalizeIL(x.fatherPhone) && normalizeIL(x.fatherPhone) === fatherPhone;

    return sameChild && sameBirth && sameChildId && (sameMother || sameFather);
  });
}

/* =========================
   Multer (Memory)
========================= */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

/* =========================
   Routes
========================= */

app.post("/api/registrations", async (req, res) => {
  try {
    const body = req.body || {};
    const allowWaiting = body.allowWaiting === true;
    const ageGroup = (body.ageGroup || "").trim();

    if (!AGE_GROUPS.has(ageGroup)) {
      return res.status(400).json({ error: "Invalid ageGroup" });
    }

    if (!String(body.childId || "").trim()) {
      return res.status(400).json({ error: "Missing childId", message: "חסר ת.ז ילד" });
    }

    if (body.stayUntil && !VALID_STAY.has(String(body.stayUntil))) {
      return res.status(400).json({ error: "Invalid stayUntil" });
    }

    if (await isDuplicate(body)) {
      return res
        .status(409)
        .json({ error: "duplicate", message: "❌ כבר קיימת הרשמה עבור הילד/ה עם הפרטים הללו." });
    }

    const cap = await getCapacity(ageGroup);
    const full = !cap.hasPlace;

    if (full && !allowWaiting) {
      return res.status(409).json({
        error: "full",
        message: "אין מקום בכיתה כרגע. תרצו להירשם לרשימת ההמתנה?",
        ageGroup,
        capacity: cap,
      });
    }

    const item = await Registration.create({
      ...body,
      ageGroup,
      childId: String(body.childId || "").trim(),
      motherPhone: normalizeIL(body.motherPhone),
      fatherPhone: normalizeIL(body.fatherPhone),
      status: full ? "waiting" : "new",
      approvedNotifiedAt: "",
      rejectedNotifiedAt: "",
      promotedAt: "",
      receipt: null,
    });

    return res.json({
      ok: true,
      item: toClient(item),
      message: full ? "נכנסתם לרשימת המתנה." : "ההרשמה נקלטה בהצלחה.",
    });
  } catch (e) {
    console.error("❌ create registration error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/registrations", async (_, res) => {
  try {
    const items = await Registration.find({}).sort({ createdAt: -1 });
    return res.json(items.map(toClient));
  } catch (e) {
    console.error("❌ list registrations error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/registrations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "bad_id", message: "id לא תקין" });
    }

    const item = await Registration.findById(id);
    if (!item) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, item: toClient(item) });
  } catch (e) {
    console.error("❌ get registration error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ✅ Upload receipt -> MongoDB (image/pdf) */
app.post("/api/registrations/:id/receipt", upload.single("receipt"), async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "bad_id", message: "id לא תקין" });
    }

    if (!req.file) return res.status(400).json({ error: "No file", message: "לא נבחר קובץ" });

    const mt = req.file.mimetype || "";
    const isImage = mt.startsWith("image/");
    const isPdf = mt === "application/pdf";

    if (!isImage && !isPdf) {
      return res.status(400).json({ error: "bad_type", message: "יש להעלות תמונה או PDF בלבד" });
    }

    const item = await Registration.findById(id);
    if (!item) return res.status(404).json({ error: "Not found" });

    item.receipt = {
      data: req.file.buffer,
      contentType: mt,
      filename: req.file.originalname,
      uploadedAt: new Date().toISOString(),
    };

    await item.save();
    return res.json({ ok: true, item: toClient(item) });
  } catch (e) {
    console.error("❌ receipt upload error:", e);
    const msg = e?.message || "";
    if (msg.includes("File too large")) {
      return res.status(413).json({
        error: "file_too_large",
        message: "הקובץ גדול מדי (מקסימום 5MB)",
      });
    }
    return res.status(500).json({ error: "Server error" });
  }
});

/* ✅ View receipt (image/pdf) */
app.get("/api/registrations/:id/receipt", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send("Invalid id");
    }

    const item = await Registration.findById(id).select("receipt");
    if (!item?.receipt?.data) return res.status(404).send("No receipt");

    const buf = item.receipt.data;
    const type = item.receipt.contentType || "application/octet-stream";

    res.setHeader("Content-Type", type);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", buf.length);

    return res.send(buf);
  } catch (e) {
    console.error("❌ receipt view error:", e);
    return res.status(500).send("Server error");
  }
});

app.patch("/api/registrations/:id", async (req, res) => {
  try {
    const body = req.body || {};
    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "bad_id", message: "id לא תקין" });
    }

    const current = await Registration.findById(id);
    if (!current) return res.status(404).json({ error: "Not found" });

    const nextStatus = body.status !== undefined ? String(body.status) : undefined;
    const nextAgeGroup = body.ageGroup !== undefined ? String(body.ageGroup).trim() : undefined;

    if (nextStatus !== undefined && !VALID_STATUS.has(nextStatus)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    if (nextAgeGroup !== undefined && nextAgeGroup && !AGE_GROUPS.has(nextAgeGroup)) {
      return res.status(400).json({ error: "Invalid ageGroup" });
    }

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

    const prevStatus = current.status || "new";
    const prevAgeGroup = current.ageGroup;

    Object.assign(current, body);

    if (body.motherPhone !== undefined) current.motherPhone = normalizeIL(body.motherPhone);
    if (body.fatherPhone !== undefined) current.fatherPhone = normalizeIL(body.fatherPhone);

    const nowIso = new Date().toISOString();
    if (nextStatus === "approved" && !current.approvedNotifiedAt) current.approvedNotifiedAt = nowIso;
    if (nextStatus === "rejected" && !current.rejectedNotifiedAt) current.rejectedNotifiedAt = nowIso;

    await current.save();

    if (nextStatus === "rejected" && ["new", "approved"].includes(prevStatus)) {
      await promoteWaitingIfPossible(prevAgeGroup);
    }

    return res.json({ ok: true, item: toClient(current) });
  } catch (e) {
    console.error("❌ patch registration error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/registrations/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "bad_id", message: "id לא תקין" });
    }

    const item = await Registration.findById(id);
    if (!item) return res.status(404).json({ error: "Not found" });

    const ageGroup = item.ageGroup;
    const prevStatus = item.status || "new";

    await item.deleteOne();

    if (["new", "approved"].includes(prevStatus)) {
      await promoteWaitingIfPossible(ageGroup);
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("❌ delete registration error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/capacity", async (_, res) => {
  try {
    const groups = {};
    for (const g of AGE_GROUPS) {
      groups[g] = await getCapacity(g);
    }
    return res.json({ ok: true, groups });
  } catch (e) {
    console.error("❌ capacity error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   Start server AFTER Mongo
========================= */
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("❌ MongoDB connection error:", e?.message || e);
    process.exit(1);
  });