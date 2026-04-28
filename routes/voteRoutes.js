const express = require("express");
const router = express.Router();

const {
  getResults,
  getVotes,
  getVotesSummary,
  getNomineeResults,
  getVotesByCategoryId,
  getVotesSummaryByCategory,
  getLiveResults,
  getOverview,
  getOverallLeader,
  getAllvotes,
  getDashboardTotals,
  getPaymentsSummary,
  getVotingActivity,
  getTopNominees,
  getVotesPerCategory,
  getNomineesPerCategory,
  clearVoteCacheEndpoint
} = require("../controllers/voteControllers.js");

/**
 * ✅ Main live results endpoints
 * Frontend should use these:
 * GET /api/votes/overview
 * GET /api/votes/overview/:categoryId
 */
router.get("/overview", getOverview);
router.get("/overview/:categoryId", getOverview);

/**
 * ✅ Overall leader endpoint
 */
router.get("/overall-leader", getOverallLeader);

/**
 * ✅ Backward-compatible old routes
 */
router.get("/results", getResults);
router.get("/getVotes", getVotes);
router.get("/get-all-votes", getAllvotes);
router.get("/summary", getVotesSummary);
router.get("/resultsNominees", getNomineeResults);
router.get("/summaryCat/:categoryId", getVotesByCategoryId);
router.get("/summary/:categoryId", getVotesSummaryByCategory);
router.get("/live-results", getLiveResults);

/**
 * ✅ Dashboard/admin routes
 */
router.get("/dashboard-total", getDashboardTotals);
router.get("/payment-summaery", getPaymentsSummary); // keep old typo route
router.get("/payments-summary", getPaymentsSummary); // clean route also

router.get("/voting-activity", getVotingActivity);

router.get("/categoty-activity", getNomineesPerCategory); // keep old typo route
router.get("/category-activity", getNomineesPerCategory); // clean route also
router.get("/nominees-per-category", getNomineesPerCategory);

router.get("/top-nominees", getTopNominees);

router.get("/vote-category", getVotesPerCategory); // old route
router.get("/votes-per-category", getVotesPerCategory); // clean route also

/**
 * ✅ Optional admin/manual cache clear
 * POST /api/votes/clear-cache
 */
router.post("/clear-cache", clearVoteCacheEndpoint);

module.exports = router;