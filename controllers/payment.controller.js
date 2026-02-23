const db = require("../config/db");
const ticketService = require("../controllers/ticket.controller");
const mpesaService = require("../services/mpesa.service");

// Initiate STK push
exports.initiateSTK = async (req, res) => {
  try {
    const { orderId, phone } = req.body;

    const [orders] = await db.execute("SELECT * FROM orders WHERE id=?", [orderId]);
    if (!orders.length) return res.status(404).json({ error: "Order not found" });

    const order = orders[0];
    if (order.status === "paid") return res.json({ message: "Order already paid" });

    const stkResponse = await mpesaService.stkPush({ phone, amount: order.total_amount, orderId });

    await db.execute("UPDATE orders SET status='pending' WHERE id=?", [orderId]);
    res.json({ success: true, stkResponse });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// M-Pesa callback
exports.mpesaCallback = async (req, res) => {
  try {
    const callback = req.body.Body.stkCallback;
    const orderId = callback.CallbackMetadata?.Item?.find(i => i.Name === "AccountReference")?.Value;

    if (!orderId) return res.json({ ResultCode: 0, ResultDesc: "Accepted" });

    if (callback.ResultCode !== 0) {
      await db.execute("UPDATE orders SET status='failed' WHERE id=?", [orderId]);
      return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const receipt = callback.CallbackMetadata.Item.find(i => i.Name === "MpesaReceiptNumber")?.Value;
    await db.execute("UPDATE orders SET status='paid', mpesa_receipt=? WHERE id=?", [receipt, orderId]);

    // Generate tickets
    await ticketService.generateTicketsFromOrder(orderId);

    res.json({ ResultCode: 0, ResultDesc: "Success" });
  } catch (err) {
    console.error(err);
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
};