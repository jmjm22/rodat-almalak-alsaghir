import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import "./Admin.css"
const API_BASE = import.meta.env.VITE_API_BASE || "https://rodat-almalak-alsaghir.onrender.com";
const AGE_LABELS = {
  "6m-1y": "6 أشهر - سنة",
  "1y-1.5y": "سنة - سنة ونص",
  "1.5y-2y": "سنة ونص - سنتين",
  "2y-3y": "سنتين - ثلاث",
};

const AGE_ORDER = ["6m-1y", "1y-1.5y", "1.5y-2y", "2y-3y"];

const STATUS_LABEL = {
  new: "חדש",
  waiting: "ממתין",
  approved: "מאושר",
  rejected: "נדחה",
};

/* =================== Helpers =================== */

// Phone normalize for wa.me
function normalizeIL(phone) {
  if (!phone) return "";
  let p = phone.toString().trim().replace(/\s|-/g, "");
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("05")) p = "+972" + p.slice(1);
  if (p.startsWith("5")) p = "+972" + p;
  return p;
}

// Display 05.. instead of +972..
function displayILPhone(phone) {
  if (!phone) return "";
  let p = phone.toString().trim().replace(/\s|-/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);

  if (p.startsWith("+972")) return "0" + p.slice(4);
  if (p.startsWith("972")) return "0" + p.slice(3);
  if (p.startsWith("5") && p.length === 9) return "0" + p;

  return p;
}

function waLink(phone, message) {
  const norm = normalizeIL(phone);
  if (!norm) return "";
  const p = norm.replace("+", "");
  return `https://wa.me/${p}?text=${encodeURIComponent(message)}`;
}

function formatBirthDateIL(value) {
  if (!value) return "";
  const s = String(value).trim();

  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(s)) {
    return s.replace(/\./g, "/").replace(/-/g, "/");
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }

  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yy = String(dt.getFullYear());
    return `${dd}/${mm}/${yy}`;
  }

  return s;
}

function formatCreatedAtIL(value) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString("he-IL");
}

function groupBadgeClass(g) {
  if (g === "6m-1y") return "g-6m";
  if (g === "1y-1.5y") return "g-1y";
  if (g === "1.5y-2y") return "g-15y";
  if (g === "2y-3y") return "g-2y";
  return "g-other";
}

