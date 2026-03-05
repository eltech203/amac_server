const db = require("../config/db");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");


// ======================================================
// GENERATE TICKETS AFTER PAYMENT SUCCESS
// ======================================================
// ======================================================
// GENERATE TICKETS AFTER PAYMENT SUCCESS
// ======================================================
exports.generateTickets = async (req, res) => {

  const { order_id } = req.body;

  if (!order_id) {
    return res.status(400).json({
      success: false,
      message: "order_id is required"
    });
  }

  const connection = await db.getConnection();

  try {

    await connection.beginTransaction();

    // 1️⃣ Get seats for the order
    const [items] = await connection.execute(
      "SELECT seat_id FROM order_items WHERE order_id = ?",
      [order_id]
    );

    if (!items.length) {
      throw new Error("No seats found for this order");
    }

    const tickets = [];

    // 2️⃣ Generate ticket per seat
    for (const item of items) {

      const ticketId = uuidv4();
      const qrToken = crypto.randomBytes(20).toString("hex");

      await connection.execute(
        `INSERT INTO tickets
        (id, order_id, seat_id, qr_token, status)
        VALUES (?,?,?,?,?)`,
        [
          ticketId,
          order_id,
          item.seat_id,
          qrToken,
          "valid"
        ]
      );

      // mark seat as sold
      await connection.execute(
        "UPDATE seats SET status='sold' WHERE id = ?",
        [item.seat_id]
      );

      tickets.push({
        ticket_id: ticketId,
        seat_id: item.seat_id,
        qr_token: qrToken,
        status: "valid"
      });
    }

    await connection.commit();
    connection.release();

    return res.json({
      success: true,
      message: "Tickets generated successfully",
      order_id,
      tickets
    });

  } catch (err) {

    await connection.rollback();
    connection.release();

    console.error("Ticket generation failed:", err);

    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// ======================================================
// GET USER TICKETS
// ======================================================
exports.getUserTickets = (req, res) => {

  const { uid } = req.params;

  db.query(
    `
    SELECT 
      t.id,
      t.qr_code,
      t.status,
      e.name AS event_name,
      s.row_no,
      s.seat_no
    FROM tickets t
    JOIN events e ON t.event_id = e.id
    JOIN seats s ON t.seat_id = s.id
    WHERE t.user_id = ?
    ORDER BY t.created_at DESC
    `,
    [uid],
    (err, results) => {

      if (err) return res.status(500).json({ error: err.message });

      res.json({
        success: true,
        tickets: results
      });

    }
  );

};



// ======================================================
// GET TICKETS BY ORDER
// ======================================================
exports.getOrderTickets = (req, res) => {

  const { order_id } = req.params;

  db.query(
    `
    SELECT 
      t.id,
      t.qr_code,
      t.status,
      s.row_no,
      s.seat_no
    FROM tickets t
    JOIN seats s ON t.seat_id = s.id
    WHERE t.order_id = ?
    `,
    [order_id],
    (err, results) => {

      if (err) return res.status(500).json({ error: err.message });

      res.json({
        success: true,
        tickets: results
      });

    }
  );

};



// ======================================================
// GET SINGLE TICKET (QR DISPLAY)
// ======================================================
exports.getSingleTicket = (req, res) => {

  const { id } = req.params;

  db.query(
    `
    SELECT 
      t.*,
      e.name AS event_name,
      s.row_no,
      s.seat_no
    FROM tickets t
    JOIN events e ON t.event_id = e.id
    JOIN seats s ON t.seat_id = s.id
    WHERE t.id = ?
    `,
    [id],
    (err, results) => {

      if (err) return res.status(500).json({ error: err.message });

      if (!results.length) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      res.json({
        success: true,
        ticket: results[0]
      });

    }
  );

};