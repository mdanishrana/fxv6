const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

router.get('/', async (req, res) => {
    try {
        const plansResult = await db.query(
            'SELECT * FROM subscription_plans ORDER BY display_order ASC'
        );
        
        const plans = await Promise.all(plansResult.rows.map(async (plan) => {
            const featuresResult = await db.query(
                'SELECT id, feature_text, display_order FROM plan_features WHERE plan_id = $1 ORDER BY display_order ASC',
                [plan.id]
            );
            return {
                id: plan.id,
                code: plan.code,
                name: plan.name,
                pricePkr: plan.price_pkr,
                billingPeriod: plan.billing_period,
                description: plan.description,
                isCustom: plan.is_custom,
                contactEmail: plan.contact_email,
                isPopular: plan.is_popular,
                displayOrder: plan.display_order,
                userLimit: plan.user_limit,
                cattleLimit: plan.cattle_limit,
                features: featuresResult.rows.map(f => ({
                    id: f.id,
                    text: f.feature_text,
                    displayOrder: f.display_order
                }))
            };
        }));
        
        res.json(plans);
    } catch (err) {
        console.error('Error fetching plans:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/', authMiddleware, async (req, res) => {
    if (req.user.role !== 'SAAS_ADMIN') {
        return res.status(403).json({ error: 'Only SaaS Admin can create plans' });
    }
    
    const { code, name, pricePkr, billingPeriod, isCustom, contactEmail, isPopular, userLimit, cattleLimit, features } = req.body;
    
    if (!code || !name) {
        return res.status(400).json({ error: 'Code and name are required' });
    }
    
    try {
        const maxOrder = await db.query('SELECT COALESCE(MAX(display_order), 0) + 1 as next_order FROM subscription_plans');
        const nextOrder = maxOrder.rows[0].next_order;
        
        const result = await db.query(
            `INSERT INTO subscription_plans (code, name, price_pkr, billing_period, is_custom, contact_email, is_popular, display_order, user_limit, cattle_limit)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [code.toUpperCase(), name, pricePkr || null, billingPeriod || '/month', isCustom || false, contactEmail || null, isPopular || false, nextOrder, userLimit || 3, cattleLimit || 'Unlimited']
        );
        
        const plan = result.rows[0];
        
        if (features && features.length > 0) {
            for (let i = 0; i < features.length; i++) {
                await db.query(
                    'INSERT INTO plan_features (plan_id, feature_text, display_order) VALUES ($1, $2, $3)',
                    [plan.id, features[i], i + 1]
                );
            }
        }
        
        res.status(201).json({ id: plan.id, code: plan.code, name: plan.name });
    } catch (err) {
        console.error('Error creating plan:', err);
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Plan code already exists' });
        }
        res.status(500).json({ error: 'Failed to create plan' });
    }
});

router.put('/:planId', authMiddleware, async (req, res) => {
    if (req.user.role !== 'SAAS_ADMIN') {
        return res.status(403).json({ error: 'Only SaaS Admin can update plans' });
    }
    
    const { planId } = req.params;
    const { name, pricePkr, billingPeriod, isCustom, contactEmail, isPopular, displayOrder, userLimit, cattleLimit } = req.body;
    
    try {
        const result = await db.query(
            `UPDATE subscription_plans SET 
                name = COALESCE($1, name),
                price_pkr = $2,
                billing_period = COALESCE($3, billing_period),
                is_custom = COALESCE($4, is_custom),
                contact_email = $5,
                is_popular = COALESCE($6, is_popular),
                display_order = COALESCE($7, display_order),
                user_limit = $8,
                cattle_limit = COALESCE($9, cattle_limit),
                updated_at = NOW()
             WHERE id = $10 RETURNING *`,
            [name, pricePkr, billingPeriod, isCustom, contactEmail, isPopular, displayOrder, userLimit, cattleLimit, planId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Plan not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating plan:', err);
        res.status(500).json({ error: 'Failed to update plan' });
    }
});

router.delete('/:planId', authMiddleware, async (req, res) => {
    if (req.user.role !== 'SAAS_ADMIN') {
        return res.status(403).json({ error: 'Only SaaS Admin can delete plans' });
    }
    
    const { planId } = req.params;
    
    try {
        const result = await db.query('DELETE FROM subscription_plans WHERE id = $1 RETURNING id', [planId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Plan not found' });
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting plan:', err);
        res.status(500).json({ error: 'Failed to delete plan' });
    }
});

router.post('/:planId/features', authMiddleware, async (req, res) => {
    if (req.user.role !== 'SAAS_ADMIN') {
        return res.status(403).json({ error: 'Only SaaS Admin can add features' });
    }
    
    const { planId } = req.params;
    const { featureText } = req.body;
    
    if (!featureText) {
        return res.status(400).json({ error: 'Feature text is required' });
    }
    
    try {
        const maxOrder = await db.query(
            'SELECT COALESCE(MAX(display_order), 0) + 1 as next_order FROM plan_features WHERE plan_id = $1',
            [planId]
        );
        
        const result = await db.query(
            'INSERT INTO plan_features (plan_id, feature_text, display_order) VALUES ($1, $2, $3) RETURNING *',
            [planId, featureText, maxOrder.rows[0].next_order]
        );
        
        res.status(201).json({
            id: result.rows[0].id,
            text: result.rows[0].feature_text,
            displayOrder: result.rows[0].display_order
        });
    } catch (err) {
        console.error('Error adding feature:', err);
        res.status(500).json({ error: 'Failed to add feature' });
    }
});

// Declared before '/:planId/features/:featureId' - otherwise that route captures
// 'reorder' as a featureId and this one is unreachable (Express matches in order).
router.put('/:planId/features/reorder', authMiddleware, async (req, res) => {
    if (req.user.role !== 'SAAS_ADMIN') {
        return res.status(403).json({ error: 'Only SaaS Admin can reorder features' });
    }
    
    const { planId } = req.params;
    const { featureIds } = req.body;
    
    if (!featureIds || !Array.isArray(featureIds)) {
        return res.status(400).json({ error: 'Feature IDs array is required' });
    }
    
    try {
        for (let i = 0; i < featureIds.length; i++) {
            await db.query(
                'UPDATE plan_features SET display_order = $1 WHERE id = $2 AND plan_id = $3',
                [i + 1, featureIds[i], planId]
            );
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error reordering features:', err);
        res.status(500).json({ error: 'Failed to reorder features' });
    }
});

router.put('/:planId/features/:featureId', authMiddleware, async (req, res) => {
    if (req.user.role !== 'SAAS_ADMIN') {
        return res.status(403).json({ error: 'Only SaaS Admin can update features' });
    }
    
    const { planId, featureId } = req.params;
    const { featureText, displayOrder } = req.body;
    
    try {
        const result = await db.query(
            `UPDATE plan_features SET 
                feature_text = COALESCE($1, feature_text),
                display_order = COALESCE($2, display_order)
             WHERE id = $3 AND plan_id = $4 RETURNING *`,
            [featureText, displayOrder, featureId, planId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Feature not found' });
        }
        
        res.json({
            id: result.rows[0].id,
            text: result.rows[0].feature_text,
            displayOrder: result.rows[0].display_order
        });
    } catch (err) {
        console.error('Error updating feature:', err);
        res.status(500).json({ error: 'Failed to update feature' });
    }
});

router.delete('/:planId/features/:featureId', authMiddleware, async (req, res) => {
    if (req.user.role !== 'SAAS_ADMIN') {
        return res.status(403).json({ error: 'Only SaaS Admin can delete features' });
    }
    
    const { planId, featureId } = req.params;
    
    try {
        const result = await db.query(
            'DELETE FROM plan_features WHERE id = $1 AND plan_id = $2 RETURNING id',
            [featureId, planId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Feature not found' });
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting feature:', err);
        res.status(500).json({ error: 'Failed to delete feature' });
    }
});



module.exports = router;
