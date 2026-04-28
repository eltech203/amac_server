const db = require("../config/db.js");
const redisClient = require("../config/redis.js");

/**
 * Cache settings
 */
const LIVE_RESULTS_TTL = 60; // 1 minute
const DASHBOARD_TTL = 60;
const CHART_TTL = 60;
const RAW_VOTES_TTL = 60;

/**
 * Helpers
 */
function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

async function safeRedisGet(key) {
  try {
    return await redisClient.get(key);
  } catch (err) {
    console.error("Redis GET error:", err.message);
    return null;
  }
}

async function safeRedisSetEx(key, ttl, value) {
  try {
    await redisClient.setEx(key, ttl, value);
  } catch (err) {
    console.error("Redis SETEX error:", err.message);
  }
}

async function safeRedisDel(key) {
  try {
    await redisClient.del(key);
  } catch (err) {
    console.error(`Redis DEL error for ${key}:`, err.message);
  }
}

/**
 * Clear vote-related caches.
 * Call this after a successful vote insert/payment callback.
 */
async function clearVoteCaches(categoryId = null) {
  const keys = [
    "votes:overview:all",
    "votes:overall_leader",
    "votes:totals",
    "votes:payments_summary",
    "votes:activity:hourly",
    "nominees:per-category",
    "votes:top_nominees",
    "votes:votes_per_category",
    "votes:summary",
    "votes:raw",
    "live_results:all",
    "nominee_results",
    "election_results",
  ];

  if (categoryId) {
    keys.push(`votes:overview:category:${categoryId}`);
    keys.push(`votes:summary:${categoryId}`);
    keys.push(`votes:${categoryId}`);
    keys.push(`live_results:${categoryId}`);
  }

  await Promise.all(keys.map((key) => safeRedisDel(key)));
}

exports.clearVoteCaches = clearVoteCaches;

/**
 * MAIN LIVE RESULTS ENDPOINT
 *
 * GET /api/votes/overview
 * GET /api/votes/overview/:categoryId
 *
 * Response:
 * {
 *   success: true,
 *   refreshed_every_seconds: 60,
 *   lastFetchedAt: "...",
 *   grand_total_votes: 100,
 *   category_count: 2,
 *   results: [...]
 * }
 */
