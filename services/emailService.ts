
import { Tenant, FeedItem } from "../types";

export const sendLowStockAlert = async (
    tenant: Tenant,
    lowStockItems: FeedItem[]
): Promise<{ success: boolean; message: string }> => {
    
    // 1. Check if Alerts are enabled (we use the flag from settings, but ignore host/port)
    if (tenant.smtpSettings && !tenant.smtpSettings.enabled) {
        console.log("Email Alert Skipped: Alerts disabled by tenant.");
        return { success: false, message: "Alerts Disabled" };
    }

    // 2. Check Recipient
    const recipients = [];
    if (tenant.ownerEmail) recipients.push(tenant.ownerEmail);
    if (tenant.managerEmail) recipients.push(tenant.managerEmail);

    if (recipients.length === 0) {
         return { success: false, message: "No recipients configured" };
    }

    // 3. Simulate SaaS System Emailer
    // The sender configuration is now handled at the SaaS/System level (e.g. SendGrid/AWS SES/Exchange Backend)
    // Not configured by the tenant.
    const systemSender = "alerts@farmxpert.com";
    
    console.log(`[System Mailer] Preparing alert for Tenant: ${tenant.name}`);
    
    const subject = `URGENT: Low Feed Stock Alert - ${tenant.name}`;
    const body = `
        Dear Farm Owner/Manager,
        
        This is an automated alert from the FarmXpert Platform.
        The following feed ingredients have fallen below your reorder threshold:
        
        ${lowStockItems.map(item => `- ${item.name}: ${item.quantityKg} kg remaining (Threshold: ${item.lowStockThreshold} kg)`).join('\n')}
        
        Please arrange procurement immediately.
        
        Regards,
        FarmXpert System
    `;

    // Simulate Network Delay for System API
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(`[System Mailer] Sending from ${systemSender} to: ${recipients.join(', ')}`);
    console.log(`[System Mailer] Content: \n${body}`);

    return { success: true, message: `System alert sent to ${recipients.length} recipients.` };
};