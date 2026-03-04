const db = require('../config/db');
const crypto = require('crypto');


// =======================================
// GENERATE TICKETS AFTER PAYMENT SUCCESS
// =======================================
exports.generateTickets = async (order_id) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1️⃣ Get order
    const [orders] = await connection.execute(
      "SELECT * FROM orders WHERE id=?",
      [order_id]
    );

    if (orders.length === 0) {
      throw new Error("Order not found");
    }

    const order = orders[0];

    // 2️⃣ Get seats from order_items
    const [items] = await connection.execute(
      "SELECT * FROM order_items WHERE order_id=?",
      [order_id]
    );

    if (items.length === 0) {
      throw new Error("No seats found for order");
    }

    // 3️⃣ Generate ticket per seat
    for (const item of items) {
      const qr = crypto.randomBytes(20).toString('hex');

      await connection.execute(
        `INSERT INTO tickets 
        (order_id, seat_id, user_id, event_id, qr_code) 
        VALUES (?,?,?,?,?)`,
        [
          order_id,
          item.seat_id,
          order.user_id,
          order.event_id,
          qr
        ]
      );

      // 4️⃣ Mark seat as sold
      await connection.execute(
        "UPDATE seats SET status='sold' WHERE id=?",
        [item.seat_id]
      );
    }

    await connection.commit();
    return true;

  } catch (error) {
    await connection.rollback();
    console.error(error);
    return false;
  } finally {
    connection.release();
  }
};


// =======================================
// GET USER TICKETS
// =======================================
exports.getUserTickets = async (req, res) => {
  try {
    const { uid } = req.params;

    const [tickets] = await db.execute(`
      SELECT 
        t.id,
        t.qr_code,
        t.status,
        e.title AS event_name,
        s.row_number,
        s.seat_number
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      JOIN seats s ON t.seat_id = s.id
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC
    `, [uid]);

    res.json({
      success: true,
      tickets
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// =======================================
// GET TICKETS BY ORDER
// =======================================
exports.getOrderTickets = async (req, res) => {
  try {
    const { order_id } = req.params;

    const [tickets] = await db.execute(`
      SELECT 
        t.id,
        t.qr_code,
        t.status,
        s.row_number,
        s.seat_number
      FROM tickets t
      JOIN seats s ON t.seat_id = s.id
      WHERE t.order_id = ?
    `, [order_id]);

    res.json({
      success: true,
      tickets
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// =======================================
// GET SINGLE TICKET (FOR QR DISPLAY)
// =======================================
exports.getSingleTicket = async (req, res) => {
  try {
    const { id } = req.params;

    const [ticket] = await db.execute(`
      SELECT 
        t.*,
        e.title AS event_name,
        s.row_number,
        s.seat_number
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      JOIN seats s ON t.seat_id = s.id
      WHERE t.id = ?
    `, [id]);

    if (ticket.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.json({
      success: true,
      ticket: ticket[0]
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};