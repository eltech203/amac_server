const db = require("../config/db");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");


// ======================================================
// GENERATE TICKETS AFTER PAYMENT SUCCESS
// ======================================================
// ======================================================
// GENERATE TICKETS AFTER PAYMENT SUCCESS
// ======================================================
exports.generateTickets = (req, res) => {

  const { order_id ,user_id,event_id} = req.body;

  if (!order_id) {
    return res.status(400).json({
      success: false,
      message: "order_id is required"
    });
  }

  db.getConnection((err, connection) => {

    if (err) {
      return res.status(500).json({ error: err.message });
    }

    connection.beginTransaction((err) => {

      if (err) {
        connection.release();
        return res.status(500).json({ error: err.message });
      }

      // 1️⃣ get seats for order
      connection.query(
        "SELECT seat_id FROM order_items WHERE order_id = ?",
        [order_id],
        (err, items) => {

          if (err) {
            return connection.rollback(() => {
              connection.release();
              res.status(500).json({ error: err.message });
            });
          }

          if (!items.length) {
            return connection.rollback(() => {
              connection.release();
              res.status(400).json({
                success: false,
                message: "No seats found for this order"
              });
            });
          }

          const tickets = [];
          let completed = 0;

          items.forEach((item) => {

            const ticketId = uuidv4();
            const qrToken = crypto.randomBytes(20).toString("hex");

            // 2️⃣ insert ticket
            connection.query(
              `INSERT INTO tickets
              (id, order_id, user_id,event_id, seat_id, qr_token,qr_code, status)
              VALUES (?,?,?,?,?,?,?,?)`,
              [
                ticketId,
                order_id,
                user_id,
                event_id,
                item.seat_id,
                qrToken,
                qrToken,
                "valid"
              ],
              (err) => {

                if (err) {
                  return connection.rollback(() => {
                    connection.release();
                    res.status(500).json({ error: err.message });
                  });
                }

                // 3️⃣ mark seat sold
                connection.query(
                  "UPDATE seats SET status='sold' WHERE id=?",
                  [item.seat_id],
                  (err) => {

                    if (err) {
                      return connection.rollback(() => {
                        connection.release();
                        res.status(500).json({ error: err.message });
                      });
                    }

                    tickets.push({
                      ticket_id: ticketId,
                      seat_id: item.seat_id,
                      qr_token: qrToken,
                      status: "valid"
                    });

                    completed++;

                    // when all seats processed
                    if (completed === items.length) {

                      connection.commit((err) => {

                        if (err) {
                          return connection.rollback(() => {
                            connection.release();
                            res.status(500).json({ error: err.message });
                          });
                        }

                        connection.release();

                        return res.json({
                          success: true,
                          message: "Tickets generated successfully",
                          order_id,
                          tickets
                        });

                      });

                    }

                  }
                );

              }
            );

          });

        }
      );

    });

  });

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