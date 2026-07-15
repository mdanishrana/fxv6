const express = require('express');
const { query } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Subscribe endpoint
router.post('/subscribe', async (req, res) => {
    const subscription = req.body;
    // const { userId } = req.user || { userId: null }; // Pending robust auth middleware
    // For now, receive userId from body if sent (insecure but functional for MVP/Plan)
    // Or just store as anonymous if not provided.
    // Ideally, we'd use the auth middleware here.
    const userId = req.body.userId || null;

    // Basic validation
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Invalid subscription object' });
    }

    try {
        await query(
            `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, created_at = NOW()`,
            [
                userId,
                subscription.endpoint,
                subscription.keys.p256dh,
                subscription.keys.auth
            ]
        );
        res.status(201).json({ message: 'Subscribed successfully' });
    } catch (err) {
        console.error('Error saving subscription:', err);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

// Send notification endpoint (Internal use or Admin)
router.post('/send', authMiddleware, requireRole('SAAS_ADMIN'), async (req, res) => {
    const { title, body, userId } = req.body;
    const { sendToUser, broadcast } = require('../services/notificationService');

    if (!title || !body) {
        return res.status(400).json({ error: 'Title and body are required' });
    }

    try {
        if (userId) {
            const result = await sendToUser(userId, title, body);
            res.json({ message: 'Notification sent', count: result.count });
        } else {
            // If no userId, treat as broadcast (or handle error if strict)
            // For now, let's explicit make a separate broadcast endpoint or allow it here
            const result = await broadcast(title, body);
            res.json({ message: 'Broadcast sent', count: result.count });
        }
    } catch (err) {
        console.error('Error sending notifications:', err);
        res.status(500).json({ error: 'Failed to send notifications' });
    }
});

router.post('/broadcast', authMiddleware, requireRole('SAAS_ADMIN'), async (req, res) => {
    const { title, body } = req.body;
    const { broadcast } = require('../services/notificationService');

    if (!title || !body) return res.status(400).json({ error: 'Title and body required' });

    try {
        const result = await broadcast(title, body);
        res.json({ success: true, count: result.count });
    } catch (err) {
        res.status(500).json({ error: 'Broadcast failed' });
    }
});

module.exports = router;
