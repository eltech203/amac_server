const db = require("../config/db");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");
const mpesaService = require("../services/mpesa.service");

// Create Order
exports.createOrder = async (req, res) => {
  try {
    const { event_id, items, phone } = req.body; // items = [{ category_id, quantity }]
    const user_uid = req.user.uid;

    // Prevent spam orders per phone
    const lockKey = `order_lock:${phone}`;
    const exists = await redis.get(lockKey);
    if (exists)
      return res.status(429).json({ message: "Please wait before retrying" });
    await redis.set(lockKey, "locked", "EX", 60);

    // Begin transaction
    const conn = await db.getConnection();
    await conn.beginTransaction();

    const orderId = uuidv4();
    let totalAmount = 0;

    for (const item of items) {
      const [catRows] = await conn.query(
        "SELECT price, capacity, sold_count FROM ticket_categories WHERE id=? FOR UPDATE",
        [item.category_id]
      );
      if (!catRows.length) throw new Error("Category not found");

      if (catRows[0].sold_count + item.quantity > catRows[0].capacity)
        throw new Error(`Category ${item.category_id} sold out`);

      totalAmount += catRows[0].price * item.quantity;

      await conn.query(
        "UPDATE ticket_categories SET sold_count=sold_count+? WHERE id=?",
        [item.quantity, item.category_id]
      );
    }

    await conn.query(
      "INSERT INTO orders (id, event_id, user_uid, total_amount, phone, status) VALUES (?, ?, ?, ?, ?, 'pending')",
      [orderId, event_id, user_uid, totalAmount, phone]
    );

    for (const item of items) {
      await conn.query(
        "INSERT INTO order_items (id, order_id, category_id, quantity, price) VALUES (?, ?, ?, ?, ?)",
        [uuidv4(), orderId, item.category_id, item.quantity, totalAmount]
      );
    }

    await conn.commit();
    conn.release();

    // Trigger M-Pesa STK push
    const stkResponse = await mpesaService.stkPush({
      phone,
      amount: totalAmount,
      orderId,
    });

    res.json({ success: true, orderId, stkResponse });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};