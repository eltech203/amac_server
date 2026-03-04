const express = require('express');
const router = express.Router();

// Import controllers
const organizerCtrl = require('../controllers/organizer.controller');
const eventCtrl = require('../controllers/event.controller');
const seatCtrl = require('../controllers/seat.controller');
const orderCtrl = require('../controllers/order.controller');
const ticketCtrl = require('../controllers/ticket.controller');
const scanCtrl = require('../controllers/scan.controller');
const paymentCtrl = require('../controllers/payment.controller');


// ===============================
// ORGANIZER ROUTES
// ===============================
router.post('/organizers/create', organizerCtrl.createOrganizer);
router.get('/organizers', organizerCtrl.getOrganizers);
router.get('/organizers/:id', organizerCtrl.getSingleOrganizer);


// ===============================
// EVENT ROUTES
// ===============================
router.post('/events', eventCtrl.createEvent);
router.get('/events', eventCtrl.getEvents);
router.get('/events/:id', eventCtrl.getSingleEvent);
router.put('/events/:id/publish', eventCtrl.publishEvent);


// ===============================
// SEAT ROUTES (NEW)
// ===============================
// Create seats (admin)
router.post('/seats/create', seatCtrl.createSeat);

// Get seats by event
router.get('/seats/event/:event_id', seatCtrl.getSeatsByEvent);

// Update seat status (optional admin tool)
router.put('/seats/:id/status', seatCtrl.updateSeatStatus);


// ===============================
// ORDER ROUTES
// ===============================
// Create order (select seats)
router.post('/orders', orderCtrl.createOrder);

// Get all orders
router.get('/orders', orderCtrl.getOrders);

// Get single order
router.get('/orders/:id', orderCtrl.getSingleOrder);


// ===============================
// TICKET ROUTES
// ===============================
// Get tickets for a user
router.get('/tickets/user/:uid', ticketCtrl.getUserTickets);

// Get tickets for an order
router.get('/tickets/order/:order_id', ticketCtrl.getOrderTickets);


// // ===============================
// // RECEIPT ROUTES (NEW)
// // ===============================
// router.get('/receipts/:payment_id', receiptCtrl.getReceiptByPayment);
// router.get('/receipts/order/:order_id', receiptCtrl.getReceiptByOrder);


// ===============================
// SCAN / GATE ROUTES
// ===============================
router.post('/scan/validate', scanCtrl.validateTicket);


// ===============================
// PAYMENT ROUTES
// ===============================
router.post('/payment/stk-push', paymentCtrl.accessToken, paymentCtrl.stkPush);

// ⚠️ NO AUTH — called by M-Pesa
router.post('/payment/callback', paymentCtrl.callback);

module.exports = router;