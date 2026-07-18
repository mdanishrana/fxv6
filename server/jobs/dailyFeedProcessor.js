const db = require('../db');

// Computes one animal's actual daily feed consumption, itemized by feed_item_id.
// Mirrors the cost logic in utils/financials.ts and server/utils/feedCostSync.js:
// ROUGHAGE/CONCENTRATE_FIXED items are a fixed kg/day amount on top of the
// weight-based intake budget, which only governs the ratio-based CONCENTRATE mix.
function computeAnimalFeedConsumption(animal) {
    const weight = parseFloat(animal.current_weight) || 0;
    const intakePercent = parseFloat(animal.daily_intake_percent) || 2.5;
    const concentrateIntakeKg = weight * (intakePercent / 100);

    const packageItems = animal.package_items || [];
    const fixedItems = packageItems.filter(i => i.type === 'ROUGHAGE' || i.type === 'CONCENTRATE_FIXED');
    const concentrateItems = packageItems.filter(i => i.type !== 'ROUGHAGE' && i.type !== 'CONCENTRATE_FIXED');
    const totalRatio = concentrateItems.reduce((sum, item) => sum + (item.ratioPercent || 0), 0) || 1;

    const itemConsumption = [];
    let totalIntakeKg = 0;

    for (const item of fixedItems) {
        const amountKg = (parseFloat(item.manualKgPerFeeding) || 0) * (parseFloat(item.manualFeedings) || 1);
        if (amountKg > 0) {
            itemConsumption.push({ feedItemId: item.feedItemId, amountKg });
            totalIntakeKg += amountKg;
        }
    }

    for (const item of concentrateItems) {
        const ratio = (item.ratioPercent || 0) / totalRatio;
        const amountKg = concentrateIntakeKg * ratio;
        if (amountKg > 0) {
            itemConsumption.push({ feedItemId: item.feedItemId, amountKg });
        }
    }
    totalIntakeKg += concentrateIntakeKg;

    return { weight, totalIntakeKg, itemConsumption };
}

/**
 * Processes one tenant's feed consumption for a single date: computes each active
 * animal's consumption, deducts it from inventory, and writes a feed_usage_log row.
 * Used by both the manual "Process Today's Feed" API route and the nightly cron job,
 * so scheduled and on-demand processing can never drift apart.
 *
 * Returns { ok: false, reason: 'ALREADY_PROCESSED' | 'NO_ANIMALS' }
 *      or { ok: true, result: {...same shape the API route returns...}, newlyLowStock: [...] }
 */
async function processDailyFeedForTenant(tenantId, dateStr) {
    const existingLog = await db.query(
        'SELECT id FROM feed_usage_log WHERE tenant_id = $1 AND date = $2',
        [tenantId, dateStr]
    );
    if (existingLog.rows.length > 0) {
        return { ok: false, reason: 'ALREADY_PROCESSED' };
    }

    const animalsResult = await db.query(
        `SELECT c.id, c.tag_number, c.current_weight, c.monthly_package_id,
                fp.name as package_name, fp.daily_intake_percent, fp.items as package_items
         FROM cattle c
         LEFT JOIN feed_packages fp ON c.monthly_package_id = fp.id
         WHERE c.tenant_id = $1 AND c.status = 'Active'`,
        [tenantId]
    );
    const animals = animalsResult.rows;
    if (animals.length === 0) {
        return { ok: false, reason: 'NO_ANIMALS' };
    }

    const feedResult = await db.query(
        'SELECT id, name, stock_quantity, min_stock_level FROM feed_items WHERE tenant_id = $1',
        [tenantId]
    );
    const feedInventory = {};
    feedResult.rows.forEach(f => {
        feedInventory[f.id] = {
            id: f.id,
            name: f.name,
            stock: parseFloat(f.stock_quantity) || 0,
            threshold: parseFloat(f.min_stock_level) || 500,
            consumed: 0
        };
    });

    let totalWeight = 0;
    let totalFeedConsumed = 0;
    const animalBreakdown = [];

    for (const animal of animals) {
        const { weight, totalIntakeKg, itemConsumption } = computeAnimalFeedConsumption(animal);

        totalWeight += weight;
        totalFeedConsumed += totalIntakeKg;

        const itemBreakdown = [];
        for (const { feedItemId, amountKg } of itemConsumption) {
            if (feedInventory[feedItemId]) {
                feedInventory[feedItemId].consumed += amountKg;
                itemBreakdown.push({
                    feedItemId,
                    feedName: feedInventory[feedItemId].name,
                    amountKg: Math.round(amountKg * 100) / 100
                });
            }
        }

        animalBreakdown.push({
            animalId: animal.id,
            tagNumber: animal.tag_number,
            weight,
            packageName: animal.package_name || 'Unassigned',
            dailyIntake: Math.round(totalIntakeKg * 100) / 100,
            items: itemBreakdown
        });
    }

    const insufficientFeed = [];
    const newlyLowStock = [];
    for (const feedId in feedInventory) {
        const feed = feedInventory[feedId];
        if (feed.consumed > 0) {
            const newStock = Math.max(0, feed.stock - feed.consumed);
            if (feed.consumed > feed.stock) {
                insufficientFeed.push({
                    name: feed.name,
                    required: Math.round(feed.consumed * 100) / 100,
                    available: Math.round(feed.stock * 100) / 100,
                    shortage: Math.round((feed.consumed - feed.stock) * 100) / 100
                });
            }
            // Only alert when this run is what pushed the item below threshold -
            // avoids re-sending the same alert every night it stays low.
            if (feed.stock > feed.threshold && newStock <= feed.threshold) {
                newlyLowStock.push({ name: feed.name, quantityKg: newStock, lowStockThreshold: feed.threshold });
            }
            await db.query(
                'UPDATE feed_items SET stock_quantity = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
                [newStock, feedId, tenantId]
            );
        }
    }

    const feedBreakdown = Object.values(feedInventory)
        .filter(f => f.consumed > 0)
        .map(f => ({
            feedItemId: f.id,
            feedName: f.name,
            consumedKg: Math.round(f.consumed * 100) / 100
        }));

    await db.query(
        `INSERT INTO feed_usage_log (tenant_id, date, total_animals, total_weight_kg, total_feed_consumed_kg, breakdown)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
            tenantId,
            dateStr,
            animals.length,
            Math.round(totalWeight * 100) / 100,
            Math.round(totalFeedConsumed * 100) / 100,
            JSON.stringify({ animals: animalBreakdown, feed: feedBreakdown })
        ]
    );

    return {
        ok: true,
        result: {
            success: true,
            date: dateStr,
            summary: {
                totalAnimals: animals.length,
                totalWeightKg: Math.round(totalWeight * 100) / 100,
                totalFeedConsumedKg: Math.round(totalFeedConsumed * 100) / 100,
                feedBreakdown
            },
            warnings: insufficientFeed.length > 0 ? {
                message: 'Some feed items had insufficient stock',
                items: insufficientFeed
            } : null
        },
        newlyLowStock
    };
}

module.exports = { computeAnimalFeedConsumption, processDailyFeedForTenant };
