const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");

exports.createOrder = (req, res) => {
  const { event_id, user_uid, phone, total_amount } = req.body;

  const id = uuidv4();

  db.query(
    "INSERT INTO orders (id,event_id,user_uid,phone,total_amount,status) VALUES (?,?,?,?,?,'pending')",
    [id, event_id, user_uid, phone, total_amount],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "Order created", order_id: id });
    }
  );
};

exports.getOrders = (req, res) => {
  db.query("SELECT * FROM orders", (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
};