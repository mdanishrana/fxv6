const express = require('express');
const router = express.Router();
const db = require('../db');
const { syncTenantFeedCosts } = require('../utils/feedCostSync');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use((req, res, next) => {
    req.tenantId = req.user.tenantId;
    next();
});

// --- INGREDIENTS ---

router.get('/items', async (req, res) => {
    console.log('GET /feed/items - tenantId:', req.tenantId);
    try {
        const result = await db.query('SELECT * FROM feed_items WHERE tenant_id = $1', [req.tenantId]);
        console.log('Feed items found:', result.rows.length);
        res.json(result.rows.map(row => ({
            id: row.id,
            name: row.name,
            quantityKg: parseFloat(row.stock_quantity || row.quantity_kg) || 0,
            costPerKg: parseFloat(row.cost_per_kg) || 0,
            proteinPercent: parseFloat(row.protein_percentage || row.protein_percent) || 0,
            energyMcal: parseFloat(row.energy_mcal) || 0,
            lowStockThreshold: parseFloat(row.min_stock_level || row.low_stock_threshold) || 500,
            priceHistory: row.price_history || []
        })));
    } catch (err) {
        console.error('Error fetching feed items:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/items', async (req, res) => {
    const f = req.body;
    console.log('POST /feed/items - tenantId:', req.tenantId, 'data:', f);
    try {
        // Check for existing ingredient with same name for this tenant
        const existing = await db.query(
            'SELECT id, stock_quantity FROM feed_items WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)',
            [req.tenantId, f.name]
        );

        if (existing.rows.length > 0) {
            // Merge with existing item
            const item = existing.rows[0];
            const newQuantity = (parseFloat(item.stock_quantity) || 0) + (parseFloat(f.quantityKg) || 0);

            const result = await db.query(
                `UPDATE feed_items SET 
                stock_quantity = $1, 
                cost_per_kg = $2,
                protein_percentage = $3,
                energy_mcal = $4,
                min_stock_level = $5,
                updated_at = NOW()
                WHERE id = $6 AND tenant_id = $7 RETURNING *`,
                [newQuantity, f.costPerKg || 0, f.proteinPercent || 0, f.energyMcal || 0, f.lowStockThreshold || 500, item.id, req.tenantId]
            );

            const row = result.rows[0];
            return res.status(200).json({
                id: row.id,
                name: row.name,
                quantityKg: parseFloat(row.stock_quantity) || 0,
                costPerKg: parseFloat(row.cost_per_kg) || 0,
                proteinPercent: parseFloat(row.protein_percentage) || 0,
                energyMcal: parseFloat(row.energy_mcal) || 0,
                lowStockThreshold: parseFloat(row.min_stock_level) || 500,
                priceHistory: []
            });
        }

        const result = await db.query(
            `INSERT INTO feed_items (
                tenant_id, name, stock_quantity, cost_per_kg, protein_percentage, energy_mcal, 
                min_stock_level
            ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                req.tenantId, f.name, f.quantityKg || 0, f.costPerKg || 0, f.proteinPercent || 0,
                f.energyMcal || 0, f.lowStockThreshold || 500
            ]
        );
        console.log('Feed item created:', result.rows[0].id);
        const row = result.rows[0];
        res.status(201).json({
            id: row.id,
            name: row.name,
            quantityKg: parseFloat(row.stock_quantity) || 0,
            costPerKg: parseFloat(row.cost_per_kg) || 0,
            proteinPercent: parseFloat(row.protein_percentage) || 0,
            energyMcal: parseFloat(row.energy_mcal) || 0,
            lowStockThreshold: parseFloat(row.min_stock_level) || 500,
            priceHistory: []
        });
    } catch (err) {
        console.error('Error creating feed item:', err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/items/:id', async (req, res) => {
    const f = req.body;
    console.log('PUT /feed/items - id:', req.params.id, 'data:', f);
    try {
        // SYNCHRONIZE Feed Costs BEFORE updating price
        await syncTenantFeedCosts(req.tenantId);

        const result = await db.query(
            `UPDATE feed_items SET 
                name = $1, stock_quantity = $2, cost_per_kg = $3, protein_percentage = $4, 
                energy_mcal = $5, min_stock_level = $6, updated_at = NOW()
             WHERE id = $7 AND tenant_id = $8 RETURNING *`,
            [
                f.name, f.quantityKg || 0, f.costPerKg || 0, f.proteinPercent || 0, f.energyMcal || 0,
                f.lowStockThreshold || 500, req.params.id, req.tenantId
            ]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Feed item not found' });
        }
        const row = result.rows[0];
        console.log('Feed item updated:', row.id);
        res.json({
            id: row.id,
            name: row.name,
            quantityKg: parseFloat(row.stock_quantity) || 0,
            costPerKg: parseFloat(row.cost_per_kg) || 0,
            proteinPercent: parseFloat(row.protein_percentage) || 0,
            energyMcal: parseFloat(row.energy_mcal) || 0,
            lowStockThreshold: parseFloat(row.min_stock_level) || 500,
            priceHistory: []
        });
    } catch (err) {
        console.error('Error updating feed item:', err);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/items/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM feed_items WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- PACKAGES ---

router.get('/packages', async (req, res) => {
    console.log('GET /feed/packages - tenantId:', req.tenantId);
    try {
        const result = await db.query('SELECT * FROM feed_packages WHERE tenant_id = $1', [req.tenantId]);
        console.log('Feed packages found:', result.rows.length);
        res.json(result.rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            dailyIntakePercent: parseFloat(row.daily_intake_percent) || 2.5,
            items: row.items || []
        })));
    } catch (err) {
        console.error('Error fetching packages:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/packages', async (req, res) => {
    const p = req.body;
    console.log('POST /feed/packages - tenantId:', req.tenantId, 'data:', p);
    try {
        const result = await db.query(
            `INSERT INTO feed_packages (tenant_id, name, description, daily_intake_percent, items)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.tenantId, p.name, p.description, p.dailyIntakePercent || 2.5, JSON.stringify(p.items || [])]
        );
        console.log('Feed package created:', result.rows[0].id);
        const row = result.rows[0];
        res.status(201).json({
            id: row.id,
            name: row.name,
            description: row.description,
            dailyIntakePercent: parseFloat(row.daily_intake_percent) || 2.5,
            items: row.items || []
        });
    } catch (err) {
        console.error('Error creating package:', err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/packages/:id', async (req, res) => {
    const p = req.body;
    try {
        // SYNCHRONIZE Feed Costs BEFORE updating package ingredients/ratios
        await syncTenantFeedCosts(req.tenantId);

        const result = await db.query(
            `UPDATE feed_packages SET 
                name = $1, description = $2, daily_intake_percent = $3, items = $4
             WHERE id = $5 AND tenant_id = $6 RETURNING *`,
            [p.name, p.description, p.dailyIntakePercent, JSON.stringify(p.items), req.params.id, req.tenantId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Package not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/packages/:id', async (req, res) => {
    try {
        // SYNCHRONIZE Feed Costs BEFORE deleting package (which resets daily cost to 0)
        await syncTenantFeedCosts(req.tenantId);

        const result = await db.query(
            'DELETE FROM feed_packages WHERE id = $1 AND tenant_id = $2 RETURNING id',
            [req.params.id, req.tenantId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Package not found' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DAILY FEED PROCESSING ---

router.get('/usage-log', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM feed_usage_log WHERE tenant_id = $1 ORDER BY date DESC LIMIT 30',
            [req.tenantId]
        );
        res.json(result.rows.map(row => ({
            id: row.id,
            date: row.date,
            totalAnimals: row.total_animals,
            totalWeightKg: parseFloat(row.total_weight_kg) || 0,
            totalFeedConsumedKg: parseFloat(row.total_feed_consumed_kg) || 0,
            breakdown: row.breakdown || [],
            createdAt: row.created_at
        })));
    } catch (err) {
        console.error('Error fetching feed usage log:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/process-multiple-days', async (req, res) => {
    const { days } = req.body;
    const numDays = Math.min(Math.max(parseInt(days) || 1, 1), 30);

    try {
        const results = [];
        const today = new Date();

        // Get dates that are already processed
        const existingLogs = await db.query(
            'SELECT date FROM feed_usage_log WHERE tenant_id = $1 AND date >= $2',
            [req.tenantId, new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]]
        );
        const processedDates = new Set(existingLogs.rows.map(r => r.date.toISOString().split('T')[0]));

        // Get all active animals with their packages (once)
        const animalsResult = await db.query(
            `SELECT c.id, c.tag_number, c.current_weight, c.monthly_package_id,
                    fp.name as package_name, fp.daily_intake_percent, fp.items as package_items
             FROM cattle c
             LEFT JOIN feed_packages fp ON c.monthly_package_id = fp.id
             WHERE c.tenant_id = $1 AND c.status = 'Active'`,
            [req.tenantId]
        );
        const animals = animalsResult.rows;

        if (animals.length === 0) {
            return res.status(400).json({ error: 'No active animals found to process feed for.' });
        }

        // Get current feed inventory
        const feedResult = await db.query(
            'SELECT id, name, stock_quantity FROM feed_items WHERE tenant_id = $1',
            [req.tenantId]
        );
        const feedInventory = {};
        feedResult.rows.forEach(f => {
            feedInventory[f.id] = {
                id: f.id,
                name: f.name,
                stock: parseFloat(f.stock_quantity) || 0,
                totalConsumed: 0
            };
        });

        let totalDaysProcessed = 0;
        let grandTotalFeed = 0;
        const skippedDates = [];

        // Process each day going backwards
        for (let i = 0; i < numDays; i++) {
            const processDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
            const dateStr = processDate.toISOString().split('T')[0];

            if (processedDates.has(dateStr)) {
                skippedDates.push(dateStr);
                continue;
            }

            let totalWeight = 0;
            let totalFeedConsumed = 0;
            const dayFeedConsumption = {};

            for (const animal of animals) {
                const weight = parseFloat(animal.current_weight) || 0;
                const intakePercent = parseFloat(animal.daily_intake_percent) || 2.5;
                const dailyIntake = weight * (intakePercent / 100);

                totalWeight += weight;
                totalFeedConsumed += dailyIntake;

                const packageItems = animal.package_items || [];
                const totalRatio = packageItems.reduce((sum, item) => sum + (item.ratioPercent || 0), 0) || 1;

                for (const item of packageItems) {
                    const ratio = (item.ratioPercent || 0) / totalRatio;
                    const amountKg = dailyIntake * ratio;

                    if (feedInventory[item.feedItemId]) {
                        if (!dayFeedConsumption[item.feedItemId]) {
                            dayFeedConsumption[item.feedItemId] = 0;
                        }
                        dayFeedConsumption[item.feedItemId] += amountKg;
                        feedInventory[item.feedItemId].totalConsumed += amountKg;
                    }
                }
            }

            // Create usage log entry for this day
            const feedBreakdown = Object.entries(dayFeedConsumption).map(([feedId, consumed]) => ({
                feedItemId: feedId,
                feedName: feedInventory[feedId]?.name || 'Unknown',
                consumedKg: Math.round(consumed * 100) / 100
            }));

            await db.query(
                `INSERT INTO feed_usage_log (tenant_id, date, total_animals, total_weight_kg, total_feed_consumed_kg, breakdown)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    req.tenantId,
                    dateStr,
                    animals.length,
                    Math.round(totalWeight * 100) / 100,
                    Math.round(totalFeedConsumed * 100) / 100,
                    JSON.stringify({ feed: feedBreakdown })
                ]
            );

            totalDaysProcessed++;
            grandTotalFeed += totalFeedConsumed;
            results.push({ date: dateStr, feedConsumed: Math.round(totalFeedConsumed * 100) / 100 });
        }

        // Deduct all feed from inventory at once
        const insufficientFeed = [];
        for (const feedId in feedInventory) {
            const feed = feedInventory[feedId];
            if (feed.totalConsumed > 0) {
                const newStock = Math.max(0, feed.stock - feed.totalConsumed);
                if (feed.totalConsumed > feed.stock) {
                    insufficientFeed.push({
                        name: feed.name,
                        required: Math.round(feed.totalConsumed * 100) / 100,
                        available: Math.round(feed.stock * 100) / 100,
                        shortage: Math.round((feed.totalConsumed - feed.stock) * 100) / 100
                    });
                }
                await db.query(
                    'UPDATE feed_items SET stock_quantity = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
                    [newStock, feedId, req.tenantId]
                );
            }
        }

        const feedBreakdownTotal = Object.values(feedInventory)
            .filter(f => f.totalConsumed > 0)
            .map(f => ({
                feedName: f.name,
                consumedKg: Math.round(f.totalConsumed * 100) / 100
            }));

        res.json({
            success: true,
            summary: {
                daysProcessed: totalDaysProcessed,
                daysSkipped: skippedDates.length,
                skippedDates: skippedDates,
                totalAnimals: animals.length,
                totalFeedConsumedKg: Math.round(grandTotalFeed * 100) / 100,
                feedBreakdown: feedBreakdownTotal
            },
            dailyResults: results,
            warnings: insufficientFeed.length > 0 ? {
                message: 'Some feed items had insufficient stock',
                items: insufficientFeed
            } : null
        });

    } catch (err) {
        console.error('Error processing multiple days feed:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/process-daily', async (req, res) => {
    const { date } = req.body;
    const processDate = date || new Date().toISOString().split('T')[0];

    try {
        // Check if already processed for this date
        const existingLog = await db.query(
            'SELECT id FROM feed_usage_log WHERE tenant_id = $1 AND date = $2',
            [req.tenantId, processDate]
        );

        if (existingLog.rows.length > 0) {
            return res.status(400).json({
                error: `Feed already processed for ${processDate}. Each day can only be processed once.`
            });
        }

        // Get all active animals with their packages
        const animalsResult = await db.query(
            `SELECT c.id, c.tag_number, c.current_weight, c.monthly_package_id,
                    fp.name as package_name, fp.daily_intake_percent, fp.items as package_items
             FROM cattle c
             LEFT JOIN feed_packages fp ON c.monthly_package_id = fp.id
             WHERE c.tenant_id = $1 AND c.status = 'Active'`,
            [req.tenantId]
        );

        const animals = animalsResult.rows;

        if (animals.length === 0) {
            return res.status(400).json({ error: 'No active animals found to process feed for.' });
        }

        // Get current feed inventory
        const feedResult = await db.query(
            'SELECT id, name, stock_quantity FROM feed_items WHERE tenant_id = $1',
            [req.tenantId]
        );
        const feedInventory = {};
        feedResult.rows.forEach(f => {
            feedInventory[f.id] = {
                id: f.id,
                name: f.name,
                stock: parseFloat(f.stock_quantity) || 0,
                consumed: 0
            };
        });

        let totalWeight = 0;
        let totalFeedConsumed = 0;
        const animalBreakdown = [];

        // Calculate feed consumption for each animal
        for (const animal of animals) {
            const weight = parseFloat(animal.current_weight) || 0;
            const intakePercent = parseFloat(animal.daily_intake_percent) || 2.5;
            const dailyIntake = weight * (intakePercent / 100);

            totalWeight += weight;
            totalFeedConsumed += dailyIntake;

            const packageItems = animal.package_items || [];
            const itemBreakdown = [];

            // Distribute intake among package items based on their ratioPercent
            const totalRatio = packageItems.reduce((sum, item) => sum + (item.ratioPercent || 0), 0) || 1;

            for (const item of packageItems) {
                const ratio = (item.ratioPercent || 0) / totalRatio;
                const amountKg = dailyIntake * ratio;

                if (feedInventory[item.feedItemId]) {
                    feedInventory[item.feedItemId].consumed += amountKg;
                    itemBreakdown.push({
                        feedItemId: item.feedItemId,
                        feedName: feedInventory[item.feedItemId].name,
                        amountKg: Math.round(amountKg * 100) / 100
                    });
                }
            }

            animalBreakdown.push({
                animalId: animal.id,
                tagNumber: animal.tag_number,
                weight: weight,
                packageName: animal.package_name || 'Unassigned',
                dailyIntake: Math.round(dailyIntake * 100) / 100,
                items: itemBreakdown
            });
        }

        // Deduct feed from inventory
        const insufficientFeed = [];
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
                await db.query(
                    'UPDATE feed_items SET stock_quantity = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
                    [newStock, feedId, req.tenantId]
                );
            }
        }

        // Create usage log entry
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
                req.tenantId,
                processDate,
                animals.length,
                Math.round(totalWeight * 100) / 100,
                Math.round(totalFeedConsumed * 100) / 100,
                JSON.stringify({ animals: animalBreakdown, feed: feedBreakdown })
            ]
        );

        res.json({
            success: true,
            date: processDate,
            summary: {
                totalAnimals: animals.length,
                totalWeightKg: Math.round(totalWeight * 100) / 100,
                totalFeedConsumedKg: Math.round(totalFeedConsumed * 100) / 100,
                feedBreakdown: feedBreakdown
            },
            warnings: insufficientFeed.length > 0 ? {
                message: 'Some feed items had insufficient stock',
                items: insufficientFeed
            } : null
        });

    } catch (err) {
        console.error('Error processing daily feed:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- DELETE USAGE LOG (Revert Inventory) ---

router.delete('/usage-log/:id', async (req, res) => {
    try {
        // 1. Get the log entry to know what was consumed
        const logResult = await db.query(
            'SELECT * FROM feed_usage_log WHERE id = $1 AND tenant_id = $2',
            [req.params.id, req.tenantId]
        );

        if (logResult.rows.length === 0) {
            return res.status(404).json({ error: 'Usage log not found' });
        }

        const log = logResult.rows[0];

        // 2. Parse breakdown to find consumption details
        let breakdown = log.breakdown;
        if (typeof breakdown === 'string') {
            try {
                breakdown = JSON.parse(breakdown);
            } catch (e) {
                console.error('Error parsing breakdown JSON:', e);
                breakdown = {};
            }
        }

        const feedConsumed = breakdown.feed || []; // Array of { feedItemId, consumedKg }

        // 3. Restore inventory for each item
        for (const item of feedConsumed) {
            if (item.feedItemId && item.consumedKg > 0) {
                await db.query(
                    `UPDATE feed_items 
                     SET stock_quantity = stock_quantity + $1, updated_at = NOW() 
                     WHERE id = $2 AND tenant_id = $3`,
                    [item.consumedKg, item.feedItemId, req.tenantId]
                );
            }
        }

        // 4. Delete the log entry
        await db.query(
            'DELETE FROM feed_usage_log WHERE id = $1 AND tenant_id = $2',
            [req.params.id, req.tenantId]
        );

        res.json({ success: true, message: 'Usage log deleted and inventory restored' });

    } catch (err) {
        console.error('Error deleting usage log:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- LOW STOCK ALERT ---

router.post('/send-low-stock-alert', async (req, res) => {
    const { lowStockItems } = req.body;

    if (!lowStockItems || lowStockItems.length === 0) {
        return res.status(400).json({ error: 'No low stock items provided' });
    }

    try {
        // Get tenant info for email
        const tenantResult = await db.query(
            'SELECT name, owner_name, owner_email, whatsapp_number, whatsapp_apikey FROM tenants WHERE id = $1',
            [req.tenantId]
        );

        if (tenantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        const tenant = tenantResult.rows[0];

        if (!tenant.owner_email) {
            return res.status(400).json({ error: 'No owner email configured for this farm' });
        }

        const { sendLowStockAlertEmail } = require('../services/emailService');

        const result = await sendLowStockAlertEmail(
            tenant.owner_email,
            tenant.owner_name,
            tenant.name,
            lowStockItems
        );

        if (tenant.whatsapp_number && tenant.whatsapp_apikey) {
            const { sendLowStockAlertWhatsApp } = require('../services/whatsappService');
            await sendLowStockAlertWhatsApp(tenant.whatsapp_number, tenant.whatsapp_apikey, tenant.owner_name, tenant.name, lowStockItems);
        }

        if (result.success) {
            console.log(`Low stock alert sent to ${tenant.owner_email} for tenant ${tenant.name}`);
            res.json({ success: true, message: `Alert sent to ${tenant.owner_email}` });
        } else {
            console.error('Failed to send low stock alert:', result.error);
            res.status(500).json({ error: result.error || 'Failed to send email' });
        }

    } catch (err) {
        console.error('Error sending low stock alert:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;