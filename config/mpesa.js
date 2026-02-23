require("dotenv").config();

module.exports = {
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  shortCode: process.env.MPESA_SHORTCODE,
  passKey: process.env.MPESA_PASSKEY,
  baseURL: process.env.MPESA_BASE_URL, 
  // Sandbox: https://sandbox.safaricom.co.ke
  // Production: https://api.safaricom.co.ke
  callbackURL: process.env.MPESA_CALLBACK_URL,
};