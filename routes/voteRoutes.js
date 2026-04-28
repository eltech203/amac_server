const express = require("express");
const router = express.Router();

const {
  testVotesRoute,
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

router.get("/test", testVotesRoute);

router.get("/overview", getOverview);
router.get("/overview/:categoryId", getOverview);
router.get("/overall-leader", getOverallLeader);

router.get("/results", getResults);
router.get("/getVotes", getVotes);
router.get("/get-all-votes", getAllvotes);
router.get("/summary", getVotesSummary);
router.get("/resultsNominees", getNomineeResults);
router.get("/summaryCat/:categoryId", getVotesByCategoryId);
router.get("/summary/:categoryId", getVotesSummaryByCategory);
router.get("/live-results", getLiveResults);

router.get("/dashboard-total", getDashboardTotals);

router.get("/payment-summaery", getPaymentsSummary);
router.get("/payments-summary", getPaymentsSummary);

router.get("/voting-activity", getVotingActivity);

router.get("/categoty-activity", getNomineesPerCategory);
router.get("/category-activity", getNomineesPerCategory);
router.get("/nominees-per-category", getNomineesPerCategory);

router.get("/top-nominees", getTopNominees);

router.get("/vote-category", getVotesPerCategory);
router.get("/votes-per-category", getVotesPerCategory);

router.post("/clear-cache", clearVoteCacheEndpoint);

module.exports = router;