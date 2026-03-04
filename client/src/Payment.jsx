import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE || "https://rodat-almalak-alsaghir.onrender.com";
const DEPOSIT_AMOUNT = 300;

const getRowId = (x) => x?._id || x?.id || "";

export default function Payment() {
  const BANK_OWNER = "روضة الملاك الصغير";
  const BANK_NAME = "בנק  פועלים";
  const BANK_BRANCH = "665";
  const BANK_ACCOUNT = "354681";

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const regIdFromUrl = (params.get("id") || "").trim();

  const [serverRegId, setServerRegId] = useState(""); // ✅ id אמיתי מהשרת
  const [regExists, setRegExists] = useState(false);
  const [checkingReg, setCheckingReg] = useState(true);

  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptError, setReceiptError] = useState("");
  const [loading, setLoading] = useState(false);

  const [lastReceiptUrl, setLastReceiptUrl] = useState(""); // ✅ אם Cloudinary מחזיר URL
  const [popup, setPopup] = useState({ open: false, type: "success", text: "" });
  const openPopup = (type, text) => setPopup({ open: true, type, text });
  const closePopup = () => setPopup((p) => ({ ...p, open: false }));

  useEffect(() => {
    const checkRegistration = async () => {
      setCheckingReg(true);
      setLastReceiptUrl("");
      setServerRegId("");

      if (!regIdFromUrl) {
        setRegExists(false);
        setCheckingReg(false);
        openPopup("error", "❌ رقم التسجيل غير موجود. ارجعوا لصفحة التسجيل.");
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/registrations/${encodeURIComponent(regIdFromUrl)}`);
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          setRegExists(false);
          openPopup("error", "❌ لم يتم العثور على هذا التسجيل. الرجاء إعادة التسجيل.");
          return;
        }

        // ✅ השרת שלך מחזיר { ok:true, item }
        const item = data?.item || data;
        const realId = getRowId(item) || regIdFromUrl;

        setServerRegId(realId);
        setRegExists(true);

        // אם כבר יש קבלה קיימת
        if (item?.receiptUrl) setLastReceiptUrl(item.receiptUrl);
      } catch {
        setRegExists(false);
        openPopup("error", "❌ تعذر الاتصال بالخادم.");
      } finally {
        setCheckingReg(false);
      }
    };

    checkRegistration();
  }, [regIdFromUrl]);

  const copyBankDetails = async () => {
    const text =
      `عربون تسجيل: ${DEPOSIT_AMOUNT}₪\n` +
      `اسم الحساب: ${BANK_OWNER}\n` +
      `البنك: ${BANK_NAME}\n` +
      `الفرع: ${BANK_BRANCH}\n` +
      `رقم الحساب: ${BANK_ACCOUNT}\n` +
      `ملاحظة التحويل: اسم الطفل + هاتف الأم\n` +
      `رقم التسجيل: ${serverRegId || regIdFromUrl || "—"}\n`;

    try {
      await navigator.clipboard.writeText(text);
      openPopup("success", "✅ تم نسخ تفاصيل الحساب.");
      setTimeout(() => closePopup(), 1600);
    } catch {
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
    return !!(serverRegId || regIdFromUrl) && regExists && !!receiptFile && !loading && !checkingReg;
  }, [serverRegId, regIdFromUrl, regExists, receiptFile, loading, checkingReg]);

  const sendReceipt = async () => {
    setReceiptError("");

    if (checkingReg) {
      openPopup("error", "⏳ نتحقق من التسجيل... حاولوا بعد لحظة.");
      return;
    }

    if (!regExists) {
      openPopup("error", "❌ لم يتم العثور على هذا التسجيل. الرجاء إعادة التسجيل.");
      return;
    }

    if (!receiptFile) {
      setReceiptError("⚠️ رفع صورة إثبات التحويل إلزامي.");
      return;
    }

    const idToUse = serverRegId || regIdFromUrl;

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("receipt", receiptFile);

      const res = await fetch(`${API_BASE}/api/registrations/${encodeURIComponent(idToUse)}/receipt`, {
        method: "POST",
        body: fd,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        openPopup("error", data?.message || "❌ حدث خطأ أثناء إرسال الإيصال. حاولوا مرة أخرى.");
        return;
      }

      // ✅ אם השרת מחזיר item עם receiptUrl
      const item = data?.item || null;
      if (item?.receiptUrl) setLastReceiptUrl(item.receiptUrl);

      openPopup("success", "✅ تم إرسال إثبات التحويل بنجاح! شكراً لكم 💛");
      setReceiptFile(null);

      setTimeout(() => {
        window.location.href = "/";
      }, 1200);
    } catch {
      openPopup("error", "❌ تعذر الاتصال بالخادم أثناء رفع الصورة.");
    } finally {
      setLoading(false);
    }
  };

  const openReceipt = () => {
    if (!lastReceiptUrl) return;
    const url = /^https?:\/\//i.test(lastReceiptUrl) ? lastReceiptUrl : `${API_BASE}${lastReceiptUrl}`;
    window.open(url, "_blank");
  };

  return (
    <div className="page" dir="rtl" lang="ar">
      <div className="container">
        <div className="heroCard">
          <h2 className="heroTitle badgeTitle"> دفع العربون 💳 </h2>
          <div className="heroSub">بعد التسجيل — يرجى دفع عربون ورفع صورة التحويل</div>
        </div>

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

          {lastReceiptUrl ? (
            <button type="button" className="adminBtn" style={{ width: "100%", marginTop: 10 }} onClick={openReceipt}>
              فتح الإيصال الذي تم رفعه
            </button>
          ) : null}

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