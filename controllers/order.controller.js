const db = require("../config/db");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");
const mpesaService = require("../services/mpesa.service");

// Helper to wrap queries in a promise
const executeQuery = (conn, query, params = []) => {
  return new Promise((resolve, reject) => {
    const executor = conn ? conn.query.bind(conn) : db.execute.bind(db);
    executor(query, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
};

// Create Order
exports.createOrder = async (req, res) => {
  let conn;
  try {
    const { event_id, items, phone, user_uid } = req.body; // items = [{ category_id, quantity }]

    // Prevent spam orders per phone
    const lockKey = `order_lock:${phone}`;
    const exists = await redis.get(lockKey);
    if (exists)
      return res.status(405).json({ message: "Please wait before retrying" });
    await redis.set(lockKey, "locked", "EX", 60);

    // Get connection
    conn = await new Promise((resolve, reject) => {
      db.getConnection((err, connection) => {
        if (err) return reject(err);
        resolve(connection);
      });
    });

    await executeQuery(conn, "START TRANSACTION");

    const orderId = uuidv4();
    let totalAmount = 0;

    // 1️⃣ First, calculate totalAmount and update ticket sold_count
    for (const item of items) {
      const catRows = await executeQuery(
        conn,
        "SELECT price, capacity, sold_count FROM ticket_categories WHERE id=? FOR UPDATE",
        [item.category_id]
      );
      if (!catRows.length) throw new Error("Category not found");

      const category = catRows[0];
      if (category.sold_count + item.quantity > category.capacity)
        throw new Error(`Category ${item.category_id} sold out`);

      totalAmount += category.price * item.quantity;

      await executeQuery(
        conn,
        "UPDATE ticket_categories SET sold_count=sold_count+? WHERE id=?",
        [item.quantity, item.category_id]
      );
    }

    // 2️⃣ Insert the order **before** order_items
    await executeQuery(
      conn,
      "INSERT INTO orders (id, event_id, user_uid, total_amount, phone, status) VALUES (?, ?, ?, ?, ?, 'pending')",
      [orderId, event_id, user_uid, totalAmount, phone]
    );

    // 3️⃣ Insert all order_items
    for (const item of items) {
      const catRows = await executeQuery(
        conn,
        "SELECT price FROM ticket_categories WHERE id=?",
        [item.category_id]
      );
      const price = catRows[0].price;
      await executeQuery(
        conn,
        "INSERT INTO order_items (id, order_id, category_id, quantity, price) VALUES (?, ?, ?, ?, ?)",
        [uuidv4(), orderId, item.category_id, item.quantity, price]
      );
    }

    await executeQuery(conn, "COMMIT");
    conn.release();

    // Trigger M-Pesa STK push
    const stkResponse = await mpesaService.stkPush({
      phone,
      amount: totalAmount,
      orderId,
    });

    res.json({ success: true, orderId, stkResponse });
  } catch (err) {
    if (conn) {
      await executeQuery(conn, "ROLLBACK").catch(() => {});
      conn.release();
    }
    res.status(400).json({ error: err.message });
  }
};