const db = require("../config/db");
const redis = require("../config/redis");

// Helper to wrap pool.execute in a promise
const executeQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.execute(query, params, (err, results) => {
      if (err) return reject(err);
      resolve(results); // results = rows
    });
  });
};

exports.validateTicket = async (req, res) => {
  try {
    const { qr_token } = req.body;

    // Check Redis cache first
    const cached = await redis.get(`ticket:${qr_token}`);
    if (cached) {
      const ticket = JSON.parse(cached);
      if (ticket.status === "used")
        return res.json({ valid: false, message: "Ticket already used" });

      // Mark as used in Redis
      await redis.set(
        `ticket:${qr_token}`,
        JSON.stringify({ ...ticket, status: "used" })
      );

      // Update database asynchronously (fire-and-forget)
      executeQuery("UPDATE tickets SET status='used' WHERE qr_token=?", [qr_token]).catch(console.error);

      return res.json({ valid: true, message: "Access granted", source: "redis" });
    }

    // Check database if not in Redis
    const rows = await executeQuery("SELECT * FROM tickets WHERE qr_token=?", [qr_token]);
    if (!rows.length) return res.json({ valid: false, message: "Invalid ticket" });

    const ticket = rows[0];
    if (ticket.status === "used") return res.json({ valid: false, message: "Already used" });

    // Mark ticket as used
    await executeQuery("UPDATE tickets SET status='used' WHERE qr_token=?", [qr_token]);

    // Cache in Redis
    await redis.set(`ticket:${qr_token}`, JSON.stringify({ status: "used" }));

    res.json({ valid: true, message: "Access granted", source: "database" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};