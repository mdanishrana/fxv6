const webpush = require('web-push');
const { query } = require('../db');

// Configure web-push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@farmxpert.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

/**
 * Send a push notification to a specific user
 * @param {string} userId - The UUID of the user
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 */
async function sendToUser(userId, title, body) {
    try {
        const result = await query(
            'SELECT * FROM push_subscriptions WHERE user_id = $1',
            [userId]
        );

        if (result.rows.length === 0) return { count: 0 };

        const payload = JSON.stringify({ title, body });
        const notifications = result.rows.map(sub => {
            const pushConfig = {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth }
            };
            return webpush.sendNotification(pushConfig, payload)
                .catch(err => {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        console.log('Subscription expired, deleting:', sub.endpoint);
                        query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
                    } else {
                        console.error('Push error:', err);
                    }
                });
        });

        await Promise.all(notifications);
        return { count: notifications.length };
    } catch (err) {
        console.error('Error in sendToUser:', err);
        return { count: 0, error: err };
    }
}

/**
 * Send a push notification to a user by email (looks up userId first)
 * @param {string} email - User email
 * @param {string} title 
 * @param {string} body 
 */
async function sendToEmail(email, title, body) {
    if (!email) return;
    try {
        const userRes = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (userRes.rows.length > 0) {
            return await sendToUser(userRes.rows[0].id, title, body);
        }
    } catch (err) {
        console.error('Error looking up user for push:', err);
    }
}

/**
 * Broadcast to ALL subscribers (Use with caution)
 */
async function broadcast(title, body) {
    try {
        const result = await query('SELECT * FROM push_subscriptions');
        const payload = JSON.stringify({ title, body });

        const notifications = result.rows.map(sub => {
            const pushConfig = {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth }
            };
            return webpush.sendNotification(pushConfig, payload).catch(() => { });
        });

        await Promise.all(notifications);
        return { count: notifications.length };
    } catch (err) {
        console.error('Broadcast error:', err);
    }
}

module.exports = { sendToUser, sendToEmail, broadcast };
