const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } = require('../services/emailService');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';

const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

const generateRandomToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

// Brute-force / abuse protection on sensitive auth endpoints
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' }
});
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many accounts created from this location. Please try again later.' }
});
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many password reset attempts. Please try again later.' }
});
// A 6-digit TOTP code is only 1 in a million - without a tight limit here it's
// brute-forceable within the 5-minute pending-login window.
const mfaChallengeLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many verification attempts. Please try logging in again.' }
});

const MFA_PENDING_EXPIRY_MS = 5 * 60 * 1000;
const BACKUP_CODE_COUNT = 8;

function generateBackupCodes() {
    // e.g. "K3F9-QX7M" - short enough to write down, long enough that 8 of them
    // aren't meaningfully guessable.
    const codes = [];
    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
        const raw = crypto.randomBytes(5).toString('hex').toUpperCase().slice(0, 8);
        codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
    }
    return codes;
}

async function issueSession(res, user, req) {
    const token = generateToken(user.id);
    await db.query(
        `INSERT INTO sessions (user_id, token, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, token, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), req.ip || null, (req.headers['user-agent'] || '').slice(0, 500) || null]
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
            isVerified: user.is_verified,
            mfaEnabled: user.mfa_enabled
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
            branches: user.tenant_branches || [],
            legacyTagScheme: user.tenant_legacy_tag_scheme !== false
        } : null
    });
}

router.post('/register', registerLimiter, async (req, res) => {
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

        // Registration origin, for the SaaS admin's monitoring view. req.ip is the
        // real client address because app.js sets trust proxy for the nginx hop.
        const registrationIp = req.ip || null;
        const registrationUserAgent = (req.headers['user-agent'] || '').slice(0, 500) || null;

        const tenantResult = await db.query(
            `INSERT INTO tenants (name, owner_name, owner_email, owner_mobile, tier, status, modules, locale, currency, registration_ip, registration_user_agent)
             VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, 'en-PK', 'PKR', $7, $8) RETURNING *`,
            [farmName, name, email.toLowerCase(), mobile, tier, modules, registrationIp, registrationUserAgent]
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

router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const userResult = await db.query(
            `SELECT u.*, t.id as tenant_id, t.name as tenant_name, t.tier, t.modules, t.status as tenant_status, t.herd_value_rate as tenant_herd_value_rate, t.logo_url as tenant_logo_url, t.currency as tenant_currency, t.weight_unit as tenant_weight_unit, t.branches as tenant_branches, t.legacy_tag_scheme as tenant_legacy_tag_scheme
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

        if (user.mfa_enabled) {
            const mfaToken = generateRandomToken();
            await db.query(
                `INSERT INTO mfa_pending_logins (user_id, token, expires_at)
                 VALUES ($1, $2, $3)`,
                [user.id, mfaToken, new Date(Date.now() + MFA_PENDING_EXPIRY_MS)]
            );
            return res.json({ mfaRequired: true, mfaToken });
        }

        await issueSession(res, user, req);

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

router.post('/mfa/challenge', mfaChallengeLimiter, async (req, res) => {
    const { mfaToken, code, backupCode } = req.body;

    if (!mfaToken || (!code && !backupCode)) {
        return res.status(400).json({ error: 'A verification code is required' });
    }

    try {
        const pendingResult = await db.query(
            `SELECT * FROM mfa_pending_logins WHERE token = $1 AND expires_at > NOW()`,
            [mfaToken]
        );
        if (pendingResult.rows.length === 0) {
            return res.status(401).json({ error: 'Your login session has expired. Please log in again.' });
        }
        const pending = pendingResult.rows[0];

        const userResult = await db.query(
            `SELECT u.*, t.id as tenant_id, t.name as tenant_name, t.tier, t.modules, t.status as tenant_status, t.herd_value_rate as tenant_herd_value_rate, t.logo_url as tenant_logo_url, t.currency as tenant_currency, t.weight_unit as tenant_weight_unit, t.branches as tenant_branches, t.legacy_tag_scheme as tenant_legacy_tag_scheme
             FROM users u
             LEFT JOIN tenants t ON u.tenant_id = t.id
             WHERE u.id = $1`,
            [pending.user_id]
        );
        if (userResult.rows.length === 0 || !userResult.rows[0].mfa_enabled) {
            return res.status(401).json({ error: 'Invalid login session. Please log in again.' });
        }
        const user = userResult.rows[0];

        let verified = false;
        if (code) {
            verified = authenticator.check(String(code).trim(), user.mfa_secret);
        } else if (backupCode) {
            const submitted = String(backupCode).trim().toUpperCase();
            const backupCodes = user.mfa_backup_codes || [];
            for (let i = 0; i < backupCodes.length; i++) {
                if (await bcrypt.compare(submitted, backupCodes[i])) {
                    verified = true;
                    const remaining = backupCodes.slice(0, i).concat(backupCodes.slice(i + 1));
                    await db.query('UPDATE users SET mfa_backup_codes = $1 WHERE id = $2', [remaining, user.id]);
                    break;
                }
            }
        }

        if (!verified) {
            return res.status(401).json({ error: 'Invalid verification code' });
        }

        await db.query('DELETE FROM mfa_pending_logins WHERE token = $1', [mfaToken]);
        await issueSession(res, user, req);

    } catch (err) {
        console.error('MFA challenge error:', err);
        res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
});

router.post('/mfa/setup', authMiddleware, async (req, res) => {
    try {
        const userResult = await db.query('SELECT email, mfa_enabled FROM users WHERE id = $1', [req.user.id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = userResult.rows[0];
        if (user.mfa_enabled) {
            return res.status(400).json({ error: 'Two-factor authentication is already enabled' });
        }

        const secret = authenticator.generateSecret();
        const otpauthUrl = authenticator.keyuri(user.email, 'FarmXpert', secret);
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

        res.json({ secret, otpauthUrl, qrCodeDataUrl });
    } catch (err) {
        console.error('MFA setup error:', err);
        res.status(500).json({ error: 'Could not start two-factor setup. Please try again.' });
    }
});

router.post('/mfa/enable', authMiddleware, async (req, res) => {
    const { secret, code } = req.body;

    if (!secret || !code) {
        return res.status(400).json({ error: 'Secret and verification code are required' });
    }

    try {
        if (!authenticator.check(String(code).trim(), secret)) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        const backupCodes = generateBackupCodes();
        const hashedBackupCodes = await Promise.all(backupCodes.map(c => bcrypt.hash(c, 10)));

        await db.query(
            `UPDATE users SET mfa_enabled = true, mfa_secret = $1, mfa_backup_codes = $2 WHERE id = $3`,
            [secret, hashedBackupCodes, req.user.id]
        );

        res.json({ message: 'Two-factor authentication enabled', backupCodes });
    } catch (err) {
        console.error('MFA enable error:', err);
        res.status(500).json({ error: 'Could not enable two-factor authentication. Please try again.' });
    }
});

router.post('/mfa/disable', authMiddleware, async (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'Password is required' });
    }

    try {
        const userResult = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const validPassword = await bcrypt.compare(password, userResult.rows[0].password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        await db.query(
            `UPDATE users SET mfa_enabled = false, mfa_secret = NULL, mfa_backup_codes = NULL WHERE id = $1`,
            [req.user.id]
        );

        res.json({ message: 'Two-factor authentication disabled' });
    } catch (err) {
        console.error('MFA disable error:', err);
        res.status(500).json({ error: 'Could not disable two-factor authentication. Please try again.' });
    }
});

router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
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

router.post('/reset-password', passwordResetLimiter, async (req, res) => {
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
            `SELECT u.id, u.name, u.email, u.role, u.is_verified, u.mfa_enabled,
                    t.id as tenant_id, t.name as tenant_name, t.tier, t.modules, t.status as tenant_status, t.herd_value_rate as tenant_herd_value_rate, t.logo_url as tenant_logo_url, t.currency as tenant_currency, t.weight_unit as tenant_weight_unit, t.branches as tenant_branches, t.legacy_tag_scheme as tenant_legacy_tag_scheme
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
                isVerified: user.is_verified,
                mfaEnabled: user.mfa_enabled
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
                branches: user.tenant_branches || [],
                legacyTagScheme: user.tenant_legacy_tag_scheme !== false
            } : null
        });

    } catch (err) {
        console.error('Auth check error:', err);
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;
