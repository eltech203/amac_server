const db = require("../config/db");
const redis = require("../config/redis");

exports.validateTicket = async (req, res) => {
  try {
    const { qr_token } = req.body;

    const cached = await redis.get(`ticket:${qr_token}`);
    if (cached) {
      const ticket = JSON.parse(cached);
      if (ticket.status === "used") return res.json({ valid: false, message: "Ticket already used" });

      await redis.set(`ticket:${qr_token}`, JSON.stringify({ ...ticket, status: "used" }));
      db.execute("UPDATE tickets SET status='used' WHERE qr_token=?", [qr_token]);
      return res.json({ valid: true, message: "Access granted", source: "redis" });
    }

    const [rows] = await db.execute("SELECT * FROM tickets WHERE qr_token=?", [qr_token]);
    if (!rows.length) return res.json({ valid: false, message: "Invalid ticket" });

    if (rows[0].status === "used") return res.json({ valid: false, message: "Already used" });

    await db.execute("UPDATE tickets SET status='used' WHERE qr_token=?", [qr_token]);
    await redis.set(`ticket:${qr_token}`, JSON.stringify({ status: "used" }));
    res.json({ valid: true, message: "Access granted", source: "database" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};