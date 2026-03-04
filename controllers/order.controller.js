const db = require("../config/db");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");
const mpesaService = require("../services/mpesa.service");

// ==========================
// CREATE ORDER
// ==========================
exports.createOrder = async (req, res) => {
  const { event_id, user_uid, phone, items } = req.body;

  if (!items || !items.length)
    return res.status(400).json({ error: "No seats selected" });

  const orderId = uuidv4();

  try {
    // 1️⃣ Calculate total amount from frontend prices
    const totalAmount = items.reduce((sum, s) => sum + parseFloat(s.price), 0);

    console.log("Creating order:", { orderId, event_id, user_uid, phone, totalAmount });
    // 2️⃣ Insert order
    await new Promise((resolve, reject) =>
      db.query(
        "INSERT INTO orders (id, event_id, user_uid, phone, total_amount, status) VALUES (?,?,?,?,?,'pending')",
        [orderId, event_id, user_uid, phone, totalAmount],
        (err) => (err ? reject(err) : resolve())
      )
    );

    // 3️⃣ Insert order items
    for (let seat of items) {
      const orderItemId = uuidv4();
      await new Promise((resolve, reject) =>
        db.query(
          "INSERT INTO order_items (id, order_id, seat_id, price) VALUES (?,?,?,?)",
          [orderItemId, orderId, seat.seat_id, seat.price],
          (err) => (err ? reject(err) : resolve())
        )
      );
    }

    // 4️⃣ Trigger M-Pesa STK push
    const stkResponse = await mpesaService.stkPush({
      phone,
      amount: totalAmount,
      orderId
    });

    res.json({ success: true, orderId, stkResponse });
  } catch (err) {
    console.error("Order creation failed:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ==========================
// GET ALL ORDERS
// ==========================
exports.getOrders = (req, res) => {
  db.query("SELECT * FROM orders ORDER BY created_at DESC", (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
};

// ==========================
// GET SINGLE ORDER WITH SEATS
// ==========================
exports.getSingleOrder = (req, res) => {
  const { id } = req.params;
  db.query(
    `SELECT o.*, oi.seat_id, s.row_no, s.seat_no, s.price
     FROM orders o
     JOIN order_items oi ON o.id = oi.order_id
     JOIN seats s ON oi.seat_id = s.id
     WHERE o.id = ?`,
    [id],
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results);
    }
  );
};