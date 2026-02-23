const db = require("../config/db");
const redis = require("../config/redis");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

// Generate tickets after payment
exports.generateTicketsFromOrder = async (orderId) => {
  const [items] = await db.execute("SELECT * FROM order_items WHERE order_id=?", [orderId]);
  const [order] = await db.execute("SELECT * FROM orders WHERE id=?", [orderId]);

  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      const ticketId = uuidv4();
      const qrToken = ticketId; // or JWT token

      await db.execute(
        "INSERT INTO tickets (id, order_id, category_id, qr_token, status) VALUES (?, ?, ?, ?, 'valid')",
        [ticketId, orderId, item.category_id, qrToken]
      );

      await redis.set(`ticket:${ticketId}`, JSON.stringify({ status: "valid" }), "EX", 7*24*3600);
    }
  }
};

// Fetch tickets for user
exports.getUserTickets = async (req, res) => {
  try {
    const [tickets] = await db.execute(
      "SELECT t.*, o.event_id FROM tickets t JOIN orders o ON t.order_id=o.id WHERE o.user_uid=?",
      [req.user.uid]
    );
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};