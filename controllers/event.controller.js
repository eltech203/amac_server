const db = require("../config/db"); // keep your current db.js
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");

// Helper to wrap pool.execute in a promise
const executeQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.execute(query, params, (err, results) => {
      if (err) return reject(err);
      resolve(results); // results = rows
    });
  });
};

// Create Event (Organizer)
exports.createEvent = async (req, res) => {
  try {
    const { title, description, venue, event_date } = req.body;
    const organizer_id = req.user.uid;
    const id = uuidv4();

    await executeQuery(
      "INSERT INTO events (id, organizer_id, title, description, venue, event_date, status) VALUES (?, ?, ?, ?, ?, ?, 'draft')",
      [id, organizer_id, title, description, venue, event_date]
    );

    res.json({ success: true, eventId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all active events (cached)
exports.getEvents = async (req, res) => {
  try {
    const cached = await redis.get("events:active");
    if (cached) return res.json(JSON.parse(cached));

    const rows = await executeQuery(
      "SELECT * FROM events WHERE status='published' ORDER BY event_date DESC"
    );

    await redis.set("events:active", JSON.stringify(rows), "EX", 300); // 5 min cache
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get single event
exports.getSingleEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await executeQuery("SELECT * FROM events WHERE id=?", [id]);
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Publish Event
exports.publishEvent = async (req, res) => {
  try {
    const { id } = req.params;
    await executeQuery("UPDATE events SET status='published' WHERE id=?", [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};