const express = require('express');
const router = express.Router();

// Import controllers
const organizerCtrl = require('../controllers/organizer.controller');
const eventCtrl = require('../controllers/event.controller');
const seatCtrl = require('../controllers/seat.controller');
const orderCtrl = require('../controllers/order.controller');
const ticketCtrl = require('../controllers/ticket.controller');
const scanCtrl = require('../controllers/scan.controller');
const paymentCtrl = require('../payments/mpesa_stkPush_tickets');


// ===============================
// ORGANIZER ROUTES
// ===============================
router.post('/organizers', organizerCtrl.createOrganizer);
router.get('/organizers', organizerCtrl.getOrganizers);
// router.get('/organizers/:id', organizerCtrl.getSingleOrganizer);


// ===============================
// EVENT ROUTES
// ===============================
router.post('/events', eventCtrl.createEvent);
router.get('/events', eventCtrl.getEvents);
router.get('/events/:id', eventCtrl.getSingleEvent);
router.put('/events/:id/publish', eventCtrl.publishEvent);


// ===============================
// SEAT ROUTES
// ===============================
router.post('/seats', seatCtrl.createSeat);               // Create seat
router.get('/seats/event/:event_id', seatCtrl.getSeatsByEvent); // List seats for event
// router.put('/seats/:id/status', seatCtrl.updateSeatStatus);      // Update seat status


// ===============================
// ORDER ROUTES
// ===============================
router.post('/orders', orderCtrl.createOrder);      // Create order (select seats)
router.get('/orders', orderCtrl.getOrders);         // List all orders
// router.get('/orders/:id', orderCtrl.getSingleOrder);// Single order


// ===============================
// TICKET ROUTES
// ===============================
router.get('/tickets/user/:uid', ticketCtrl.getUserTickets);
router.get('/tickets/order/:order_id', ticketCtrl.getOrderTickets);
router.get('/tickets/:id', ticketCtrl.getSingleTicket); // Single ticket for QR display


// ===============================
// RECEIPT ROUTES
// ===============================
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
router.post('/payment/callback', paymentCtrl.callback); // No auth, called by M-Pesa
//router.post('/payment/query', paymentCtrl.accessToken, paymentCtrl.querySTK); // Optional query


module.exports = router;