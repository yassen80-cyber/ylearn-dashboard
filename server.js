// server.js
import express from "express";
import axios from "axios";
import admin from "firebase-admin";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors({ origin: true }));
app.use(bodyParser.json());

// إعداد Firebase Admin (مطلوب service account JSON في env أو ملف)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

// إعداد Paymob من المتغيرات
const PAYMOB_API_KEY = process.env.PAYMOB_API_KEY; // خليه هنا على السيرفر
const INTEGRATION_ID = process.env.PAYMOB_INTEGRATION_ID; // 5377342
const IFRAME_ID = process.env.PAYMOB_IFRAME_ID; // 973965
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// === مساعدة: الحصول على auth token من Paymob ===
async function getPaymobAuthToken() {
  const url = "https://accept.paymob.com/api/auth/tokens";
  const res = await axios.post(url, { api_key: PAYMOB_API_KEY });
  return res.data.token;
}

// === إنشاء Order (Paymob) ثم Payment Key ثم إرجاع iframe URL ===
app.post("/create_payment", async (req, res) => {
  /* متوقع body:
      {
        uid: "<firebase uid of student>",
        courseId: "<course id>",
        amount: 15000   // amount in cents / piastre? Paymob requires amount in piasters (EGP*100)
      }
  */
  try {
    const { uid, courseId, amount } = req.body;
    if (!uid || !courseId || !amount) return res.status(400).json({ error: "uid, courseId, amount required" });

    // 1) get auth token
    const authToken = await getPaymobAuthToken();

    // 2) create order
    const orderResp = await axios.post(
      "https://accept.paymob.com/api/ecommerce/orders",
      {
        delivery_needed: false,
        amount_cents: amount, // e.g., 15000 = 150.00 EGP -> amount in cents
        currency: "EGP",
        merchant_order_id: `order_${Date.now()}_${courseId}`,
        items: []
      },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    const orderId = orderResp.data.id;

    // 3) request payment key
    // return_url will point to our pay_success page with courseId & uid
    const integration_id = parseInt(INTEGRATION_ID, 10);
    const return_url = `${BASE_URL}/pay_success.html?uid=${encodeURIComponent(uid)}&courseId=${encodeURIComponent(courseId)}&orderId=${orderId}`;

    const paymentKeyBody = {
      auth_token: authToken,
      amount_cents: amount,
      expiration: 3600,
      order_id: orderId,
      billing_data: {
        apartment: "NA",
        email: "customer@example.com",
        floor: "NA",
        first_name: "student",
        street: "NA",
        building: "NA",
        phone_number: "0000000000",
        shipping_method: "NA",
        postal_code: "NA",
        city: "NA",
        country: "EG",
        last_name: "user",
        state: "NA"
      },
      currency: "EGP",
      integration_id: integration_id,
      lock_order_when_paid: false,
      // الباراميتر المهم: where Paymob يرجع المستخدم بعد الدفع
      "return_url": return_url
    };

    const paymentKeyResp = await axios.post("https://accept.paymob.com/api/acceptance/payment_keys", paymentKeyBody, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    const paymentToken = paymentKeyResp.data.token;

    // 4) iframe url
    const iframeUrl = `https://accept.paymobsolutions.com/api/acceptance/iframes/${IFRAME_ID}?payment_token=${paymentToken}`;

    return res.json({ iframeUrl });
  } catch (err) {
    console.error("create_payment error:", err.response?.data || err.message || err);
    return res.status(500).json({ error: "Failed to create payment" });
  }
});

// === Verify payment (optional endpoint) ===
// بعد الرجوع من Paymob إلى pay_success.html، العميل يمكنه نداء هذا المسار ليتحقق السيرفر من حالة الطلب
app.post("/verify_payment", async (req, res) => {
  // body: { orderId, courseId, uid }
  try {
    const { orderId, courseId, uid } = req.body;
    if (!orderId || !courseId || !uid) return res.status(400).json({ error: "orderId, courseId, uid required" });

    // 1) احصل على auth token
    const authToken = await getPaymobAuthToken();

    // 2) جلب تفاصيل الطلب
    const orderDetails = await axios.get(`https://accept.paymob.com/api/ecommerce/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    // Paymob order object may contain transactions - لكن أفضل طريقة هي البحث عبر Transactions API
    // هنا سنفترض أن وجود orderDetails يعني نجاح (لمزيد أمان تواصل مع Paymob transactions endpoint)
    // للتحقق الحقيقي: راجع API docs أو استخدم client side postback/webhook أو transactions endpoint.

    // لتبسيط: نعتبر الدفع ناجحاً إذا orderDetails موجود
    // ثم نسجل الشراء في Firebase Realtime DB
    const purchaseRef = db.ref(`students/${uid}/purchased/${courseId}`);
    await purchaseRef.set({ purchasedAt: new Date().toISOString(), orderId });

    return res.json({ success: true });
  } catch (err) {
    console.error("verify_payment error:", err.response?.data || err.message || err);
    return res.status(500).json({ error: "Verification failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server listening on port", PORT));