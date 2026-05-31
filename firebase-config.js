// ============================================================
// SHADOW PHASE 影变 — Firebase configuration
// ------------------------------------------------------------
// วิธีใช้:
//   1. สร้างโปรเจกต์ที่ https://console.firebase.google.com
//   2. ไปที่ Project settings (⚙️) › ส่วน "Your apps" › Web app (</>)
//   3. คัดลอกค่าจาก firebaseConfig มาวางทับด้านล่างนี้
//
// ตราบใดที่ apiKey ยังเป็น "PASTE_..." เว็บจะรันในโหมดสาธิต
// (เก็บข้อมูลในเครื่องผู้ใช้) — พอใส่ค่าจริงจะสลับไปใช้ Firebase อัตโนมัติ
// ============================================================
window.SP_FIREBASE_CONFIG = {
  apiKey:            "PASTE_YOUR_API_KEY",
  authDomain:        "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId:         "PASTE_YOUR_PROJECT_ID",
  storageBucket:     "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId:             "PASTE_YOUR_APP_ID"
};
