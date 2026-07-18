const { query } = require('../db');

// Helper to reliably parse numeric fields from the database
const safeNum = (val) => {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
};

// Finds the price that was actually in effect for a feed item on a given date,
// using its price_history (an array of { date, price } entries, oldest to newest
// as they're appended). Falls back to the item's current cost_per_kg if there's
// no history entry at or before that date (e.g. the item predates price tracking,
// or its price has never changed).
const resolvePriceAsOf = (feedItem, dateStr) => {
    const history = feedItem.price_history || [];
    let best = null;
    for (const entry of history) {
        if (entry.date <= dateStr && (!best || entry.date > best.date)) {
            best = entry;
        }
    }
    return best ? safeNum(best.price) : safeNum(feedItem.cost_per_kg);
};

/**
 * Fetches the (mostly date-invariant) inputs needed to cost an animal's feed for
 * any given day: its package definition and the master feed items it references.
 * Fetched once per sync run rather than once per backfilled day.
 */
const fetchFeedCostInputs = async (client, tenantId, animal) => {
    if (!animal.monthly_package_id) return null;

    const pkgRes = await client.query(
        'SELECT * FROM feed_packages WHERE id = $1 AND tenant_id = $2',
        [animal.monthly_package_id, tenantId]
    );
    if (pkgRes.rows.length === 0) return null;
    const pkg = pkgRes.rows[0];

    const itemsList = typeof pkg.items === 'string' ? JSON.parse(pkg.items) : (pkg.items || []);
    const itemIds = itemsList.map(i => i.feedItemId || i.feed_item_id).filter(id => id);
    if (itemIds.length === 0) return null;

    const feedMasterRes = await client.query(
        `SELECT * FROM feed_items WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenantId, itemIds]
    );
    const feedMasterMap = new Map(feedMasterRes.rows.map(f => [f.id, f]));

    return { pkg, itemsList, feedMasterMap };
};

/**
 * Computes an animal's daily feed cost for a specific date, using whatever price
 * was actually in effect on that date (via each feed item's price_history) rather
 * than always pricing at today's rate. Mirrors the ingredient-cost logic in the
 * frontend's utils/financials.ts.
 */
const computeDailyCostForDate = (inputs, animal, dateStr) => {
    let ingredientDailyCost = 0;

    if (inputs) {
        const { pkg, itemsList, feedMasterMap } = inputs;
        let totalMixCost = 0;
        let totalMixRatio = 0;
        const mixItems = [];

        itemsList.forEach(item => {
            const f = feedMasterMap.get(item.feedItemId || item.feed_item_id);
            if (f) {
                const priceAsOf = resolvePriceAsOf(f, dateStr);
                if (item.type === 'ROUGHAGE' || item.type === 'CONCENTRATE_FIXED') {
                    const dailyQty = safeNum(item.manualKgPerFeeding || item.manual_kg_per_feeding) * safeNum(item.manualFeedings || item.manual_feedings || 1);
                    ingredientDailyCost += dailyQty * priceAsOf;
                } else {
                    const r = safeNum(item.ratioPercent || item.ratio_percent);
                    mixItems.push({ price: priceAsOf, ratio: r });
                    totalMixRatio += r;
                    totalMixCost += priceAsOf * r;
                }
            }
        });

        if (totalMixRatio > 0 && mixItems.length > 0) {
            const mixCostPerKg = totalMixCost / totalMixRatio;
            const currentWeight = safeNum(animal.current_weight);
            const intakeKg = currentWeight * (safeNum(pkg.daily_intake_percent) / 100);
            ingredientDailyCost += intakeKg * mixCostPerKg;
        }
    }

    if (ingredientDailyCost > 0) {
        return ingredientDailyCost;
    }

    // Fallback: no ingredient cost computed, but a manual flat monthly rate is set.
    if (animal.monthly_charges) {
        return safeNum(animal.monthly_charges) / 30;
    }

    return 0;
};

/**
 * Synchronizes the historical feed costs for a specific animal up to YESTERDAY.
 * - Finds the last logged date (or animal entry date).
 * - Leaves "today" unlogged because prices could still change.
 * - Loops forward from the last unlogged day to yesterday, pricing each day at
 *   whatever rate was actually in effect that day (via price_history) rather
 *   than applying one current-day price across the whole backfilled range.
 *
 * IMPORTANT: This must be called BEFORE a price or weight change is committed.
 */
const syncAnimalFeedCosts = async (tenantId, animalId, providedClient = null) => {
    const client = providedClient || { query: require('../db').query };

    try {
        // 1. Fetch the animal's current state
        const animalRes = await client.query(
            'SELECT * FROM cattle WHERE id = $1 AND tenant_id = $2',
            [animalId, tenantId]
        );

        if (animalRes.rows.length === 0) return;
        const animal = animalRes.rows[0];

        // 2. Determine Start Date (Last logged date + 1 day, OR entry date)
        const lastLogRes = await client.query(
            'SELECT MAX(log_date) as max_date FROM animal_feed_cost_logs WHERE animal_id = $1',
            [animal.id]
        );

        let startDate;
        if (lastLogRes.rows[0].max_date) {
            startDate = new Date(lastLogRes.rows[0].max_date);
            startDate.setDate(startDate.getDate() + 1); // Start from the day AFTER the last log
        } else {
            startDate = new Date(animal.entry_date);
        }

        // 3. Determine End Date (Yesterday)
        const endDate = new Date();
        endDate.setHours(0, 0, 0, 0); // Midnight today
        endDate.setDate(endDate.getDate() - 1); // Yesterday

        // If startDate > endDate, there is nothing missing in history.
        if (startDate > endDate) {
            return;
        }

        // 4. Fetch package/feed-item inputs once (price_history is read per-day below)
        const inputs = await fetchFeedCostInputs(client, tenantId, animal);

        // Minor optimization: Skip inserts if cost is strictly $0 (e.g no package) to save db junk?
        // Actually, no, we must log $0 so if the plan is turned on later, we know those days were 0.

        // 5. Build bulk insertion arrays for missing days, pricing each day independently
        // To be safe against timezone shifts, just use string YYYY-MM-DD
        const values = [];
        let currDate = new Date(startDate);
        currDate.setHours(0, 0, 0, 0);

        while (currDate <= endDate) {
            const dateStr = currDate.toISOString().split('T')[0];
            const dailyCost = computeDailyCostForDate(inputs, animal, dateStr);
            values.push(`('${tenantId}', '${animal.id}', '${dateStr}', ${dailyCost})`);
            currDate.setDate(currDate.getDate() + 1);
        }

        if (values.length > 0) {
            // Because we insert up to yesterday, standard ON CONFLICT DO NOTHING is safe
            const batchQuery = `
                INSERT INTO animal_feed_cost_logs (tenant_id, animal_id, log_date, daily_cost) 
                VALUES ${values.join(', ')}
                ON CONFLICT (animal_id, log_date) DO NOTHING
            `;
            await client.query(batchQuery);
            // console.log(`Synced ${values.length} historical feed days for animal ${animal.tag_number}`);
        }

    } catch (err) {
        console.error('Error in syncAnimalFeedCosts:', err);
    }
};

/**
 * Synchronizes history for ALL ACTIVE animals belonging to a tenant.
 * Typically called right before updating global feed package stats or feed prices.
 */
const syncTenantFeedCosts = async (tenantId) => {
    try {
        const cattleRes = await query(
            "SELECT id FROM cattle WHERE tenant_id = $1 AND status != 'SOLD' AND status != 'DEAD'",
            [tenantId]
        );

        for (const c of cattleRes.rows) {
            await syncAnimalFeedCosts(tenantId, c.id);
        }
    } catch (err) {
        console.error('Error in syncTenantFeedCosts:', err);
    }
};

module.exports = {
    syncAnimalFeedCosts,
    syncTenantFeedCosts
};
