const request = require("request");
const moment = require("moment");
const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");

const consumer_key = "O4FAkx1C61CyCWkGZqcMP9snAX3OrN9HE8UkewAHtPcelH1E";
const consumer_secret = "hAAhFusWGgAi3Ft3u7OA8OjmUoOicIUGblqF6oM27jcLGnXVGKiwC3Y0NAYJnPSn";
const auth = Buffer.from(consumer_key + ":" + consumer_secret).toString("base64");

exports.accessToken = (req, res, next) => {
  request(
    {
      url: "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      headers: { Authorization: "Basic " + auth },
    },
    (error, response, body) => {
      if (error) return res.status(500).json(error);
      req.access_token = JSON.parse(body).access_token;
      next();
    }
  );
};

const paymentMetaStore = {};

exports.stkPush = (req, res) => {
  const { order_id, phone, amount } = req.body;

  const timeStamp = moment().format("YYYYMMDDHHmmss");
  const shortCode = "174379";
  const passKey = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";

  const password = Buffer.from(
    `${shortCode}${passKey}${timeStamp}`
  ).toString("base64");

  request(
    {
      url: "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      method: "POST",
      headers: { Authorization: "Bearer " + req.access_token },
      json: {
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timeStamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: shortCode,
        PhoneNumber: phone,
        CallBackURL: "https://amacserver-production-ebd5.up.railway.app/api/payment/callback",
        AccountReference: "Amace Wards",
        TransactionDesc: "Ticket Payment",
      },
    },
    (error, response, body) => {
      if (body.CheckoutRequestID) {
        paymentMetaStore[body.CheckoutRequestID] = { order_id };
      }

      res.json(body);
    }
  );
};

exports.callback = (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  const callback = req.body.Body?.stkCallback;
  if (!callback || callback.ResultCode !== 0) return;

  const metaKey = callback.CheckoutRequestID;
  const { order_id } = paymentMetaStore[metaKey];

  const metadata = callback.CallbackMetadata;
  const amount = metadata.Item.find((i) => i.Name === "Amount")?.Value;
  const transID = metadata.Item.find(
    (i) => i.Name === "MpesaReceiptNumber"
  )?.Value;
  const phone = metadata.Item.find(
    (i) => i.Name === "PhoneNumber"
  )?.Value;

  const paymentId = uuidv4();

  db.query(
    "UPDATE orders SET status='paid' WHERE id=?",
    [order_id]
  );

  db.query(
    "INSERT INTO ticket_payments (id,order_id,mpesa_receipt_number,phone_number,amount_paid,status) VALUES (?,?,?,?,?,'completed')",
    [paymentId, order_id, transID, phone, amount]
  );

  console.log("✅ Payment successful for order:", order_id);
  delete paymentMetaStore[metaKey];
};