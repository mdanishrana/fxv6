const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } = require('../services/emailService');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';

const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

const generateRandomToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

router.post('/register', async (req, res) => {
    const { name, email, password, farmName, mobile, tier = 'BASIC' } = req.body;

    if (!name || !email || !password || !farmName) {
        return res.status(400).json({ error: 'Name, email, password, and farm name are required' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'An account with this email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const ALL_MODULES = ['CORE', 'QURBANI_TRACKING', 'FEED_OPTIMIZER', 'AI_ADVISOR', 'FINANCE', 'SUPPLIER_MANAGEMENT', 'LABOUR_MANAGEMENT', 'BREEDING_MANAGEMENT'];

        const modules = (tier === 'PREMIUM' || tier === 'FREE')
            ? ALL_MODULES
            : tier === 'STANDARD'
                ? ['CORE', 'QURBANI_TRACKING', 'FEED_OPTIMIZER', 'AI_ADVISOR']
                : ['CORE', 'QURBANI_TRACKING'];

        const tenantResult = await db.query(
            `INSERT INTO tenants (name, owner_name, owner_email, owner_mobile, tier, status, modules, locale, currency)
             VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, 'en-PK', 'PKR') RETURNING *`,
            [farmName, name, email.toLowerCase(), mobile, tier, modules]
        );
        const tenant = tenantResult.rows[0];

        const userResult = await db.query(
            `INSERT INTO users (tenant_id, name, email, mobile, password_hash, role, is_verified)
             VALUES ($1, $2, $3, $4, $5, 'OWNER', false) RETURNING id, name, email, role`,
            [tenant.id, name, email.toLowerCase(), mobile, passwordHash]
        );
        const user = userResult.rows[0];

        const verificationToken = generateRandomToken();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await db.query(
            `INSERT INTO email_verification_tokens (user_id, token, expires_at)
             VALUES ($1, $2, $3)`,
            [user.id, verificationToken, expiresAt]
        );

        await sendVerificationEmail(email, name, verificationToken);

        const token = generateToken(user.id);

        await db.query(
            `INSERT INTO sessions (user_id, token, expires_at)
             VALUES ($1, $2, $3)`,
            [user.id, token, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
        );

        res.status(201).json({
            message: 'Registration successful! Please check your email to verify your account.',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            },
            tenant: {
                id: tenant.id,
                name: tenant.name,
                tier: tenant.tier,
                modules: tenant.modules
            }
        });

    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const userResult = await db.query(
            `SELECT u.*, t.id as tenant_id, t.name as tenant_name, t.tier, t.modules, t.status as tenant_status, t.herd_value_rate as tenant_herd_value_rate, t.logo_url as tenant_logo_url, t.currency as tenant_currency, t.weight_unit as tenant_weight_unit, t.branches as tenant_branches
             FROM users u
             LEFT JOIN tenants t ON u.tenant_id = t.id
             WHERE u.email = $1`,
            [email.toLowerCase()]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = userResult.rows[0];

        if (!user.password_hash) {
            return res.status(401).json({ error: 'Please reset your password to login' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (user.tenant_status === 'SUSPENDED') {
            return res.status(403).json({ error: 'Your farm account has been suspended. Please contact support.' });
        }

        const token = generateToken(user.id);

        await db.query(
            `INSERT INTO sessions (user_id, token, expires_at)
             VALUES ($1, $2, $3)`,
            [user.id, token, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
        );

        await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isVerified: user.is_verified
            },
            tenant: user.tenant_id ? {
                id: user.tenant_id,
                name: user.tenant_name,
                tier: user.tier,
                modules: user.modules,
                herdValueRate: Number(user.tenant_herd_value_rate) || 1100,
                logoUrl: user.tenant_logo_url,
                currency: user.tenant_currency || 'PKR',
                weightUnit: user.tenant_weight_unit || 'kg',
                branches: user.tenant_branches || []
            } : null
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const userResult = await db.query('SELECT id, name, email FROM users WHERE email = $1', [email.toLowerCase()]);

        if (userResult.rows.length === 0) {
            return res.json({ message: 'If an account exists with this email, you will receive a password reset link.' });
        }

        const user = userResult.rows[0];
        const resetToken = generateRandomToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await db.query('UPDATE password_reset_tokens SET used = true WHERE user_id = $1', [user.id]);

        await db.query(
            `INSERT INTO password_reset_tokens (user_id, token, expires_at)
             VALUES ($1, $2, $3)`,
            [user.id, resetToken, expiresAt]
        );

        await sendPasswordResetEmail(user.email, user.name, resetToken);

        res.json({ message: 'If an account exists with this email, you will receive a password reset link.' });

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Failed to process request. Please try again.' });
    }
});

router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const tokenResult = await db.query(
            `SELECT * FROM password_reset_tokens 
             WHERE token = $1 AND used = false AND expires_at > NOW()`,
            [token]
        );

        if (tokenResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const resetToken = tokenResult.rows[0];
        const passwordHash = await bcrypt.hash(password, 12);

        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, resetToken.user_id]);

        await db.query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [resetToken.id]);

        await db.query('DELETE FROM sessions WHERE user_id = $1', [resetToken.user_id]);

        res.json({ message: 'Password reset successful. Please login with your new password.' });

    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Failed to reset password. Please try again.' });
    }
});

router.get('/verify-email', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).json({ error: 'Verification token is required' });
    }

    try {
        const tokenResult = await db.query(
            `SELECT * FROM email_verification_tokens 
             WHERE token = $1 AND expires_at > NOW()`,
            [token]
        );

        if (tokenResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired verification token' });
        }

        const verifyToken = tokenResult.rows[0];

        await db.query('UPDATE users SET is_verified = true WHERE id = $1', [verifyToken.user_id]);

        await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [verifyToken.user_id]);

        const userResult = await db.query(
            `SELECT u.name, u.email, t.name as farm_name 
             FROM users u 
             LEFT JOIN tenants t ON u.tenant_id = t.id 
             WHERE u.id = $1`,
            [verifyToken.user_id]
        );

        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            await sendWelcomeEmail(user.email, user.name, user.farm_name);
        }

        res.json({ message: 'Email verified successfully! Welcome to FarmXpert.' });

    } catch (err) {
        console.error('Verify email error:', err);
        res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
});

