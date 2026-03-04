const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");

exports.createSeat = (req, res) => {
  const { event_id, section, row_no, seat_no, price } = req.body;

  const id = uuidv4();

  db.query(
    "INSERT INTO seats (id,event_id,section,row_no,seat_no,price) VALUES (?,?,?,?,?,?)",
    [id, event_id, section, row_no, seat_no, price],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "Seat created" });
    }
  );
};

exports.getSeatsByEvent = (req, res) => {
  db.query(
    "SELECT * FROM seats WHERE event_id=?",
    [req.params.event_id],
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results);
    }
  );
};
