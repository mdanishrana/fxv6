const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { sendVerificationEmail } = require('../services/emailService');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;

        if (req.user.role !== 'SAAS_ADMIN' && req.user.tenantId !== tenantId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await db.query(
            'SELECT id, name, email, role, mobile, is_verified FROM users WHERE tenant_id = $1 ORDER BY created_at',
            [tenantId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.post('/:tenantId', async (req, res) => {
    const { tenantId } = req.params;
    const { name, email, role, mobile } = req.body;

    if (req.user.role !== 'SAAS_ADMIN' && req.user.role !== 'OWNER') {
        return res.status(403).json({ error: 'Only farm owners can add users' });
    }

    if (req.user.role !== 'SAAS_ADMIN' && req.user.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (!name || !email || !role) {
        return res.status(400).json({ error: 'Name, email, and role are required' });
    }

    if (!['MANAGER', 'LABOR', 'READ_ONLY'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Only MANAGER, LABOR, or READ_ONLY can be added.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
        const existingUser = await db.query(
            'SELECT id, name, role, tenant_id FROM users WHERE LOWER(email) = $1',
            [normalizedEmail]
        );

        if (existingUser.rows.length > 0) {
            const existing = existingUser.rows[0];
            if (existing.tenant_id === tenantId) {
                return res.status(400).json({
                    error: `This email is already registered in your farm as ${existing.role}`
                });
            } else {
                return res.status(400).json({
                    error: 'This email is already registered with another farm'
                });
            }
        }

        const tenantResult = await db.query('SELECT tier FROM tenants WHERE id = $1', [tenantId]);
        if (tenantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Farm not found' });
        }

        const tier = tenantResult.rows[0].tier;
        const userLimits = { 'BASIC': 2, 'STANDARD': 5, 'PREMIUM': 20 };
        const limit = userLimits[tier] || 2;

        const countResult = await db.query(
            "SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND role != 'ANIMAL_OWNER'",
            [tenantId]
        );
        const currentCount = parseInt(countResult.rows[0].count);

        if (currentCount >= limit) {
            return res.status(400).json({
                error: `User limit reached (${limit}). Please upgrade your plan.`
            });
        }

        const tempPassword = crypto.randomBytes(8).toString('hex');
        const passwordHash = await bcrypt.hash(tempPassword, 12);

        const result = await db.query(
            `INSERT INTO users (tenant_id, name, email, mobile, role, password_hash, is_verified)
             VALUES ($1, $2, $3, $4, $5, $6, false)
             RETURNING id, name, email, role, mobile, is_verified`,
            [tenantId, name, normalizedEmail, mobile || null, role, passwordHash]
        );

        const newUser = result.rows[0];

        try {
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

            await db.query(
                `INSERT INTO email_verification_tokens (user_id, token, expires_at)
                 VALUES ($1, $2, $3)`,
                [newUser.id, verificationToken, expiresAt]
            );

            await sendVerificationEmail(normalizedEmail, name, verificationToken);
        } catch (emailErr) {
            console.error('Failed to send verification email:', emailErr);
        }

        res.status(201).json({
            ...newUser,
            message: 'User added successfully. They will receive an email to set their password.'
        });

    } catch (err) {
        console.error('Error adding user:', err);
        if (err.code === '23505') {
            return res.status(400).json({ error: 'This email is already registered' });
        }
        res.status(500).json({ error: 'Failed to add user' });
    }
});

router.delete('/:tenantId/:userId', async (req, res) => {
    const { tenantId, userId } = req.params;

    if (req.user.role !== 'SAAS_ADMIN' && req.user.role !== 'OWNER') {
        return res.status(403).json({ error: 'Only farm owners can remove users' });
    }

    if (req.user.role !== 'SAAS_ADMIN' && req.user.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const userResult = await db.query(
            'SELECT role FROM users WHERE id = $1 AND tenant_id = $2',
            [userId, tenantId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (userResult.rows[0].role === 'OWNER') {
            return res.status(400).json({ error: 'Cannot delete the farm owner' });
        }

        await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
        await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);
        await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

        await db.query('DELETE FROM users WHERE id = $1', [userId]);

        res.json({ message: 'User deleted successfully' });

    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

module.exports = router;
