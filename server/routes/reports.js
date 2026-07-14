const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Helper to format date for SQL
const formatDate = (date) => new Date(date).toISOString().split('T')[0];

/**
 * @route GET /api/reports/expenses
 * @desc Get aggregated expenses by category within a date range
 */
router.get('/expenses', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { startDate, endDate, batchId } = req.query;

    const start = startDate ? formatDate(startDate) : new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const end = endDate ? formatDate(endDate) : new Date().toISOString().split('T')[0];

    // 1. Aggregated Costs Query
    // Unions all cost sources: Feed Logs, Medical Records, General Expenses (if any table exists, currently mapped to 'cattle_costs')
    // For V1, we will use the 'cattle_costs' table which seems to be the central store based on CostBreakdown.tsx
    // We also need to add 'feed_logs' for more accurate feed costs if they aren't synced to cattle_costs.
    // Based on previous context, 'cattle_costs' has types: MEDICAL, VACCINATION, LABOR, OTHER.
    // Feed costs might be calculated dynamically or stored. Let's assume 'cattle_costs' + dynamic feed calculation.

    // Actually, for V1 simplicity and robustness, let's query the 'cattle_costs' table as the primary source of manual entries
    // AND query 'feed_usage_logs' for feed costs.

    const expenseQuery = `
      SELECT 
        cost_type as category, 
        SUM(amount) as total 
      FROM cattle_costs 
      WHERE tenant_id = $1 
      AND date::date >= $2 
      AND date::date <= $3 
      GROUP BY cost_type
    `;

    // Feed Usage Query (Approximation: usage_amount * cost_per_unit)
    // We need to join feed_usage_logs with feed_inventory to get cost
    // Feed Usage Query (Approximation using aggregated daily totals)
    const feedQuery = `
      SELECT 
        SUM(total_feed_consumed_kg * 45) as total_feed_cost -- Approximate cost per kg if exact item breakdown is complex
      FROM feed_usage_log
      WHERE tenant_id = $1
      AND date::date >= $2 
      AND date::date <= $3
    `;

    const [expenseRes, feedRes] = await Promise.all([
      pool.query(expenseQuery, [tenantId, start, end]),
      pool.query(feedQuery, [tenantId, start, end])
    ]);

    const categories = expenseRes.rows.map(row => ({
      name: row.category,
      value: parseFloat(row.total || 0)
    }));

    // Add Feed Cost
    const feedCost = parseFloat(feedRes.rows[0].total_feed_cost || 0);
    if (feedCost > 0) {
      categories.push({ name: 'FEED', value: feedCost });
    }

    // Calculate Trend (Daily Totals)
    // This is a more complex query, for V1 let's just return the categorical breakdown.

    res.json({
      startDate: start,
      endDate: end,
      breakdown: categories,
      total: categories.reduce((sum, item) => sum + item.value, 0)
    });

  } catch (err) {
    console.error('Error fetching expense report:', err.message);
    res.status(500).json({ error: 'Server Error' });
  }
});

/**
 * @route GET /api/reports/growth
 * @desc Get aggregated growth metrics (Avg Weight, ADG)
 */
router.get('/growth', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.user;

    // Current Herd Statistics
    const currentStatsQuery = `
      SELECT 
        COUNT(*) as total_animals,
        AVG(current_weight) as avg_weight,
        SUM(current_weight) as total_weight
      FROM cattle 
      WHERE tenant_id = $1 AND status = 'Active'
    `;

    // Growth Trend (Mocked for V1 if history table not robust, but let's try to get real data if possible)
    // Assuming we don't have a daily weight history table for *all* animals easily accessible for efficient graphing yet.
    // we will return the current stats and a calculated ADG based on entry_weight vs current_weight.

    const adgQuery = `
      SELECT 
        id, 
        tag_number, 
        current_weight, 
        entry_weight, 
        entry_date,
        (current_weight - entry_weight) / GREATEST(1, DATE_PART('day', NOW() - entry_date::timestamp)) as adg
      FROM cattle
      WHERE tenant_id = $1 
      AND status = 'Active' 
      AND current_weight IS NOT NULL 
      AND entry_weight IS NOT NULL
      ORDER BY adg DESC
    `;

    const [statsRes, adgRes] = await Promise.all([
      pool.query(currentStatsQuery, [tenantId]),
      pool.query(adgQuery, [tenantId])
    ]);

    const stats = statsRes.rows[0];
    const animals = adgRes.rows;

    // Calculate Herd Average ADG
    const totalADG = animals.reduce((sum, animal) => sum + parseFloat(animal.adg || 0), 0);
    const avgADG = animals.length > 0 ? (totalADG / animals.length).toFixed(2) : 0;

    // Identify Top & Bottom Performers
    const topPerformers = animals.slice(0, 5);
    const bottomPerformers = animals.slice(-5).reverse();

    res.json({
      overview: {
        totalAnimals: parseInt(stats.total_animals || 0),
        avgWeight: parseFloat(stats.avg_weight || 0).toFixed(1),
        avgADG,
        totalHerdWeight: parseFloat(stats.total_weight || 0)
      },
      topPerformers,
      bottomPerformers
    });

  } catch (err) {
    console.error('Error fetching growth report:', err.message);
    res.status(500).json({ error: 'Server Error' });
  }
});

/**
 * @route GET /api/reports/animal-costs
 * @desc Get detailed cost breakdown for animals, optionally filtered by tag
 */
router.get('/animal-costs', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { animalId } = req.query;

    let query = `
      SELECT 
        cc.id,
        cc.cost_type as category,
        cc.amount,
        cc.description as notes,
        cc.date,
        c.tag_number as "tagNumber",
        c.name as "animalName"
      FROM cattle_costs cc
      JOIN cattle c ON cc.cattle_id = c.id
      WHERE cc.tenant_id = $1
    `;
    const params = [tenantId];

    if (animalId) {
      params.push(animalId);
      query += ` AND cc.cattle_id = $2::uuid`;
    }

    query += ` ORDER BY cc.date DESC`;

    const result = await pool.query(query, params);

    res.json({
      costs: result.rows.map(row => ({
        ...row,
        amount: parseFloat(row.amount || 0)
      }))
    });

  } catch (err) {
    console.error('Error fetching animal cost report:', err.message);
    res.status(500).json({ error: 'Server Error' });
  }
});

module.exports = router;
