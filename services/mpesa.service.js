const axios = require("axios");
const moment = require("moment");
const mpesaConfig = require("../config/mpesa");

let accessToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  if (accessToken && tokenExpiry > Date.now()) {
    return accessToken;
  }

  const auth = Buffer.from(
    `${mpesaConfig.consumerKey}:${mpesaConfig.consumerSecret}`
  ).toString("base64");

  const response = await axios.get(
    `${mpesaConfig.baseURL}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${auth}` },
    }
  );

  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + 3500 * 1000; // ~58 min
  return accessToken;
}

exports.stkPush = async ({ phone, amount, orderId }) => {
  const token = await getAccessToken();

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
    CallBackURL: `${mpesaConfig.callbackURL}/api/payments/mpesa/callback`,
    AccountReference: orderId,
    TransactionDesc: "Event Ticket Payment",
  };

  const response = await axios.post(
    `${mpesaConfig.baseURL}/mpesa/stkpush/v1/processrequest`,
    payload,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  return response.data;
};