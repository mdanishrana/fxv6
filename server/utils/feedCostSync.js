const { query } = require('../db');

// Helper to reliably parse numeric fields from the database
const safeNum = (val) => {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
};

/**
 * Accurately calculates the current pure daily feed cost of an animal based on 
 * its current package, prices, and weight.
 * This function mirrors the exact logic in the frontend financials.ts utility.
 */
const calculateCurrentDailyFeedCost = async (client, tenantId, animal) => {
    let dailyFeedCost = 0;

    if (!animal.monthly_package_id && !animal.monthly_charges) {
        return 0; // No feed package and no manual charges
    }

    if (animal.monthly_package_id) {
        // Fetch the package
        const pkgRes = await client.query(
            'SELECT * FROM feed_packages WHERE id = $1 AND tenant_id = $2',
            [animal.monthly_package_id, tenantId]
        );

        if (pkgRes.rows.length > 0) {
            const pkg = pkgRes.rows[0];

            // Fetch items from the package JSON array
            const itemsList = typeof pkg.items === 'string' ? JSON.parse(pkg.items) : (pkg.items || []);
            const itemIds = itemsList.map(i => i.feedItemId || i.feed_item_id).filter(id => id);

            let ingredientDailyCost = 0;

            if (itemIds.length > 0) {
                // Fetch current master feed item prices for this tenant
                const feedMasterRes = await client.query(
                    `SELECT * FROM feed_items WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
                    [tenantId, itemIds]
                );
                const feedMasterMap = new Map(feedMasterRes.rows.map(f => [f.id, f]));

                let totalMixCost = 0;
                let totalMixRatio = 0;
                const mixItems = [];

                itemsList.forEach(item => {
                    const f = feedMasterMap.get(item.feedItemId || item.feed_item_id);
                    if (f) {
                        if (item.type === 'ROUGHAGE' || item.type === 'CONCENTRATE_FIXED') {
                            // Fixed Daily Amount
                            const dailyQty = safeNum(item.manualKgPerFeeding || item.manual_kg_per_feeding) * safeNum(item.manualFeedings || item.manual_feedings || 1);
                            ingredientDailyCost += dailyQty * safeNum(f.cost_per_kg);
                        } else {
                            // Gather Concentrate Mix Items (Ratio based)
                            const r = safeNum(item.ratioPercent || item.ratio_percent);
                            mixItems.push({ f, ratio: r });
                            totalMixRatio += r;
                            totalMixCost += safeNum(f.cost_per_kg) * r;
                        }
                    }
                });

                // Calculate Concentrate Mix Cost
                if (totalMixRatio > 0 && mixItems.length > 0) {
                    const mixCostPerKg = totalMixCost / totalMixRatio;
                    const currentWeight = safeNum(animal.current_weight);
                    const intakeKg = currentWeight * (safeNum(pkg.daily_intake_percent) / 100);
                    ingredientDailyCost += intakeKg * mixCostPerKg;
                }

                if (ingredientDailyCost > 0) {
                    dailyFeedCost = ingredientDailyCost;
                }
            }
        }
    }

    // Fallback: If no ingredient cost was computed but monthly charges fall back to manual flat rate
    if (dailyFeedCost === 0 && animal.monthly_charges) {
        dailyFeedCost = safeNum(animal.monthly_charges) / 30;
    }

    return dailyFeedCost;
};

/**
 * Synchronizes the historical feed costs for a specific animal up to YESTERDAY.
 * - Finds the last logged date (or animal entry date).
 * - Leaves "today" unlogged because prices could still change. 
 * - Loops forward from the last unlogged day to yesterday, inserting rows 
 *   using the *current* state. 
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

        // 4. Calculate Current Rate using EXACT logic as frontend
        const dailyCost = await calculateCurrentDailyFeedCost(client, tenantId, animal);

        // Minor optimization: Skip inserts if cost is strictly $0 (e.g no package) to save db junk?
        // Actually, no, we must log $0 so if the plan is turned on later, we know those days were 0.

        // 5. Build bulk insertion arrays for missing days
        // To be safe against timezone shifts, just use string YYYY-MM-DD
        const values = [];
        let currDate = new Date(startDate);
        currDate.setHours(0, 0, 0, 0);

        while (currDate <= endDate) {
            values.push(`('${tenantId}', '${animal.id}', '${currDate.toISOString().split('T')[0]}', ${dailyCost})`);
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