exports.getOverview = async (req, res) => {
  try {
    const categoryId = req.params.categoryId || null;

    const cacheKey = categoryId
      ? `votes:overview:category:${categoryId}`
      : "votes:overview:all";

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const sql = `
      SELECT
        c.id AS category_id,
        c.name AS category_name,

        n.id AS nominee_id,
        n.name AS nominee_name,
        n.location,
        n.church,
        n.county,

        IFNULL(SUM(v.vote_count), 0) AS votes

      FROM categories c
      LEFT JOIN nominees n ON n.category_id = c.id
      LEFT JOIN votes v ON v.candidate_id = n.id

      ${categoryId ? "WHERE c.id = ?" : ""}

      GROUP BY
        c.id,
        c.name,
        n.id,
        n.name,
        n.location,
        n.church,
        n.county

      ORDER BY
        c.name ASC,
        votes DESC,
        n.name ASC
    `;

    const params = categoryId ? [categoryId] : [];
    const [rows] = await db.promise().query(sql, params);

    const categoryMap = new Map();
    let grandTotalVotes = 0;
    const generatedAt = new Date().toISOString();

    for (const row of rows) {
      if (!categoryMap.has(row.category_id)) {
        categoryMap.set(row.category_id, {
          category_id: row.category_id,
          category_name: row.category_name,
          total_votes: 0,
          category_percentage: 0,
          leader_nominee_id: null,
          leader_name: null,
          lastFetchedAt: generatedAt,
          nominees: [],
        });
      }

      const category = categoryMap.get(row.category_id);

      // Protect empty categories with no nominees
      if (row.nominee_id) {
        const votes = Number(row.votes || 0);

        category.nominees.push({
          nominee_id: row.nominee_id,
          nominee_name: row.nominee_name,
          location: row.location,
          church: row.church,
          county: row.county,
          votes,
          total_votes: votes,
          percentage: 0,
          is_leader: false,
          rank: null,
        });

        category.total_votes += votes;
        grandTotalVotes += votes;
      }
    }

    const results = [];

    for (const category of categoryMap.values()) {
      category.nominees.sort((a, b) => {
        return (
          b.votes - a.votes ||
          String(a.nominee_name || "").localeCompare(String(b.nominee_name || ""))
        );
      });

      const maxVotes = category.nominees.length ? category.nominees[0].votes : 0;

      category.nominees = category.nominees.map((nominee, index) => {
        nominee.rank = index + 1;

        nominee.percentage =
          category.total_votes > 0
            ? round2((nominee.votes / category.total_votes) * 100)
            : 0;

        nominee.is_leader = nominee.votes === maxVotes && maxVotes > 0;

        return nominee;
      });

      const leader = category.nominees.find((n) => n.is_leader);

      if (leader) {
        category.leader_nominee_id = leader.nominee_id;
        category.leader_name = leader.nominee_name;
      }

      category.category_percentage =
        grandTotalVotes > 0
          ? round2((category.total_votes / grandTotalVotes) * 100)
          : 0;

      results.push(category);
    }

    const payload = {
      success: true,
      refreshed_every_seconds: LIVE_RESULTS_TTL,
      lastFetchedAt: generatedAt,
      grand_total_votes: grandTotalVotes,
      category_count: results.length,
      results,
    };

    await safeRedisSetEx(cacheKey, LIVE_RESULTS_TTL, JSON.stringify(payload));

    return res.json(payload);
  } catch (err) {
    console.error("❌ Error in getOverview:", err);
    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};

/**
 * GET /api/votes/overall-leader
 */
exports.getOverallLeader = async (req, res) => {
  try {
    const cacheKey = "votes:overall_leader";

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const [rows] = await db.promise().query(`
      SELECT
        c.id AS category_id,
        c.name AS category_name,

        n.id AS nominee_id,
        n.name AS nominee_name,
        n.location,
        n.church,
        n.county,

        IFNULL(SUM(v.vote_count), 0) AS total_votes

      FROM nominees n
      JOIN categories c ON n.category_id = c.id
      LEFT JOIN votes v ON v.candidate_id = n.id

      GROUP BY
        c.id,
        c.name,
        n.id,
        n.name,
        n.location,
        n.church,
        n.county

      ORDER BY total_votes DESC, n.name ASC
      LIMIT 1
    `);

    const leader = rows[0] || null;

    const payload = {
      success: true,
      leader,
      lastFetchedAt: new Date().toISOString(),
    };

    await safeRedisSetEx(cacheKey, LIVE_RESULTS_TTL, JSON.stringify(payload));

    return res.json(payload);
  } catch (err) {
    console.error("❌ Error fetching overall leader:", err);
    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};

/**
 * GET /api/votes/live-results
 * GET /api/votes/live-results?category_id=1
 *
 * Kept for backward compatibility.
 */
exports.getLiveResults = async (req, res) => {
  try {
    const categoryId = req.query.category_id || null;

    req.params.categoryId = categoryId;

    return exports.getOverview(req, res);
  } catch (err) {
    console.error("❌ Error fetching live results:", err);
    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};

/**
 * GET /api/votes/summary
 *
 * Similar to overview but returns only results array.
 */
exports.getVotesSummary = async (req, res) => {
  try {
    const cacheKey = "votes:summary";

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const fakeReq = {
      params: {},
    };

    let payload = null;

    const fakeRes = {
      json(data) {
        payload = data;
      },
      status(code) {
        return {
          json(data) {
            payload = {
              statusCode: code,
              ...data,
            };
          },
        };
      },
    };

    await exports.getOverview(fakeReq, fakeRes);

    const results = payload && payload.results ? payload.results : [];

    await safeRedisSetEx(cacheKey, LIVE_RESULTS_TTL, JSON.stringify(results));

    return res.json(results);
  } catch (err) {
    console.error("❌ Error fetching votes summary:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * GET /api/votes/summary/:categoryId
 */
exports.getVotesSummaryByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const cacheKey = `votes:summary:${categoryId}`;

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const fakeReq = {
      params: {
        categoryId,
      },
    };

    let payload = null;

    const fakeRes = {
      json(data) {
        payload = data;
      },
      status(code) {
        return {
          json(data) {
            payload = {
              statusCode: code,
              ...data,
            };
          },
        };
      },
    };

    await exports.getOverview(fakeReq, fakeRes);

    const results = payload && payload.results ? payload.results : [];

    await safeRedisSetEx(cacheKey, LIVE_RESULTS_TTL, JSON.stringify(results));

    return res.json(results);
  } catch (err) {
    console.error("❌ Error fetching category votes summary:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * GET /api/votes/category/:categoryId
 *
 * Returns one category object.
 */
exports.getVotesByCategoryId = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const cacheKey = `votes:category:${categoryId}`;

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const fakeReq = {
      params: {
        categoryId,
      },
    };

    let payload = null;

    const fakeRes = {
      json(data) {
        payload = data;
      },
      status(code) {
        return {
          json(data) {
            payload = {
              statusCode: code,
              ...data,
            };
          },
        };
      },
    };

    await exports.getOverview(fakeReq, fakeRes);

    const result =
      payload && payload.results && payload.results.length
        ? payload.results[0]
        : null;

    if (!result) {
      return res.status(404).json({
        message: "Category not found or no nominees",
      });
    }

    await safeRedisSetEx(cacheKey, LIVE_RESULTS_TTL, JSON.stringify(result));

    return res.json(result);
  } catch (err) {
    console.error("❌ Error fetching votes by category:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * GET /api/votes/nominee-results
 *
 * Kept for old frontend compatibility.
 */
exports.getNomineeResults = async (req, res) => {
  try {
    const cacheKey = "nominee_results";

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const fakeReq = {
      params: {},
    };

    let payload = null;

    const fakeRes = {
      json(data) {
        payload = data;
      },
      status(code) {
        return {
          json(data) {
            payload = {
              statusCode: code,
              ...data,
            };
          },
        };
      },
    };

    await exports.getOverview(fakeReq, fakeRes);

    const results = payload && payload.results ? payload.results : [];

    await safeRedisSetEx(cacheKey, LIVE_RESULTS_TTL, JSON.stringify(results));

    return res.json(results);
  } catch (err) {
    console.error("❌ Error fetching nominee results:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * GET /api/votes/results
 *
 * Kept for old frontend compatibility.
 */
exports.getResults = async (req, res) => {
  try {
    const cacheKey = "election_results";

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const fakeReq = {
      params: {},
    };

    let payload = null;

    const fakeRes = {
      json(data) {
        payload = data;
      },
      status(code) {
        return {
          json(data) {
            payload = {
              statusCode: code,
              ...data,
            };
          },
        };
      },
    };

    await exports.getOverview(fakeReq, fakeRes);

    const results = payload && payload.results ? payload.results : [];

    await safeRedisSetEx(cacheKey, LIVE_RESULTS_TTL, JSON.stringify(results));

    return res.json(results);
  } catch (err) {
    console.error("❌ Error fetching election results:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * GET /api/votes/get-votes
 *
 * Kept for old compatibility.
 */
exports.getVotes = async (req, res) => {
  try {
    const cacheKey = "votes:grouped";

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const fakeReq = {
      params: {},
    };

    let payload = null;

    const fakeRes = {
      json(data) {
        payload = data;
      },
      status(code) {
        return {
          json(data) {
            payload = {
              statusCode: code,
              ...data,
            };
          },
        };
      },
    };

    await exports.getOverview(fakeReq, fakeRes);

    const results = payload && payload.results ? payload.results : [];

    await safeRedisSetEx(cacheKey, LIVE_RESULTS_TTL, JSON.stringify(results));

    return res.json(results);
  } catch (err) {
    console.error("❌ Error fetching grouped votes:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * GET /api/votes/get-all-votes
 *
 * Raw vote rows for admin dashboard.
 */
exports.getAllvotes = async (req, res) => {
  try {
    const cacheKey = "votes:raw";

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const [rows] = await db.promise().query(`
      SELECT
        v.*,
        n.name AS nominee_name,
        c.name AS category_name
      FROM votes v
      LEFT JOIN nominees n ON v.candidate_id = n.id
      LEFT JOIN categories c ON n.category_id = c.id
      ORDER BY v.vote_date DESC
    `);

    await safeRedisSetEx(cacheKey, RAW_VOTES_TTL, JSON.stringify(rows));

    return res.json(rows);
  } catch (error) {
    console.error("❌ Error fetching all votes:", error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/votes/dashboard-total
 */
exports.getDashboardTotals = async (req, res) => {
  try {
    const cacheKey = "votes:totals";

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const [[votes]] = await db.promise().query(`
      SELECT IFNULL(SUM(vote_count), 0) AS total_votes
      FROM votes
    `);

    const [[payments]] = await db.promise().query(`
      SELECT IFNULL(SUM(amount_paid), 0) AS total_revenue
      FROM payments
      WHERE payment_status IN ('Paid', 'Success', 'Completed', 'SUCCESS', 'COMPLETED')
         OR payment_status IS NULL
    `);

    const [[nominees]] = await db.promise().query(`
      SELECT COUNT(id) AS total_nominees
      FROM nominees
    `);

    const [[categories]] = await db.promise().query(`
      SELECT COUNT(id) AS total_categories
      FROM categories
    `);

    const data = {
      total_votes: Number(votes.total_votes || 0),
      total_revenue: Number(payments.total_revenue || 0),
      total_nominees: Number(nominees.total_nominees || 0),
      total_categories: Number(categories.total_categories || 0),
      lastFetchedAt: new Date().toISOString(),
    };

    await safeRedisSetEx(cacheKey, DASHBOARD_TTL, JSON.stringify(data));

    return res.json(data);
  } catch (err) {
    console.error("❌ Error fetching dashboard totals:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * GET /api/votes/payments-summary
 */
exports.getPaymentsSummary = async (req, res) => {
  try {
    const cacheKey = "votes:payments_summary";

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const [rows] = await db.promise().query(`
      SELECT 
        IFNULL(payment_method, 'M-Pesa') AS payment_method,
        COUNT(id) AS total_transactions,
        IFNULL(SUM(amount_paid), 0) AS total_amount
      FROM payments
      GROUP BY IFNULL(payment_method, 'M-Pesa')
      ORDER BY total_amount DESC
    `);

    await safeRedisSetEx(cacheKey, CHART_TTL, JSON.stringify(rows));

    return res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching payments summary:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * GET /api/votes/activity-hourly
 */
exports.getVotingActivity = async (req, res) => {
  try {
    const cacheKey = "votes:activity:hourly";

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const [rows] = await db.promise().query(`
      SELECT 
        HOUR(v.vote_date) AS vote_hour,
        IFNULL(SUM(v.vote_count), 0) AS total_votes
      FROM votes v
      GROUP BY HOUR(v.vote_date)
      ORDER BY vote_hour ASC
    `);

    await safeRedisSetEx(cacheKey, CHART_TTL, JSON.stringify(rows));

    return res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching voting activity:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * GET /api/votes/nominees-per-category
 */
exports.getNomineesPerCategory = async (req, res) => {
  try {
    const cacheKey = "nominees:per-category";

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const [rows] = await db.promise().query(`
      SELECT
        c.id AS category_id,
        c.name AS category_name,
        COUNT(n.id) AS nominee_count
      FROM categories c
      LEFT JOIN nominees n ON n.category_id = c.id
      GROUP BY c.id, c.name
      ORDER BY nominee_count DESC, c.name ASC
    `);

    await safeRedisSetEx(cacheKey, CHART_TTL, JSON.stringify(rows));

    return res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching nominees per category:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * GET /api/votes/top-nominees
 */
exports.getTopNominees = async (req, res) => {
  try {
    const cacheKey = "votes:top_nominees";

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const [rows] = await db.promise().query(`
      SELECT 
        c.id AS category_id,
        c.name AS category_name,
        n.id AS nominee_id,
        n.name AS nominee_name,
        n.location,
        n.church,
        n.county,
        IFNULL(SUM(v.vote_count), 0) AS total_votes
      FROM nominees n
      JOIN categories c ON n.category_id = c.id
      LEFT JOIN votes v ON v.candidate_id = n.id
      GROUP BY
        c.id,
        c.name,
        n.id,
        n.name,
        n.location,
        n.church,
        n.county
      ORDER BY total_votes DESC, n.name ASC
      LIMIT 20
    `);

    await safeRedisSetEx(cacheKey, CHART_TTL, JSON.stringify(rows));

    return res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching top nominees:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * GET /api/votes/votes-per-category
 */
exports.getVotesPerCategory = async (req, res) => {
  try {
    const cacheKey = "votes:votes_per_category";

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const [rows] = await db.promise().query(`
      SELECT 
        c.id AS category_id,
        c.name AS category_name,
        IFNULL(SUM(v.vote_count), 0) AS total_votes
      FROM categories c
      LEFT JOIN nominees n ON n.category_id = c.id
      LEFT JOIN votes v ON v.candidate_id = n.id
      GROUP BY c.id, c.name
      ORDER BY total_votes DESC, c.name ASC
    `);

    await safeRedisSetEx(cacheKey, CHART_TTL, JSON.stringify(rows));

    return res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching votes per category:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * POST /api/votes/clear-cache
 * Optional admin endpoint.
 */
exports.clearVoteCacheEndpoint = async (req, res) => {
  try {
    const { category_id } = req.body || {};

    await clearVoteCaches(category_id || null);

    return res.json({
      success: true,
      message: "Vote caches cleared successfully",
    });
  } catch (err) {
    console.error("❌ Error clearing vote cache:", err);
    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};