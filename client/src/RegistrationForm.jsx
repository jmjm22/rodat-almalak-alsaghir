import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE || "https://rodat-almalak-alsaghir.onrender.com";

function calcAgeGroupFromBirthDate(birthDate) {
  if (!birthDate) return "";
  const bd = new Date(birthDate);
  if (Number.isNaN(bd.getTime())) return "";

  const today = new Date();
  let months = (today.getFullYear() - bd.getFullYear()) * 12 + (today.getMonth() - bd.getMonth());

  if (today.getDate() < bd.getDate()) months -= 1;
  if (months < 0) return "";

  if (months >= 6 && months <= 11) return "6m-1y";
  if (months >= 12 && months <= 17) return "1y-1.5y";
  if (months >= 18 && months <= 23) return "1.5y-2y";
  if (months >= 24 && months <= 35) return "2y-3y";

  return "";
}

function ageGroupLabel(g) {
  if (g === "6m-1y") return "6 أشهر - سنة";
  if (g === "1y-1.5y") return "سنة - سنة ونص";
  if (g === "1.5y-2y") return "سنة ونص - سنتين";
  if (g === "2y-3y") return "سنتين - ثلاث";
  return "";
}

export default function RegistrationForm() {
  const initialForm = {
    childFullName: "",
    birthDate: "",
    childId: "", // ✅ חדש
    ageGroup: "",
    motherName: "",
    motherPhone: "",
    fatherName: "",
    fatherPhone: "",
    stayUntil: "14",
    address: "",
    hasAllergy: "no",
    allergyDetails: "",
    hasDisease: "no",
    diseaseDetails: "",
    notes: "",
  };

  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);

  const [popup, setPopup] = useState({
    open: false,
    mode: "alert",
    type: "",
    text: "",
    onYes: null,
    onNo: null,
    resetAfterClose: false,
  });

  const openAlert = (type, text, resetAfterClose = false) =>
    setPopup({
      open: true,
      mode: "alert",
      type,
      text,
      onYes: null,
      onNo: null,
      resetAfterClose,
    });

  const openConfirm = (type, text, onYes, onNo) =>
    setPopup({
      open: true,
      mode: "confirm",
      type,
      text,
      onYes,
      onNo,
      resetAfterClose: false,
    });

  const closePopup = () => {
    setPopup((p) => {
      const shouldReset = p.resetAfterClose;
      setTimeout(() => {
        if (shouldReset) {
          setForm(initialForm);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }, 0);
      return { ...p, open: false, resetAfterClose: false };
    });
  };

  const focusField = (ref) => {
    if (!ref?.current) return;
    ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    ref.current.focus?.();
  };

  const childRef = useRef(null);
  const birthRef = useRef(null);
  const childIdRef = useRef(null); // ✅ חדש
  const motherRef = useRef(null);
  const motherPhoneRef = useRef(null);
  const fatherRef = useRef(null);
  const fatherPhoneRef = useRef(null);

  const onChange = (key) => (e) => {
    const value = e.target.value;

    setForm((p) => {
      if (key === "hasAllergy" && value === "no") return { ...p, hasAllergy: value, allergyDetails: "" };
      if (key === "hasDisease" && value === "no") return { ...p, hasDisease: value, diseaseDetails: "" };
      return { ...p, [key]: value };
    });
  };

  useEffect(() => {
    const g = calcAgeGroupFromBirthDate(form.birthDate);
    setForm((p) => ({ ...p, ageGroup: g }));
  }, [form.birthDate]);

  const canSubmit = useMemo(() => {
    const f = form;
    const has = (v) => (v ?? "").toString().trim().length > 0;

    if (!has(f.childFullName)) return false;
    if (!has(f.birthDate)) return false;
    if (!has(f.childId)) return false; // ✅ חדש
    if (!has(f.ageGroup)) return false;
    if (!has(f.motherName)) return false;
    if (!has(f.motherPhone)) return false;
    if (!has(f.fatherName)) return false;
    if (!has(f.fatherPhone)) return false;
    if (!has(f.stayUntil)) return false;

    if (!has(f.hasAllergy)) return false;
    if (f.hasAllergy === "yes" && !has(f.allergyDetails)) return false;

    if (!has(f.hasDisease)) return false;
    if (f.hasDisease === "yes" && !has(f.diseaseDetails)) return false;

    return true;
  }, [form]);

  const submit = async (e) => {
    e.preventDefault();

    const f = form;
    const has = (v) => (v ?? "").toString().trim().length > 0;

    const need = (cond, msg, ref) => {
      if (!cond) {
        openAlert("error", msg);
        if (ref) focusField(ref);
        return true;
      }
      return false;
    };

    if (need(has(f.childFullName), "⚠️ الرجاء إدخال اسم الطفل/ة", childRef)) return;
    if (need(has(f.birthDate), "⚠️ الرجاء إدخال تاريخ ميلاد الطفل/ة", birthRef)) return;

    // ✅ חדש: ת"ז ילד
    if (need(has(f.childId), "⚠️ الرجاء إدخال رقم هوية الطفل/ة", childIdRef)) return;

    const safeAgeGroup = calcAgeGroupFromBirthDate(f.birthDate);
    if (need(has(safeAgeGroup), "⚠️ تاريخ الميلاد غير مناسب. الرجاء اختيار تاريخ صحيح.", birthRef)) return;

    if (need(has(f.motherName), "⚠️ الرجاء إدخال اسم الأم", motherRef)) return;
    if (need(has(f.motherPhone), "⚠️ الرجاء إدخال رقم هاتف الأم", motherPhoneRef)) return;

    if (need(has(f.fatherName), "⚠️ الرجاء إدخال اسم الأب", fatherRef)) return;
    if (need(has(f.fatherPhone), "⚠️ الرجاء إدخال رقم هاتف الأب", fatherPhoneRef)) return;

    if (need(has(f.stayUntil), "⚠️ الرجاء اختيار حتى أي ساعة؟")) return;

    if (need(has(f.hasAllergy), "⚠️ الرجاء اختيار هل لدى الطفل/ة حساسية؟")) return;
    if (f.hasAllergy === "yes" && need(has(f.allergyDetails), "⚠️ الرجاء تعبئة تفاصيل الحساسية")) return;

    if (need(has(f.hasDisease), "⚠️ الرجاء اختيار هل يعاني الطفل/ة من مرض؟")) return;
    if (f.hasDisease === "yes" && need(has(f.diseaseDetails), "⚠️ الرجاء تعبئة تفاصيل المرض")) return;

    setLoading(true);

    try {
      const payloadToSend = { ...f, ageGroup: safeAgeGroup, childId: String(f.childId || "").trim() };

      const res = await fetch(`${API_BASE}/api/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadToSend),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok && res.status === 409 && payload?.error === "duplicate") {
        openAlert("error", payload?.message || "❌ כבר קיימת הרשמה עם אותם פרטים.");
        return;
      }

      if (!res.ok && res.status === 409 && payload?.error === "full") {
        openConfirm(
          "error",
          "❌ لا يوجد مكان متاح في هذه الصفّة حالياً.\nهل تريدون التسجيل في قائمة الانتظار؟",
          async () => {
            closePopup();
            setLoading(true);
            try {
              const res2 = await fetch(`${API_BASE}/api/registrations`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...payloadToSend, allowWaiting: true }),
              });

              const payload2 = await res2.json().catch(() => null);

              if (!res2.ok) {
                openAlert("error", `❌ فشل الإرسال: ${payload2?.message || payload2?.error || "خطأ"}`);
                return;
              }

              openAlert("success", "✅ تم إدخالكم إلى قائمة الانتظار.\nإذا توفر مكان سنقوم بإرسال رسالة لكم.", true);
            } finally {
              setLoading(false);
            }
          },
          () => {
            closePopup();
            openAlert("error", "تم إلغاء التسجيل.\nيمكنكم المحاولة لاحقاً .", true);
          }
        );
        return;
      }

      if (!res.ok) {
        const serverMsg = payload?.message || payload?.error || `HTTP ${res.status}`;
        openAlert("error", `❌ فشل الإرسال: ${serverMsg}`);
        return;
      }

      const id = payload?.item?.id;
      const status = payload?.item?.status;

      if (status === "waiting") {
        openAlert("success", "✅ تم إدخالكم إلى قائمة الانتظار.\nإذا توفر مكان سنقوم بإرسال رسالة لكم.", true);
        return;
      }

      openAlert("success", "✅ تم التسجيل بنجاح! سيتم تحويلكم الآن لصفحة دفع العربون.");
      setTimeout(() => {
        window.location.href = `/payment?id=${encodeURIComponent(id)}`;
      }, 900);
    } catch {
      openAlert("error", "❌ تعذر الاتصال بالخادم. انتظروا 10 ثوانٍ وحاولوا مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  const Req = () => <span className="reqStar">*</span>;

  return (
    <div className="page" dir="rtl" lang="ar">
      <div className="container">
        <div className="heroCard">
          <h2 className="heroTitle">
            <span className="badgeTitle">✨ روضة الملاك الصغير</span>
          </h2>
          <div className="heroSub">استمارة تسجيل — معلومات بسيطة وسريعة</div>
        </div>

        <div className="infoBanner">
          💳 لإتمام التسجيل يجب دفع <b>عربون 300₪</b> بعد إرسال الاستمارة وفي حال توفر مكان.
        </div>

        <form className="k-form" onSubmit={submit}>
          <div className="k-sectionTitle">معلومات الطفل/ة</div>

          <label className="k-label">
            <Req /> اسم الطفل/ة
          </label>
          <input ref={childRef} className="k-input" value={form.childFullName} onChange={onChange("childFullName")} />

          <label className="k-label">
            <Req /> تاريخ ميلاد الطفل/ة
          </label>
          <input ref={birthRef} type="date" className="k-input k-date" value={form.birthDate} onChange={onChange("birthDate")} />

          {/* ✅ חדש: ת"ז מתחת לתאריך */}
          <label className="k-label">
            <Req /> رقم هوية الطفل/ة
          </label>
          <input
            ref={childIdRef}
            className="k-input"
            inputMode="numeric"
            value={form.childId}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                childId: e.target.value.replace(/\D/g, "").slice(0, 9),
              }))
            }
            placeholder="مثال: 123456789"
          />

          <label className="k-label">
            <Req /> عمر الطفل/ة
          </label>
          <div className="k-input k-readonly" aria-readonly="true">
            {form.ageGroup ? ageGroupLabel(form.ageGroup) : "اختروا تاريخ الميلاد أولاً"}
          </div>

          <div className="k-sectionTitle">معلومات الأهل</div>

          <div className="k-grid2">
            <div>
              <label className="k-label">
                <Req /> اسم الأم
              </label>
              <input ref={motherRef} className="k-input" value={form.motherName} onChange={onChange("motherName")} />
            </div>

            <div>
              <label className="k-label">
                <Req /> هاتف الأم
              </label>
              <input ref={motherPhoneRef} className="k-input" value={form.motherPhone} onChange={onChange("motherPhone")} />
            </div>

            <div>
              <label className="k-label">
                <Req /> اسم الأب
              </label>
              <input ref={fatherRef} className="k-input" value={form.fatherName} onChange={onChange("fatherName")} />
            </div>

            <div>
              <label className="k-label">
                <Req /> هاتف الأب
              </label>
              <input ref={fatherPhoneRef} className="k-input" value={form.fatherPhone} onChange={onChange("fatherPhone")} />
            </div>
          </div>

          <div className="k-sectionTitle">تفاصيل إضافية</div>

          <label className="k-label">
            <Req /> حتى أي ساعة؟
          </label>
          <div className="k-radioRow">
            <label className="k-radio">
              <input type="radio" name="stayUntil" value="14" checked={form.stayUntil === "14"} onChange={onChange("stayUntil")} />
              حتى 14:00
            </label>
            <label className="k-radio">
              <input type="radio" name="stayUntil" value="15" checked={form.stayUntil === "15"} onChange={onChange("stayUntil")} />
              حتى 15:00
            </label>
            <label className="k-radio">
              <input type="radio" name="stayUntil" value="16" checked={form.stayUntil === "16"} onChange={onChange("stayUntil")} />
              حتى 16:00
            </label>
          </div>

          <label className="k-label">العنوان (اختياري)</label>
          <input className="k-input" value={form.address} onChange={onChange("address")} />

          <label className="k-label">
            <Req /> هل لدى الطفل/ة أي نوع من الحساسية؟
          </label>
          <div className="k-radioRow">
            <label className="k-radio">
              <input type="radio" name="hasAllergy" value="no" checked={form.hasAllergy === "no"} onChange={onChange("hasAllergy")} />
              لا
            </label>
            <label className="k-radio">
              <input type="radio" name="hasAllergy" value="yes" checked={form.hasAllergy === "yes"} onChange={onChange("hasAllergy")} />
              نعم
            </label>
          </div>

          {form.hasAllergy === "yes" && (
            <>
              <label className="k-label">
                <Req /> من ماذا؟
              </label>
              <input className="k-input" value={form.allergyDetails} onChange={onChange("allergyDetails")} />
            </>
          )}

          <label className="k-label">
            <Req /> هل لدى الطفل/ة حالة صحية يجب أن نكون على علم بها؟
          </label>
          <div className="k-radioRow">
            <label className="k-radio">
              <input type="radio" name="hasDisease" value="no" checked={form.hasDisease === "no"} onChange={onChange("hasDisease")} />
              لا
            </label>
            <label className="k-radio">
              <input type="radio" name="hasDisease" value="yes" checked={form.hasDisease === "yes"} onChange={onChange("hasDisease")} />
              نعم
            </label>
          </div>

          {form.hasDisease === "yes" && (
            <>
              <label className="k-label">
                <Req /> ما هو المرض؟
              </label>
              <input className="k-input" value={form.diseaseDetails} onChange={onChange("diseaseDetails")} />
            </>
          )}

          <label className="k-label">ملاحظات (اختياري)</label>
          <textarea className="k-textarea" rows={4} value={form.notes} onChange={onChange("notes")} />

          <button className="k-button" disabled={loading || !canSubmit}>
            {loading ? "جاري الإرسال..." : "إرسال التسجيل"}
          </button>
        </form>
      </div>

      {popup.open && (
        <div className="popupOverlay" onClick={closePopup}>
          <div className={`popupCard ${popup.type}`} onClick={(e) => e.stopPropagation()}>
            <div className="popupText" style={{ whiteSpace: "pre-line" }}>
              {popup.text}
            </div>

            {popup.mode === "alert" ? (
              <button className="popupBtn" type="button" onClick={closePopup}>
                حسناً
              </button>
            ) : (
              <div className="popupBtnsRow">
                <button className="popupBtn" type="button" onClick={() => popup.onYes && popup.onYes()}>
                  نعم
                </button>
                <button className="popupBtn ghost" type="button" onClick={() => popup.onNo && popup.onNo()}>
                  لا
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}