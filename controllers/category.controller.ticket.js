const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const redis = require("../config/redis");

// Create Category for Event
exports.createCategory = async (req, res) => {
  try {
    const { event_id, name, price, capacity } = req.body;
    const id = uuidv4();

    await db.execute(
      "INSERT INTO ticket_categories (id, event_id, name, price, capacity) VALUES (?, ?, ?, ?, ?)",
      [id, event_id, name, price, capacity]
    );

    // Optional cache per event categories
    await redis.del(`categories:${event_id}`);

    res.json({ success: true, categoryId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get categories per event (cached)
exports.getCategoriesByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const cacheKey = `categories:${eventId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const [rows] = await db.execute(
      "SELECT * FROM ticket_categories WHERE event_id=?",
      [eventId]
    );

    await redis.set(cacheKey, JSON.stringify(rows), "EX", 300); // 5min
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};