function downloadXLSX(filename, items) {
  const rows = items.map((x) => ({
    "תאריך הרשמה": x.createdAt ? formatCreatedAtIL(x.createdAt) : "",
    סטטוס: STATUS_LABEL[x.status || "new"] || (x.status || "new"),
    "שם הילד": x.childFullName || "",
    "תאריך לידה": formatBirthDateIL(x.birthDate || ""),
    "כיתה": AGE_LABELS[x.ageGroup] || x.ageGroup || "",
    "שם האם": x.motherName || "",
    "טלפון אם": displayILPhone(x.motherPhone || ""),
    "שם האב": x.fatherName || "",
    "טלפון אב": displayILPhone(x.fatherPhone || ""),
    "שעת יציאה": x.stayUntil ? `${x.stayUntil}:00` : "",
    כתובת: x.address || "",
    "יש אלרגיה": x.hasAllergy || "",
    "פירוט אלרגיה": x.allergyDetails || "",
    "יש מחלה": x.hasDisease || "",
    "פירוט מחלה": x.diseaseDetails || "",
    הערות: x.notes || "",
    קבלה: x.receiptUrl ? `${API_BASE}${x.receiptUrl}` : "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!rightToLeft"] = true;
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  const ref = ws["!ref"] || "A1:A1";
  const range = XLSX.utils.decode_range(ref);
  ws["!autofilter"] = { ref: XLSX.utils.encode_range(range) };

  const keys = Object.keys(rows[0] || { "תאריך הרשמה": "" });
  ws["!cols"] = keys.map((k) => {
    const maxLen = Math.max(k.length, ...rows.map((r) => (r[k] ? String(r[k]).length : 0)));
    return { wch: Math.min(45, Math.max(12, maxLen + 2)) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Registrations");
  XLSX.writeFile(wb, filename);
}

/* =================== Table =================== */

function AdminTable({ items, onRefresh, capMap, hideWaiting = false, waitingActions = false }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [stayFilter, setStayFilter] = useState("all");
  const [sortBy, setSortBy] = useState("dateDesc");
  const [q, setQ] = useState("");
  const [details, setDetails] = useState(null);

  const showReceipt = !waitingActions;

  const stats = useMemo(() => {
    const c = { new: 0, waiting: 0, approved: 0, rejected: 0 };
    for (const x of items) {
      const st = x.status || "new";
      c[st] = (c[st] || 0) + 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    const base = items.filter((x) => {
      const st = x.status || "new";

      if (hideWaiting && st === "waiting") return false;
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (stayFilter !== "all" && String(x.stayUntil || "") !== stayFilter) return false;

      if (!qq) return true;

      const blob = [
        x.childFullName,
        x.motherName,
        displayILPhone(x.motherPhone),
        x.fatherName,
        displayILPhone(x.fatherPhone),
        x.address,
        String(x.stayUntil || ""),
        AGE_LABELS[x.ageGroup] || x.ageGroup || "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return blob.includes(qq);
    });

    const rank = (s) => ({ waiting: 0, new: 1, approved: 2, rejected: 3 }[s || "new"] ?? 9);

    return [...base].sort((a, b) => {
      if (sortBy === "dateAsc") return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === "dateDesc") return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortBy === "stay") return Number(a.stayUntil || 99) - Number(b.stayUntil || 99);
      return rank(a.status) - rank(b.status);
    });
  }, [items, statusFilter, stayFilter, sortBy, q, hideWaiting]);

  const setStatusAndNotify = async (x, status) => {
    try {
      const res = await fetch(`${API_BASE}/api/registrations/${x.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data?.message || data?.error || "שגיאה בעדכון סטטוס");
        return;
      }

      const name = x.childFullName || "";
      const phone = x.motherPhone || "";

     const msgApproved =
  `🌸 روضة الملاك الصغير\n\n` +
  `تم قبول تسجيل الطفل/ة ${name} بنجاح ✅\n` +
  `سنقوم بالتواصل معكم قريبًا.\n\n` +
  `شكراً لثقتكم بنا 💛`;

const msgRejected =
  `🌸 روضة الملاك الصغير\n\n` +
  `نأسف، لم يتم قبول تسجيل الطفل/ة ${name} حالياً.\n` +
  `يمكنكم التواصل معنا لمزيد من التفاصيل.\n\n` +
  `مع خالص التقدير 🌷`;
      const link = status === "approved" ? waLink(phone, msgApproved) : status === "rejected" ? waLink(phone, msgRejected) : "";

      if (link) window.open(link, "_blank");

      onRefresh();
    } catch {
      alert("בעיה בחיבור לשרת");
    }
  };

  const del = async (id) => {
    if (!window.confirm("בטוחה למחוק?")) return;
    await fetch(`${API_BASE}/api/registrations/${id}`, { method: "DELETE" });
    onRefresh();
  };

  const sendPlaceMsgToWaiting = (x) => {
   const msg =
  `🌸 روضة الملاك الصغير\n\n` +
  `أصبح هناك مكان متاح الآن في الصف.\n` +
  `هل ما زلتم ترغبون بتسجيل الطفل/ة ${x.childFullName || ""} ؟\n\n` +
  `الرجاء الرد نعم أو لا.`;

    const link = waLink(x.motherPhone, msg);
    if (link) window.open(link, "_blank");
  };

  const addFromWaiting = async (x) => {
    try {
      const res = await fetch(`${API_BASE}/api/registrations/${x.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "new" }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.message || data?.error || "שגיאה בהוספה מרשימת המתנה");
        return;
      }

      onRefresh();
    } catch {
      alert("בעיה בחיבור לשרת");
    }
  };

  if (!items.length) return <div className="adminEmpty">אין נרשמים בקבוצה הזו.</div>;

  const statusOptions = hideWaiting
    ? [
        { v: "all", t: "סטטוס: הכל" },
        { v: "new", t: `חדש (${stats.new || 0})` },
        { v: "approved", t: `מאושר (${stats.approved || 0})` },
        { v: "rejected", t: `נדחה (${stats.rejected || 0})` },
      ]
    : [
        { v: "all", t: "סטטוס: הכל" },
        { v: "new", t: `חדש (${stats.new || 0})` },
        { v: "waiting", t: `ממתין (${stats.waiting || 0})` },
        { v: "approved", t: `מאושר (${stats.approved || 0})` },
        { v: "rejected", t: `נדחה (${stats.rejected || 0})` },
      ];

  return (
    <div className="adminTableWrap">
      <div className="adminTableTools">
        <div className="toolRow">
          <input className="adminSearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש: שם/טלפון/כתובת..." />

          <select className="adminSelect" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {statusOptions.map((o) => (
              <option key={o.v} value={o.v}>
                {o.t}
              </option>
            ))}
          </select>

          <select className="adminSelect" value={stayFilter} onChange={(e) => setStayFilter(e.target.value)}>
            <option value="all">שעה: כל השעות</option>
            <option value="14">עד 14:00</option>
            <option value="15">עד 15:00</option>
            <option value="16">עד 16:00</option>
          </select>

          <select className="adminSelect" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="dateDesc">מיון: חדש → ישן</option>
            <option value="dateAsc">מיון: ישן → חדש</option>
            <option value="status">מיון: סטטוס (ממתין ראשון)</option>
            <option value="stay">מיון: שעה (14 לפני 16)</option>
          </select>

          <button
            className="adminBtn small"
            type="button"
            onClick={() => downloadXLSX(`registrations-${new Date().toISOString().slice(0, 10)}.xlsx`, filtered)}
          >
            הורדה (Excel)
          </button>
        </div>
      </div>

      <table className="adminTable">
        <thead>
          <tr>
            <th>תאריך</th>
            <th>סטטוס</th>
            <th>שם הילד</th>
            <th>ת.לידה</th>

            {waitingActions ? <th>כיתה</th> : null}

            <th>אמא</th>
            <th>טל׳ אמא</th>
            <th>אבא</th>
            <th>טל׳ אבא</th>
            <th>עד שעה</th>
            {showReceipt ? <th>קבלה</th> : null}
            <th>פעולות</th>
          </tr>
        </thead>

        <tbody>
          {filtered.map((x) => {
            const st = x.status || "new";
            const isNew = st === "new";
            const isWaiting = st === "waiting";

            const rowCap = capMap && x.ageGroup ? capMap[x.ageGroup] : null;
            const hasPlace = rowCap ? !!rowCap.hasPlace : true;

            return (
              <tr key={x.id} className={isNew ? "rowNew" : isWaiting ? "rowWaiting" : ""}>
                <td>{x.createdAt ? formatCreatedAtIL(x.createdAt) : "-"}</td>

                <td>
                  <span className={`statusPill s-${st}`}>{STATUS_LABEL[st] || st}</span>
                </td>

                <td>{x.childFullName || "-"}</td>
                <td className="cellDate">{formatBirthDateIL(x.birthDate) || "-"}</td>

                {waitingActions ? (
                  <td>
                    <span className={`groupPill ${groupBadgeClass(x.ageGroup)}`}>
                      {AGE_LABELS[x.ageGroup] || x.ageGroup || "-"}
                    </span>
                  </td>
                ) : null}

                <td>{x.motherName || "-"}</td>
                <td className="cellPhone">{displayILPhone(x.motherPhone) || "-"}</td>
                <td>{x.fatherName || "-"}</td>
                <td className="cellPhone">{displayILPhone(x.fatherPhone) || "-"}</td>

                <td>{x.stayUntil ? <span className={`stayPill stay-${x.stayUntil}`}>{x.stayUntil}:00</span> : "-"}</td>

                {showReceipt ? (
                  <td>
                    {x.receiptUrl ? (
                      <a className="receiptLink" href={`${API_BASE}${x.receiptUrl}`} target="_blank" rel="noreferrer">
                        פתח
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                ) : null}

                <td className="actionsCell">
                  <button className="miniBtn" type="button" onClick={() => setDetails(x)}>
                    פרטים
                  </button>

                  {waitingActions && isWaiting ? (
                    <>
                      <button
                        className="miniBtn ok"
                        type="button"
                        disabled={!hasPlace}
                        title={hasPlace ? "שליחת הודעה לאמא" : "אין מקום בקבוצה כרגע"}
                        onClick={() => sendPlaceMsgToWaiting(x)}
                      >
                        🟢 התפנה מקום
                      </button>

                      <button
                        className="miniBtn"
                        type="button"
                        title="וואטסאפ לאמא"
                        onClick={() =>
                          window.open(
                            waLink(
                              x.motherPhone,
                              `🌸 روضة الملاك الصغير\n\nأصبح هناك مكان متاح الآن.\nهل ما زلتم ترغبون بتسجيل الطفل ${x.childFullName || ""} ؟`
                            ),
                            "_blank"
                          )
                        }
                      >
                        💬 וואטסאפ
                      </button>

                      <button className="miniBtn ok" type="button" title="הוספה מהמתנה" onClick={() => addFromWaiting(x)}>
                        ➕ הוספה
                      </button>
                    </>
                  ) : null}

                  {!isWaiting ? (
                    <>
                      <button className="miniBtn ok" type="button" onClick={() => setStatusAndNotify(x, "approved")}>
                        מאושר
                      </button>

                      <button
                        className="miniBtn warn"
                        type="button"
                        onClick={() => {
                          if (!window.confirm("בטוחה לדחות את ההרשמה?")) return;
                          setStatusAndNotify(x, "rejected");
                        }}
                      >
                        נדחה
                      </button>
                    </>
                  ) : null}

                  <button className="miniBtn danger" type="button" onClick={() => del(x.id)}>
                    מחיקה
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {!filtered.length ? <div className="adminEmpty">אין תוצאות לפי הסינון.</div> : null}

      {details ? (
        <div className="modalOverlay" onClick={() => setDetails(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div className="modalTitle">
                <h3>פרטי הרשמה</h3>
                <small>{details.createdAt ? formatCreatedAtIL(details.createdAt) : ""}</small>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={`statusPill s-${details.status || "new"}`}>
                  {STATUS_LABEL[details.status || "new"] || (details.status || "new")}
                </span>

                <button className="modalClose" type="button" onClick={() => setDetails(null)}>
                  ✕
                </button>
              </div>
            </div>

            <div className="modalBody">
              <div className="chipsRow">
                <span className={`chip ${groupBadgeClass(details.ageGroup)}`}>
                  {AGE_LABELS[details.ageGroup] || details.ageGroup || "-"}
                </span>
                <span className="chip pink">עד שעה: {details.stayUntil ? `${details.stayUntil}:00` : "-"}</span>
                <span className="chip green">טל׳ אמא: {displayILPhone(details.motherPhone) || "-"}</span>
              </div>

              <div className="modalGrid">
                <div className="fieldCard">
                  <div className="fieldLabel">שם הילד</div>
                  <div className="fieldValue">{details.childFullName || "-"}</div>
                </div>

                <div className="fieldCard">
                  <div className="fieldLabel">תאריך לידה</div>
                  <div className="fieldValue">{formatBirthDateIL(details.birthDate) || "-"}</div>
                </div>

                <div className="fieldCard">
                  <div className="fieldLabel">אמא</div>
                  <div className="fieldValue">
                    {details.motherName || "-"}{" "}
                    <span className="muted">({displayILPhone(details.motherPhone) || "-"})</span>
                  </div>
                </div>

                <div className="fieldCard">
                  <div className="fieldLabel">אבא</div>
                  <div className="fieldValue">
                    {details.fatherName || "-"}{" "}
                    <span className="muted">({displayILPhone(details.fatherPhone) || "-"})</span>
                  </div>
                </div>

                <div className="fieldCard wide">
                  <div className="fieldLabel">כתובת</div>
                  <div className="fieldValue">{details.address || "-"}</div>
                </div>

                <div className="fieldCard">
                  <div className="fieldLabel">אלרגיה</div>
                  <div className="fieldValue">
                    {String(details.hasAllergy || "").toLowerCase() === "yes" ? (
                      <span className="valuePill ok">כן</span>
                    ) : (
                      <span className="valuePill no">לא</span>
                    )}{" "}
                    {details.allergyDetails ? `— ${details.allergyDetails}` : ""}
                  </div>
                </div>

                <div className="fieldCard">
                  <div className="fieldLabel">מחלה</div>
                  <div className="fieldValue">
                    {String(details.hasDisease || "").toLowerCase() === "yes" ? (
                      <span className="valuePill warn">כן</span>
                    ) : (
                      <span className="valuePill no">לא</span>
                    )}{" "}
                    {details.diseaseDetails ? `— ${details.diseaseDetails}` : ""}
                  </div>
                </div>

                <div className="fieldCard wide">
                  <div className="fieldLabel">הערות</div>
                  <div className="fieldValue">{details.notes || "-"}</div>
                </div>

                {details.receiptUrl ? (
                  <div className="fieldCard wide">
                    <div className="fieldLabel">קבלה</div>
                    <div className="fieldValue">
                      <a className="receiptLink" href={`${API_BASE}${details.receiptUrl}`} target="_blank" rel="noreferrer">
                        פתח קבלה
                      </a>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="modalActions">
              <button
                className="modalBtn"
                type="button"
                onClick={() => navigator.clipboard.writeText(displayILPhone(details.motherPhone || ""))}
              >
                העתק טל׳ אמא
              </button>

              <button
                className="modalBtn"
                type="button"
                onClick={() => window.open(waLink(details.motherPhone, `שלום, לגבי ההרשמה של ${details.childFullName || ""}`), "_blank")}
              >
                וואטסאפ לאמא
              </button>

              <button className="modalBtn primary" type="button" onClick={() => setDetails(null)}>
                סגור
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* =================== Group Card =================== */

function GroupCard({ title, items, onRefresh, isOpen, onToggle, capMap }) {
  const occupied = items.filter((x) => ["new", "approved"].includes(x.status || "new")).length;
  const rejected = items.filter((x) => (x.status || "new") === "rejected").length;
  const hasNew = items.some((x) => (x.status || "new") === "new");

  return (
    <div className={`groupCard ${isOpen ? "open" : "closed"}`}>
      <button className="groupHead" type="button" onClick={onToggle} aria-expanded={isOpen}>
        <div className="groupHeadRight">
          <div className="groupTitle">
            {title}
            {hasNew ? <span className="newDot" title="יש נרשמים חדשים" /> : null}
          </div>

          <div className="groupCount">{items.length}</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="sumPill">תפוס: {occupied}</span>
            <span className="sumPill">נדחה: {rejected}</span>
          </div>
        </div>

        <div className="groupHeadLeft">
          <button
            type="button"
            className="adminBtn small"
            onClick={(e) => {
              e.stopPropagation();
              downloadXLSX(`registrations-${title}-${new Date().toISOString().slice(0, 10)}.xlsx`, items);
            }}
          >
            הורדה (Excel)
          </button>

          <span className={`groupChev ${isOpen ? "up" : "down"}`}>⌄</span>
        </div>
      </button>

      <div className="groupBody">
        <AdminTable items={items} onRefresh={onRefresh} capMap={capMap} hideWaiting={true} waitingActions={false} />
      </div>
    </div>
  );
}

/* =================== Main Admin =================== */

export default function Admin() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [cap, setCap] = useState(null);
  const [topTable, setTopTable] = useState(null);

  const [openGroups, setOpenGroups] = useState({
    "6m-1y": false,
    "1y-1.5y": false,
    "1.5y-2y": false,
    "2y-3y": false,
    other: false,
  });

  const toggleGroup = (key) => {
    setOpenGroups((prev) => {
      const nextOpen = !prev[key];
      return {
        "6m-1y": false,
        "1y-1.5y": false,
        "1.5y-2y": false,
        "2y-3y": false,
        other: false,
        [key]: nextOpen,
      };
    });
  };

  const load = async () => {
    setErr("");
    try {
      const [r1, r2] = await Promise.all([fetch(`${API_BASE}/api/registrations`), fetch(`${API_BASE}/api/capacity`)]);
      if (!r1.ok) throw new Error("bad");

      const data = await r1.json();
      setItems(Array.isArray(data) ? data : []);

      if (r2.ok) {
        const capData = await r2.json();
        setCap(capData?.groups || null);
      } else {
        setCap(null);
      }
    } catch {
      setErr("❌ השרת לא עובד או שיש בעיה בשליפה");
      setItems([]);
      setCap(null);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const map = { "6m-1y": [], "1y-1.5y": [], "1.5y-2y": [], "2y-3y": [], other: [] };
    for (const x of items) {
      const g = x.ageGroup;
      if (map[g]) map[g].push(x);
      else map.other.push(x);
    }
    return map;
  }, [items]);

  const downloadAll = () => {
    downloadXLSX(`registrations-${new Date().toISOString().slice(0, 10)}.xlsx`, items);
  };

  const newTotal = items.filter((x) => (x.status || "new") === "new").length;
  const waitingTotal = items.filter((x) => (x.status || "new") === "waiting").length;
  const approvedTotal = items.filter((x) => (x.status || "new") === "approved").length;
  const rejectedTotal = items.filter((x) => (x.status || "new") === "rejected").length;

  const topItems = useMemo(() => {
    if (!topTable) return [];
    if (topTable === "all") return items;
    return items.filter((x) => (x.status || "new") === topTable);
  }, [items, topTable]);

  const toggleTop = (key) => setTopTable((prev) => (prev === key ? null : key));

  return (
    <div className="adminPage" dir="rtl">
      <div className="adminTopBar">
        <div className="adminTopLine">
          <h2 className="adminH2">لوحة الإدارة — التسجيلات</h2>

          <div className="adminPills">
            <button type="button" className="pill pillBtn" onClick={() => toggleTop("all")}>
              סה״כ: {items.length}
            </button>
            <button type="button" className="pill green pillBtn" onClick={() => toggleTop("new")}>
              חדש: {newTotal}
            </button>
            <button type="button" className="pill yellow pillBtn" onClick={() => toggleTop("waiting")}>
              ממתין: {waitingTotal}
            </button>
            <button type="button" className="pill blue pillBtn" onClick={() => toggleTop("approved")}>
              מאושר: {approvedTotal}
            </button>
            <button type="button" className="pill red pillBtn" onClick={() => toggleTop("rejected")}>
              נדחה: {rejectedTotal}
            </button>
          </div>
        </div>

        <div className="adminControls">
          <button className="adminBtn dark" type="button" onClick={downloadAll}>
            הורדה (Excel)
          </button>
          <button className="adminBtn" type="button" onClick={load}>
            רענון
          </button>
        </div>

        {err ? <div className="adminErr">{err}</div> : null}

        {topTable ? (
          <div className="topTableBox">
            <div className="topTableHead">
              <div className="topTableTitle">
                {topTable === "all"
                  ? "📌 כל הנרשמים"
                  : topTable === "new"
                  ? "📌 נרשמים חדשים"
                  : topTable === "waiting"
                  ? "📌 רשימת המתנה"
                  : topTable === "approved"
                  ? "📌 מאושרים"
                  : "📌 נדחים"}
                <span className="topTableCount">({topItems.length})</span>
              </div>

              <button className="adminBtn small" type="button" onClick={() => setTopTable(null)}>
                סגור
              </button>
            </div>

            <AdminTable items={topItems} onRefresh={load} capMap={cap} hideWaiting={false} waitingActions={topTable === "waiting"} />
          </div>
        ) : null}
      </div>

      <div className="adminGrid">
        {AGE_ORDER.map((k) => (
          <GroupCard
            key={k}
            title={AGE_LABELS[k]}
            items={grouped[k].filter((x) => (x.status || "new") !== "waiting")}
            onRefresh={load}
            isOpen={openGroups[k]}
            onToggle={() => toggleGroup(k)}
            capMap={cap}
          />
        ))}

        {grouped.other.length > 0 ? (
          <GroupCard
            title="أخرى / خارج النطاق"
            items={grouped.other.filter((x) => (x.status || "new") !== "waiting")}
            onRefresh={load}
            isOpen={openGroups.other}
            onToggle={() => toggleGroup("other")}
            capMap={cap}
          />
        ) : null}
      </div>
    </div>
  );
}