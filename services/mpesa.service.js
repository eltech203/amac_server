const axios = require("axios");
const moment = require("moment");
const { v4: uuidv4 } = require("uuid");
const redis = require("../config/redis");
const db = require("../config/db");
const ticketService = require("../controllers/ticket.controller");
const mpesaConfig = require("../config/mpesa");

// Redis client for pending payments


let accessToken = null;
let tokenExpiry = null;

// -----------------
// Get Access Token
// -----------------
async function getAccessToken() {
  if (accessToken && tokenExpiry > Date.now()) return accessToken;

  const auth = Buffer.from(
    `${mpesaConfig.consumerKey}:${mpesaConfig.consumerSecret}`
  ).toString("base64");

  const response = await axios.get(
    `${mpesaConfig.baseURL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } }
  );

  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + 3500 * 1000; // ~58 min
  return accessToken;
}

const paymentMetaStore = {}; // Temporary in-memory store (use Redis in production)
// -----------------
// Trigger STK Push
// -----------------
exports.stkPush = async ( phone, amount, order_id, event_id, user_uid) => {
  const token = await getAccessToken();

  // Store metadata for callback reference
  const timestamp = moment().format("YYYYMMDDHHmmss");
  const password = Buffer.from(
    mpesaConfig.shortCode + mpesaConfig.passKey + timestamp
  ).toString("base64");

  const payload = {
    BusinessShortCode: mpesaConfig.shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: amount,
    PartyA: phone,
    PartyB: mpesaConfig.shortCode,
    PhoneNumber: phone,
    CallBackURL: `${mpesaConfig.callbackURL}/api/payment/callback`,
    AccountReference: order_id,
    TransactionDesc: "Event Ticket Payment",
  };

  const response = await axios.post(
    `${mpesaConfig.baseURL}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  // Store pending payment in Redis (expires in 30 mins)
  if (response.data.CheckoutRequestID) {
    await redis.set(
      `pending_payment:${response.data.CheckoutRequestID}`,
      JSON.stringify({ order_id, event_id, user_uid }),
      "EX",
      1800
    );
  }

  return response.data;
};

// -----------------
// STK Callback
// -----------------
exports.callback = async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    const callback = req.body.Body?.stkCallback;
    if (!callback || callback.ResultCode !== 0) return;

    const metaKey = `pending_payment:${callback.CheckoutRequestID}`;
    
    const data = await redis.get(metaKey);
    if (!data) return console.warn("❌ No pending payment found in Redis");

    const { order_id, event_id, user_uid } = JSON.parse(data);

    const metadata = callback.CallbackMetadata.Item;
    const amount = metadata.find((i) => i.Name === "Amount")?.Value;
    const transID = metadata.find((i) => i.Name === "MpesaReceiptNumber")?.Value;
    const phone = metadata.find((i) => i.Name === "PhoneNumber")?.Value;

    const paymentId = uuidv4();

    // Update order status
    await new Promise((resolve, reject) => {
      db.query("UPDATE orders SET status='paid' WHERE id=?", [order_id], (err) =>
        err ? reject(err) : resolve()
      );
    });

    // Insert payment record
    await new Promise((resolve, reject) => {
      db.query(
        "INSERT INTO ticket_payments (id,order_id,mpesa_receipt_number,phone_number,amount_paid,status) VALUES (?,?,?,?,?,'completed')",
        [paymentId, order_id, transID, phone, amount],
        (err) => (err ? reject(err) : resolve())
      );
    });

    // Mark seats sold
    await new Promise((resolve, reject) => {
      db.query(
        `UPDATE seats s
         JOIN order_items oi ON s.id=oi.seat_id
         SET s.status='sold'
         WHERE oi.order_id=?`,
        [order_id],
        (err) => (err ? reject(err) : resolve())
      );
    });

    // Generate tickets
    await ticketService.generateTickets_int(order_id, user_uid, event_id);

    console.log("✅ Payment processed and tickets generated for order:", order_id);
    await redis.del(metaKey); // remove pending payment
  } catch (err) {
    console.error("❌ STK callback error:", err.message);
  }
};