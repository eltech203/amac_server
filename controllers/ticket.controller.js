const db = require("../config/db");
const crypto = require("crypto");


// ======================================================
// GENERATE TICKETS AFTER PAYMENT SUCCESS
// ======================================================
exports.generateTickets = async (req, res) => {
 const { order_id } = req.body;
  const connection = await new Promise((resolve, reject) => {
    db.getConnection((err, conn) => {
      if (err) return reject(err);
      resolve(conn);
    });
  });

  try {

    await new Promise((resolve, reject) =>
      connection.beginTransaction(err => err ? reject(err) : resolve())
    );

    // 1️⃣ Get order
    const orders = await new Promise((resolve, reject) =>
      connection.query(
        "SELECT * FROM orders WHERE id=?",
        [order_id],
        (err, rows) => err ? reject(err) : resolve(rows)
      )
    );

    if (!orders.length) throw new Error("Order not found");

    const order = orders[0];


    // 2️⃣ Get seats for this order
    const items = await new Promise((resolve, reject) =>
      connection.query(
        "SELECT * FROM order_items WHERE order_id=?",
        [order_id],
        (err, rows) => err ? reject(err) : resolve(rows)
      )
    );

    if (!items.length) throw new Error("No seats found for this order");


    // 3️⃣ Generate ticket for each seat
    for (const item of items) {

      const qr_code = crypto.randomBytes(20).toString("hex");

      await new Promise((resolve, reject) =>
        connection.query(
          `INSERT INTO tickets
          (order_id, seat_id, user_id, event_id, qr_code, status)
          VALUES (?,?,?,?,?,'valid')`,
          [
            order_id,
            item.seat_id,
            order.user_uid,
            order.event_id,
            qr_code
          ],
          err => err ? reject(err) : resolve()
        )
      );


      // 4️⃣ Mark seat sold
      await new Promise((resolve, reject) =>
        connection.query(
          "UPDATE seats SET status='sold' WHERE id=?",
          [item.seat_id],
          err => err ? reject(err) : resolve()
        )
      );

    }

    await new Promise((resolve, reject) =>
      connection.commit(err => err ? reject(err) : resolve())
    );

    console.log("🎟 Tickets generated for order:", order_id);

    return true;

  } catch (error) {

    await new Promise(resolve => connection.rollback(() => resolve()));

    console.error("Ticket generation failed:", error);

    return false;

  } finally {

    connection.release();

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