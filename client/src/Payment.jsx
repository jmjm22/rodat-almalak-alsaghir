import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = "https://rodat-almalak-alsaghir.onrender.com";
const DEPOSIT_AMOUNT = 300;

export default function Payment() {
  const BANK_OWNER = "روضة الملاك الصغير";
  const BANK_NAME = "בנק  פועלים";
  const BANK_BRANCH = "665";
  const BANK_ACCOUNT = "354681";

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const regId = params.get("id") || "";

  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptError, setReceiptError] = useState("");
  const [loading, setLoading] = useState(false);

  const [hasPlace, setHasPlace] = useState(true);
  const [checkingPlace, setCheckingPlace] = useState(true);

  const [popup, setPopup] = useState({ open: false, type: "success", text: "" });
  const openPopup = (type, text) => setPopup({ open: true, type, text });
  const closePopup = () => setPopup((p) => ({ ...p, open: false }));

  useEffect(() => {
    if (!regId) {
      setCheckingPlace(false);
      setHasPlace(false);
      openPopup("error", "❌ رقم التسجيل غير موجود. ارجعوا لصفحة التسجيل.");
      return;
    }

    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/registrations/${regId}/check-place`);
        if (!res.ok) {
          setCheckingPlace(false);
          return;
        }

        const data = await res.json();
        if (!data?.hasPlace) {
          setHasPlace(false);
          openPopup("error", "❌ عذراً، لم يعد هناك مكان شاغر في هذه المجموعة.");
        }
      } catch (e) {
        console.warn("check-place failed:", e);
      } finally {
        setCheckingPlace(false);
      }
    };

    check();
  }, [regId]);

  const copyBankDetails = async () => {
    const text =
      `عربون تسجيل: ${DEPOSIT_AMOUNT}₪\n` +
      `اسم الحساب: ${BANK_OWNER}\n` +
      `البنك: ${BANK_NAME}\n` +
      `الفرع: ${BANK_BRANCH}\n` +
      `رقم الحساب: ${BANK_ACCOUNT}\n` +
      `مهم: اكتبوا رقم التسجيل في ملاحظة التحويل: ${regId || "—"}\n`;

    try {
      await navigator.clipboard.writeText(text);
      openPopup("success", "✅ تم نسخ تفاصيل الحساب.");
      setTimeout(() => closePopup(), 1600);
    } catch (e) {
      console.warn("clipboard failed:", e);
      openPopup("error", "⚠️ لم نستطع النسخ تلقائيًا. انسخوا يدويًا.");
    }
  };

  const onPickReceipt = (e) => {
    const file = e.target.files?.[0] || null;
    setReceiptError("");

    if (!file) {
      setReceiptFile(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setReceiptFile(null);
      setReceiptError("❌ الرجاء رفع صورة فقط.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setReceiptFile(null);
      setReceiptError("❌ حجم الصورة أكبر من 5MB.");
      return;
    }

    setReceiptFile(file);
  };

  const canSend = useMemo(() => {
    return !!regId && !!receiptFile && !loading && hasPlace && !checkingPlace;
  }, [regId, receiptFile, loading, hasPlace, checkingPlace]);

  const sendReceipt = async () => {
    setReceiptError("");

    if (checkingPlace) {
      openPopup("error", "⏳ نتحقق من وجود مكان... حاولوا بعد لحظة.");
      return;
    }

    if (!hasPlace) {
      openPopup("error", "❌ لا يوجد مكان متاح في الصف.");
      return;
    }

    if (!regId) {
      openPopup("error", "❌ رقم التسجيل غير موجود. ارجعوا لصفحة التسجيل وحاولوا مرة أخرى.");
      return;
    }

    if (!receiptFile) {
      setReceiptError("⚠️ رفع صورة إثبات التحويل إلزامي.");
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("receipt", receiptFile);

      const res = await fetch(`${API_BASE}/api/registrations/${regId}/receipt`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        if (res.status === 404) throw new Error("not_found");
        throw new Error("upload_failed");
      }

      openPopup("success", "✅ تم إرسال إثبات التحويل بنجاح! شكراً لكم 💛");
      setReceiptFile(null);

      setTimeout(() => {
        window.location.href = "/";
      }, 1200);
    } catch (e) {
      console.warn("send receipt failed:", e);
      if (e?.message === "not_found") {
        openPopup("error", "❌ لم يتم العثور على هذا التسجيل. الرجاء إعادة التسجيل.");
      } else {
        openPopup("error", "❌ حدث خطأ أثناء إرسال الإيصال. حاولوا مرة أخرى.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" dir="rtl" lang="ar">
      <div className="container">
        <div className="heroCard">
          <h2 className="heroTitle badgeTitle"> دفع العربون 💳 </h2>
          <div className="heroSub">بعد التسجيل — يرجى دفع عربون ورفع صورة التحويل</div>
        </div>

        {!hasPlace && !checkingPlace ? (
          <div className="infoBanner">❌ لا يوجد مكان متاح في هذه المجموعة حالياً.</div>
        ) : null}

        <div className="k-form">
          <div className="depositText">
            قيمة العربون: <b>{DEPOSIT_AMOUNT}₪</b>
          </div>

          <div className="bankGrid">
            <div className="bankRow">
              <span className="bankKey">اسم الحساب:</span>
              <span className="bankVal">{BANK_OWNER}</span>
            </div>
            <div className="bankRow">
              <span className="bankKey">البنك:</span>
              <span className="bankVal">{BANK_NAME}</span>
            </div>
            <div className="bankRow">
              <span className="bankKey">الفرع:</span>
              <span className="bankVal">{BANK_BRANCH}</span>
            </div>
            <div className="bankRow">
              <span className="bankKey">رقم الحساب:</span>
              <span className="bankVal">{BANK_ACCOUNT}</span>
            </div>
          </div>

          <div className="bankNote">
            ⚠️ مهم: اكتبوا <b>اسم الطفل + رقم هاتف الام</b> في ملاحظة التحويل
          </div>

          <button type="button" className="copyBtn" onClick={copyBankDetails}>
            نسخ تفاصيل الحساب
          </button>

          <div className="uploadBox">
            <label className="k-label">* ارفعوا صورة إثبات التحويل</label>
            <input className="fileInput" type="file" accept="image/*" onChange={onPickReceipt} />

            {receiptFile ? (
              <div className="fileOk">
                ✅ تم اختيار الملف: <b>{receiptFile.name}</b>
              </div>
            ) : (
              <div className="depositHint">⚠️ رفع الصورة إلزامي.</div>
            )}

            {receiptError ? <div className="fileErr">{receiptError}</div> : null}
          </div>

          <button className="k-button" type="button" disabled={!canSend} onClick={sendReceipt}>
            {loading ? "جاري الإرسال..." : "إرسال إثبات التحويل"}
          </button>

          <button
            type="button"
            className="adminBtn dark"
            style={{ width: "100%", marginTop: 10 }}
            onClick={() => (window.location.href = "/")}
          >
            رجوع لصفحة التسجيل
          </button>
        </div>
      </div>

      {popup.open && (
        <div className="popupOverlay" onClick={closePopup}>
          <div className={`popupCard ${popup.type}`} onClick={(e) => e.stopPropagation()}>
            <div className="popupText">{popup.text}</div>
            <button className="popupBtn" type="button" onClick={closePopup}>
              حسناً
            </button>
          </div>
        </div>
      )}
    </div>
  );
}