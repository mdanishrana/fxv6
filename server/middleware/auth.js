const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;

const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const sessionResult = await db.query(
            'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()',
            [token]
        );
        
        if (sessionResult.rows.length === 0) {
            return res.status(401).json({ error: 'Session expired. Please login again.' });
        }
        
        const userResult = await db.query(
            `SELECT u.*, t.id as tenant_id, t.name as tenant_name, t.tier, t.modules, t.status as tenant_status
             FROM users u
             LEFT JOIN tenants t ON u.tenant_id = t.id
             WHERE u.id = $1`,
            [decoded.userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        const user = userResult.rows[0];
        
        if (user.tenant_status === 'SUSPENDED') {
            return res.status(403).json({ error: 'Your farm account has been suspended' });
        }
        
        req.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            isVerified: user.is_verified,
            tenantId: user.tenant_id,
            tenantName: user.tenant_name,
            tier: user.tier,
            modules: user.modules
        };
        
        next();
        
    } catch (err) {
        console.error('Auth middleware error:', err);
        return res.status(401).json({ error: 'Invalid token' });
    }
};

const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }
    
    try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const userResult = await db.query(
            `SELECT u.*, t.id as tenant_id, t.name as tenant_name, t.tier, t.modules
             FROM users u
             LEFT JOIN tenants t ON u.tenant_id = t.id
             WHERE u.id = $1`,
            [decoded.userId]
        );
        
        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            req.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                tenantId: user.tenant_id,
                tenantName: user.tenant_name,
                tier: user.tier,
                modules: user.modules
            };
        }
    } catch (err) {
    }
    
    next();
};

const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        
        next();
    };
};

module.exports = { authMiddleware, optionalAuth, requireRole };
