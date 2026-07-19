const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { logActivity } = require('../services/auditService');
const jwt = require('jsonwebtoken');

router.get('/', authMiddleware, async (req, res) => {
    try {
        // Admin-only: rows carry owner contact details, SMTP settings, WhatsApp API
        // keys, registration IPs, and each farm's full user list. This was briefly
        // reachable unauthenticated (optionalAuth) for a long-dead login screen -
        // nothing outside the SaaS admin panel consumes it.
        if (req.user.role !== 'SAAS_ADMIN') {
            return res.status(403).json({ error: 'Only SaaS Admin can list farms' });
        }

        const result = await db.query('SELECT * FROM tenants ORDER BY created_at DESC');

        // We also need the users for each tenant
        const tenants = await Promise.all(result.rows.map(async (t) => {
            const userRes = await db.query('SELECT id, name, email, role FROM users WHERE tenant_id = $1', [t.id]);
            return {
                ...t,
                ownerName: t.owner_name,
                ownerEmail: t.owner_email,
                managerEmail: t.manager_email,
                joinedDate: t.created_at,
                smtpSettings: t.smtp_settings,
                whatsappNumber: t.whatsapp_number,
                whatsappApiKey: t.whatsapp_apikey,
                herdValueRate: Number(t.herd_value_rate) || 1100,
                logoUrl: t.logo_url,
                currency: t.currency || 'PKR',
                weightUnit: t.weight_unit || 'kg',
                branches: t.branches || [],
                createdAt: t.created_at,
                registrationIp: t.registration_ip || null,
                registrationUserAgent: t.registration_user_agent || null,
                users: userRes.rows
            };
        }));

        res.json(tenants);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', authMiddleware, async (req, res) => {
    // Admin-only farm creation (the public path is /api/auth/register). This route
    // previously had no auth at all - anyone could create tenants anonymously.
    if (req.user.role !== 'SAAS_ADMIN') {
        return res.status(403).json({ error: 'Only SaaS Admin can create farms directly' });
    }
    const t = req.body;
    try {
        const modules = t.tier === 'PREMIUM'
            ? ['CORE', 'QURBANI_TRACKING', 'FEED_OPTIMIZER', 'AI_ADVISOR', 'FINANCE', 'SUPPLIER_MANAGEMENT', 'LABOUR_MANAGEMENT', 'BREEDING_MANAGEMENT']
            : t.tier === 'STANDARD'
                ? ['CORE', 'QURBANI_TRACKING', 'FEED_OPTIMIZER', 'AI_ADVISOR']
                : ['CORE', 'QURBANI_TRACKING'];

        const result = await db.query(
            `INSERT INTO tenants (name, owner_name, owner_email, tier, modules, locale, currency, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE') RETURNING *`,
            [t.name, t.ownerName, t.ownerEmail, t.tier, modules, 'en-PK', 'PKR']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST impersonate: issues a real, short-lived session as the farm's OWNER so the
// admin panel's "Login as Farm" actually works. The old implementation only swapped
// frontend state while every API call still carried the admin's own token - and
// since routes derive the tenant strictly from the JWT (the tenant-isolation fix),
// the admin just saw empty data. Impersonation sessions last 4 hours, not 7 days.
router.post('/:tenantId/impersonate', authMiddleware, async (req, res) => {
    if (req.user.role !== 'SAAS_ADMIN') {
        return res.status(403).json({ error: 'Only SaaS Admin can impersonate farms' });
    }
    const { tenantId } = req.params;
    try {
        const ownerRes = await db.query(
            `SELECT u.id, u.name, u.email, u.role FROM users u
             WHERE u.tenant_id = $1 AND u.role = 'OWNER' ORDER BY u.created_at LIMIT 1`,
            [tenantId]
        );
        if (ownerRes.rows.length === 0) {
            return res.status(404).json({ error: 'This farm has no OWNER user to impersonate' });
        }
        const owner = ownerRes.rows[0];

        const tenantRes = await db.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
        if (tenantRes.rows.length === 0) {
            return res.status(404).json({ error: 'Farm not found' });
        }
        const t = tenantRes.rows[0];

        const expiresInMs = 4 * 60 * 60 * 1000;
        const token = jwt.sign({ userId: owner.id }, process.env.JWT_SECRET, { expiresIn: '4h' });
        await db.query(
            `INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`,
            [owner.id, token, new Date(Date.now() + expiresInMs)]
        );

        await logActivity(tenantId, req.user.id, 'UPDATE', 'TENANT', tenantId, {
            message: `SaaS Admin ${req.user.email} started an impersonation session as ${owner.email}`
        });

        res.json({
            token,
            user: { id: owner.id, name: owner.name, email: owner.email, role: owner.role },
            tenant: {
                id: t.id,
                name: t.name,
                tier: t.tier,
                modules: t.modules || ['CORE'],
                status: t.status,
                herdValueRate: Number(t.herd_value_rate) || 1100,
                smtpSettings: t.smtp_settings,
                logoUrl: t.logo_url,
                currency: t.currency || 'PKR',
                weightUnit: t.weight_unit || 'kg',
                branches: t.branches || [],
                legacyTagScheme: t.legacy_tag_scheme !== false
            }
        });
    } catch (err) {
        console.error('Impersonation error:', err);
        res.status(500).json({ error: 'Failed to start impersonation session' });
    }
});

router.put('/:tenantId', authMiddleware, async (req, res) => {
    const { tenantId } = req.params;
    const { name, ownerEmail, managerEmail, whatsappNumber, whatsappApiKey, smtpSettings, herdValueRate, logoUrl, currency, weightUnit, branches } = req.body;

    console.log('Tenant update request:', {
        tenantId,
        userRole: req.user.role,
        userTenantId: req.user.tenantId,
        hasLogoUrl: !!logoUrl,
        logoUrlLength: logoUrl ? logoUrl.length : 0
    });
    // Allow SAAS_ADMIN, or the tenant's OWNER/MANAGER to update
    if (req.user.role !== 'SAAS_ADMIN' && req.user.role !== 'OWNER' && req.user.role !== 'MANAGER') {
        return res.status(403).json({ error: 'Only farm owners or managers can update settings' });
    }

    // For non-admin users, verify they own this tenant
    if (req.user.role !== 'SAAS_ADMIN') {
        // Compare as strings to avoid UUID type issues
        const userTenant = String(req.user.tenantId || '');
        const requestedTenant = String(tenantId);
        if (userTenant !== requestedTenant) {
            console.log('Access denied - tenant mismatch:', { userTenant, requestedTenant });
            return res.status(403).json({ error: 'Access denied' });
        }
    }

    try {
        const result = await db.query(
            `UPDATE tenants SET 
                name = COALESCE($1, name),
                owner_email = COALESCE($2, owner_email),
                manager_email = COALESCE($3, manager_email),
                smtp_settings = COALESCE($4::jsonb, smtp_settings),
                herd_value_rate = COALESCE($5, herd_value_rate),
                logo_url = COALESCE($6, logo_url),
                currency = COALESCE($7, currency),
                weight_unit = COALESCE($8, weight_unit),
                branches = COALESCE($9::jsonb, branches),
                whatsapp_number = COALESCE($10, whatsapp_number),
                whatsapp_apikey = COALESCE($11, whatsapp_apikey),
                updated_at = NOW()
             WHERE id = $12 RETURNING *`,
            [name, ownerEmail, managerEmail, smtpSettings ? JSON.stringify(smtpSettings) : null, herdValueRate, logoUrl, currency, weightUnit, branches ? JSON.stringify(branches) : null, whatsappNumber, whatsappApiKey, tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Farm not found' });
        }

        const t = result.rows[0];
        console.log('Tenant updated successfully:', t.id);

        // AUDIT LOG
        await logActivity(tenantId, req.user ? req.user.id : null, 'UPDATE', 'TENANT', tenantId, {
            message: 'Farm settings and profile updated',
            farmName: t.name,
            updatedCurrency: t.currency
        });

        res.json({
            ...t,
            ownerName: t.owner_name,
            ownerEmail: t.owner_email,
            managerEmail: t.manager_email,
            smtpSettings: t.smtp_settings,
            whatsappNumber: t.whatsapp_number,
            whatsappApiKey: t.whatsapp_apikey,
            herdValueRate: Number(t.herd_value_rate) || 1100,
            logoUrl: t.logo_url,
            currency: t.currency || 'PKR',
            weightUnit: t.weight_unit || 'kg',
            branches: t.branches || []
        });
    } catch (err) {
        console.error('Error updating tenant:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// SAAS Admin: Update tenant tier and apply module package
router.put('/:tenantId/tier', authMiddleware, async (req, res) => {
    const { tenantId } = req.params;
    const { tier } = req.body;

    if (req.user.role !== 'SAAS_ADMIN') {
        return res.status(403).json({ error: 'Only SaaS Admin can modify subscription tiers' });
    }

    const ALL_MODULES = ['CORE', 'QURBANI_TRACKING', 'FEED_OPTIMIZER', 'AI_ADVISOR', 'FINANCE', 'SUPPLIER_MANAGEMENT', 'LABOUR_MANAGEMENT', 'BREEDING_MANAGEMENT'];

    const modules = (tier === 'PREMIUM' || tier === 'FREE')
        ? ALL_MODULES
        : tier === 'STANDARD'
            ? ['CORE', 'QURBANI_TRACKING', 'FEED_OPTIMIZER', 'AI_ADVISOR']
            : ['CORE', 'QURBANI_TRACKING'];

    try {
        const result = await db.query(
            `UPDATE tenants SET tier = $1, modules = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
            [tier, modules, tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Farm not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating modules:', err);
        res.status(500).json({ error: 'Failed to update modules' });
    }
});

// SAAS Admin: Update tenant status (block/allow)
router.put('/:tenantId/status', authMiddleware, async (req, res) => {
    const { tenantId } = req.params;
    const { status } = req.body;

    if (req.user.role !== 'SAAS_ADMIN') {
        return res.status(403).json({ error: 'Only SaaS Admin can change farm status' });
    }

    if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const result = await db.query(
            `UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
            [status, tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Farm not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating status:', err);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// SAAS Admin: Get users for a tenant
router.get('/:tenantId/users', authMiddleware, async (req, res) => {
    const { tenantId } = req.params;

    if (req.user.role !== 'SAAS_ADMIN' && req.user.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const result = await db.query(
            'SELECT id, name, email, role, is_verified, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at',
            [tenantId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SAAS Admin: Add user to a tenant
router.post('/:tenantId/users', authMiddleware, async (req, res) => {
    const { tenantId } = req.params;
    const { name, email, role } = req.body;

    if (req.user.role !== 'SAAS_ADMIN') {
        return res.status(403).json({ error: 'Only SaaS Admin can add users' });
    }

    if (!name || !email || !role) {
        return res.status(400).json({ error: 'Name, email, and role are required' });
    }

    if (!['OWNER', 'MANAGER', 'LABOR'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }

    try {
        // Check if email already exists
        const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const result = await db.query(
            `INSERT INTO users (tenant_id, name, email, role, is_verified) 
             VALUES ($1, $2, $3, $4, true) RETURNING id, name, email, role, is_verified, created_at`,
            [tenantId, name, email.toLowerCase(), role]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding user:', err);
        res.status(500).json({ error: 'Failed to add user' });
    }
});

// SAAS Admin: Remove user from tenant
router.delete('/:tenantId/users/:userId', authMiddleware, async (req, res) => {
    const { tenantId, userId } = req.params;

    if (req.user.role !== 'SAAS_ADMIN') {
        return res.status(403).json({ error: 'Only SaaS Admin can remove users' });
    }

    try {
        const result = await db.query(
            'DELETE FROM users WHERE id = $1 AND tenant_id = $2 RETURNING id',
            [userId, tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error removing user:', err);
        res.status(500).json({ error: 'Failed to remove user' });
    }
});

// SAAS Admin: Delete a tenant completely
router.delete('/:tenantId', authMiddleware, async (req, res) => {
    const { tenantId } = req.params;

    if (req.user.role !== 'SAAS_ADMIN') {
        return res.status(403).json({ error: 'Only SaaS Admin can delete farms' });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // Note: Most tables (cattle, users, payments, feed, etc.) have ON DELETE CASCADE configured
        // in the database schema linked to the tenants table. However, we explicitly delete from
        // tables that might not have cascading constraints just to be safe.

        // Explicit deletes for non-cascading tables (based on the schema assessment)
        await client.query('DELETE FROM lactations WHERE tenant_id = $1', [tenantId]);
        await client.query('DELETE FROM milk_logs WHERE tenant_id = $1', [tenantId]);
        await client.query('DELETE FROM embryo_bank WHERE tenant_id = $1', [tenantId]);
        await client.query('DELETE FROM semen_bank WHERE tenant_id = $1', [tenantId]);

        // The final delete which will trigger CASCADE for all remaining tables (users, cattle, etc)
        await client.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
        await client.query('COMMIT');
        console.log(`Successfully deleted tenant: ${tenantId}`);
        res.json({ success: true, message: 'Farm deleted successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error deleting tenant:', err);
        res.status(500).json({ error: 'Failed to delete farm. It may have existing references blocking deletion.' });
    } finally {
        client.release();
    }
});

// Billing: Get Tenant Subscription Info
router.get('/:tenantId/billing', authMiddleware, async (req, res) => {
    const { tenantId } = req.params;

    if (req.user.role !== 'SAAS_ADMIN' && req.user.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const result = await db.query(
            `SELECT ts.*, sp.name as plan_name, sp.code as plan_code, sp.price_pkr, sp.user_limit, sp.cattle_limit
             FROM tenant_subscriptions ts
             JOIN subscription_plans sp ON ts.plan_id = sp.id
             WHERE ts.tenant_id = $1 AND ts.status IN ('ACTIVE', 'TRIAL')
             ORDER BY ts.created_at DESC LIMIT 1`,
            [tenantId]
        );

        res.json(result.rows[0] || null);
    } catch (err) {
        console.error('Error fetching billing:', err);
        res.status(500).json({ error: 'Failed to fetch billing details' });
    }
});

// Billing: Upgrade Plan (Simulation)
router.post('/:tenantId/upgrade', authMiddleware, async (req, res) => {
    const { tenantId } = req.params;
    const { planId } = req.body;

    if (req.user.role !== 'SAAS_ADMIN' && req.user.role !== 'OWNER') {
        return res.status(403).json({ error: 'Only Farm Owners can upgrade plans' });
    }

    if (req.user.role !== 'SAAS_ADMIN' && req.user.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // Fetch requested plan
        const planResult = await client.query('SELECT * FROM subscription_plans WHERE id = $1', [planId]);
        if (planResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Plan not found' });
        }
        const plan = planResult.rows[0];

        // Fetch tenant
        const tenantQuery = await client.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
        if (tenantQuery.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Tenant not found' });
        }
        const oldTenant = tenantQuery.rows[0];

        // Cancel existing active subscription if any
        await client.query(`
            UPDATE tenant_subscriptions 
            SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW() 
            WHERE tenant_id = $1 AND status IN ('ACTIVE', 'TRIAL')
        `, [tenantId]);

        // Create new subscription record
        await client.query(`
            INSERT INTO tenant_subscriptions 
            (tenant_id, plan_id, status, amount, billing_cycle, start_date, next_billing_date) 
            VALUES ($1, $2, 'ACTIVE', $3, 'MONTHLY', NOW(), NOW() + INTERVAL '1 month')
        `, [tenantId, planId, plan.price_pkr || 0]);

        // Map plan code to tier and modules. Normally this would be a lookup table or defined constants.
        let tier = 'BASIC';
        let modules = ['CORE'];
        if (plan.code === 'STANDARD') {
            tier = 'STANDARD';
            modules = ['CORE', 'FEED_OPTIMIZER'];
        } else if (plan.code === 'PREMIUM') {
            tier = 'PREMIUM';
            modules = ['CORE', 'AI_ADVISOR', 'FEED_OPTIMIZER', 'QURBANI_TRACKING', 'FINANCE', 'SUPPLIER_MANAGEMENT', 'LABOUR_MANAGEMENT', 'BREEDING_MANAGEMENT'];
        }

        // Update the actual tenant record to grant immediate access
        const updateResult = await client.query(
            `UPDATE tenants SET tier = $1, modules = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
            [tier, JSON.stringify(modules), tenantId]
        );

        await client.query('COMMIT');

        // Log the upgrade action
        await logActivity(tenantId, req.user.id, 'UPDATE', 'TENANT', tenantId, {
            message: `Farm upgraded to ${plan.code} plan`,
            oldTier: oldTenant.tier,
            newTier: tier,
            amount: plan.price_pkr
        });

        res.json(updateResult.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error upgrading plan:', err);
        res.status(500).json({ error: 'Failed to process upgrade' });
    } finally {
        client.release();
    }
});

module.exports = router;