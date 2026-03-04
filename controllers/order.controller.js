const db = require("../config/db");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");
const mpesaService = require("../services/mpesa.service");

// ==========================
// CREATE ORDER
// ==========================
exports.createOrder = async (req, res) => {
  const conn = await new Promise((resolve, reject) => {
    db.getConnection((err, connection) => {
      if (err) return reject(err);
      resolve(connection);
    });
  });

  let { event_id, user_uid, phone, items } = req.body;

  // Validate input
  if (!items || !items.length)
    return res.status(400).json({ error: "No seats selected" });

  const orderId = uuidv4();

  try {
    // Begin transaction
    await new Promise((resolve, reject) =>
      conn.beginTransaction(err => (err ? reject(err) : resolve()))
    );

    // 1️⃣ Lock & verify seats
    for (let seat of items) {
      if (!seat.seat_id || seat.seat_id.trim().length !== 36) {
        throw new Error(`Invalid seat id: "${seat.seat_id}"`);
      }

      const seatId = seat.seat_id.trim();
      console.log("Checking seat:", seatId);

      const [rows] = await new Promise((resolve, reject) =>
        conn.query(
          "SELECT status, price FROM seats WHERE TRIM(id)=? FOR UPDATE",
          [seatId],
          (err, results) => (err ? reject(err) : resolve(results))
        )
      );

      if (!rows.length) throw new Error(`Seat ${seatId} not found`);
      if (rows[0].status !== "available")
        throw new Error(`Seat ${seatId} is not available`);

      seat.price = rows[0].price;

      // Temporarily reserve seat
      await new Promise((resolve, reject) =>
        conn.query(
          "UPDATE seats SET status='reserved' WHERE TRIM(id)=?",
          [seatId],
          err => (err ? reject(err) : resolve())
        )
      );
    }

    // 2️⃣ Calculate total amount
    const totalAmount = items.reduce((sum, s) => sum + parseFloat(s.price), 0);

    // 3️⃣ Insert order
    await new Promise((resolve, reject) =>
      conn.query(
        "INSERT INTO orders (id, event_id, user_uid, phone, total_amount, status) VALUES (?,?,?,?,?,'pending')",
        [orderId, event_id, user_uid, phone, totalAmount],
        err => (err ? reject(err) : resolve())
      )
    );

    // 4️⃣ Insert order items
    for (let seat of items) {
      const orderItemId = uuidv4();
      await new Promise((resolve, reject) =>
        conn.query(
          "INSERT INTO order_items (id, order_id, seat_id, price) VALUES (?,?,?,?)",
          [orderItemId, orderId, seat.seat_id.trim(), seat.price],
          err => (err ? reject(err) : resolve())
        )
      );
    }

    // Commit transaction
    await new Promise((resolve, reject) =>
      conn.commit(err => (err ? reject(err) : resolve()))
    );
    conn.release();

    // 5️⃣ Trigger M-Pesa STK push
    const stkResponse = await mpesaService.stkPush({
      phone,
      amount: totalAmount,
      orderId
    });

    res.json({ success: true, orderId, stkResponse });
  } catch (err) {
    await new Promise(resolve => conn.rollback(() => resolve()));
    conn.release();
    console.error("Order creation failed:", err.message);
    res.status(400).json({ error: err.message });
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