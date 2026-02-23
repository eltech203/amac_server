const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");

// Create Organizer (Admin only)
exports.createOrganizer = async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const id = uuidv4();

    await db.execute(
      "INSERT INTO organizers (id, name, email, phone) VALUES (?, ?, ?, ?)",
      [id, name, email, phone]
    );

    res.json({ success: true, organizerId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// List all organizers
exports.getOrganizers = async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM organizers");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};