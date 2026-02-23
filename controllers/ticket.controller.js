const db = require("../config/db");
const redis = require("../config/redis");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

// Helper to wrap db.execute in a promise
const executeQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.execute(query, params, (err, results) => {
      if (err) return reject(err);
      resolve(results); // results = rows
    });
  });
};

// Generate tickets after payment
exports.generateTicketsFromOrder = async (orderId) => {
  const items = await executeQuery("SELECT * FROM order_items WHERE order_id=?", [orderId]);
  const orders = await executeQuery("SELECT * FROM orders WHERE id=?", [orderId]);
  const order = orders[0];

  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      const ticketId = uuidv4();
      const qrToken = ticketId; // you can also generate JWT if needed

      await executeQuery(
        "INSERT INTO tickets (id, order_id, category_id, qr_token, status) VALUES (?, ?, ?, ?, 'valid')",
        [ticketId, orderId, item.category_id, qrToken]
      );

      // Cache ticket in Redis for 7 days
      await redis.set(`ticket:${ticketId}`, JSON.stringify({ status: "valid" }), "EX", 7 * 24 * 3600);
    }
  }
};

// Fetch tickets for user
exports.getUserTickets = async (req, res) => {
    const { uid } = req.params;
  try {
    const tickets = await executeQuery(
      "SELECT t.*, o.event_id FROM tickets t JOIN orders o ON t.order_id=o.id WHERE o.user_uid=?",
      [uid]
    );
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};