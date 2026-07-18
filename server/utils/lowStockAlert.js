const db = require('../db');

/**
 * Sends the low-stock email (and WhatsApp, if configured) for a tenant's
 * low-stock feed items. Shared by the manual "save ingredient" trigger,
 * the manual daily-processing route, and the nightly cron job.
 */
async function sendLowStockAlertForTenant(tenantId, lowStockItems) {
    if (!lowStockItems || lowStockItems.length === 0) {
        return { success: false, error: 'No low stock items provided' };
    }

    const tenantResult = await db.query(
        'SELECT name, owner_name, owner_email, whatsapp_number, whatsapp_apikey FROM tenants WHERE id = $1',
        [tenantId]
    );
    if (tenantResult.rows.length === 0) {
        return { success: false, error: 'Tenant not found' };
    }

    const tenant = tenantResult.rows[0];
    if (!tenant.owner_email) {
        return { success: false, error: 'No owner email configured for this farm' };
    }

    const { sendLowStockAlertEmail } = require('../services/emailService');
    const result = await sendLowStockAlertEmail(tenant.owner_email, tenant.owner_name, tenant.name, lowStockItems);

    if (tenant.whatsapp_number && tenant.whatsapp_apikey) {
        const { sendLowStockAlertWhatsApp } = require('../services/whatsappService');
        await sendLowStockAlertWhatsApp(tenant.whatsapp_number, tenant.whatsapp_apikey, tenant.owner_name, tenant.name, lowStockItems);
    }

    return result;
}

module.exports = { sendLowStockAlertForTenant };