router.post('/logout', async (req, res) => {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
            await db.query('DELETE FROM sessions WHERE token = $1', [token]);
        } catch (err) {
            console.error('Logout error:', err);
        }
    }

    res.json({ message: 'Logged out successfully' });
});

router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        const sessionResult = await db.query(
            'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()',
            [token]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(401).json({ error: 'Session expired' });
        }

        const userResult = await db.query(
            `SELECT u.id, u.name, u.email, u.role, u.is_verified,
                    t.id as tenant_id, t.name as tenant_name, t.tier, t.modules, t.status as tenant_status, t.herd_value_rate as tenant_herd_value_rate, t.logo_url as tenant_logo_url, t.currency as tenant_currency, t.weight_unit as tenant_weight_unit, t.branches as tenant_branches
             FROM users u
             LEFT JOIN tenants t ON u.tenant_id = t.id
             WHERE u.id = $1`,
            [decoded.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isVerified: user.is_verified
            },
            tenant: user.tenant_id ? {
                id: user.tenant_id,
                name: user.tenant_name,
                tier: user.tier,
                modules: user.modules,
                status: user.tenant_status,
                herdValueRate: Number(user.tenant_herd_value_rate) || 1100,
                logoUrl: user.tenant_logo_url,
                currency: user.tenant_currency || 'PKR',
                weightUnit: user.tenant_weight_unit || 'kg',
                branches: user.tenant_branches || []
            } : null
        });

    } catch (err) {
        console.error('Auth check error:', err);
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;
