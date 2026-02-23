const express = require('express');
const router = express.Router();

// Import controllers
const organizerCtrl = require('../controllers/organizer.controller');
const eventCtrl = require('../controllers/event.controller');
const categoryCtrl = require('../controllers/category.controller.ticket');
const orderCtrl = require('../controllers/order.controller');
const ticketCtrl = require('../controllers/ticket.controller');
const scanCtrl = require('../controllers/scan.controller');
const paymentCtrl = require('../controllers/payment.controller');

// Auth middleware
const auth = require('../middlewares/auth');

// ===============================
// ORGANIZER ROUTES
// ===============================
router.post('/organizers', organizerCtrl.createOrganizer); // Optional: admin only
router.get('/organizers', organizerCtrl.getOrganizers);

// ===============================
// EVENT ROUTES
// ===============================
router.post('/events', eventCtrl.createEvent);
router.get('/events', eventCtrl.getEvents); // public
router.get('/events/:id', eventCtrl.getSingleEvent);
router.put('/events/:id/publish', eventCtrl.publishEvent);

// // Organizer-specific events
// router.get('/events/organizer', auth("organizer"), async (req, res) => {
//   const events = await db.execute("SELECT * FROM events WHERE organizer_id=?", [req.user.uid]);
//   res.json(events[0]);
// });

// ===============================
// TICKET CATEGORY ROUTES
// ===============================
router.post('/categories',  categoryCtrl.createCategory);
router.get('/categories/:eventId', categoryCtrl.getCategoriesByEvent);

// ===============================
// ORDER ROUTES
// ===============================
router.post('/orders',  orderCtrl.createOrder);

// ===============================
// TICKET ROUTES
// ===============================
router.get('/tickets', ticketCtrl.getUserTickets);

// ===============================
// SCAN / GATE ROUTES
// ===============================
router.post('/scan/validate', scanCtrl.validateTicket);

// ===============================
// PAYMENT ROUTES
// ===============================
router.post('/payments/mpesa/stk-push', paymentCtrl.initiateSTK);
router.post('/payments/mpesa/callback', paymentCtrl.mpesaCallback); // no auth, called by M-Pesa

module.exports = router;