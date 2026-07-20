const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER || 'farmxpertfx@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

// Check if email credentials are configured
const isEmailConfigured = () => {
    if (!GMAIL_APP_PASSWORD) {
        console.warn('WARNING: GMAIL_APP_PASSWORD not set. Email sending is disabled.');
        return false;
    }
    return true;
};

const transporter = GMAIL_APP_PASSWORD ? nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD
    }
}) : null;

const sendEmail = async (to, subject, html, extra = {}) => {
    if (!isEmailConfigured() || !transporter) {
        console.log(`Email NOT sent (no credentials configured): To=${to}, Subject=${subject}`);
        return { success: false, error: 'Email service not configured. Please set GMAIL_APP_PASSWORD.' };
    }

    try {
        const mailOptions = {
            from: `"FarmXpert" <${GMAIL_USER}>`,
            to,
            subject,
            html
        };
        if (extra.cc) mailOptions.cc = extra.cc;
        if (extra.attachments) mailOptions.attachments = extra.attachments;

        console.log(`Attempting to send email to: ${to}`);
        const result = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', result.messageId);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Email send error:', error.message);
        console.error('Full error:', error);
        return { success: false, error: error.message };
    }
};

const sendVerificationEmail = async (email, name, token) => {
    const verifyUrl = `${process.env.APP_URL || 'http://localhost:5000'}/verify-email?token=${token}`;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #10b981; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin:0;">🐄 FarmXpert</h1>
                <p style="margin:10px 0 0;">Cattle Feedlot Management</p>
            </div>
            <div class="content">
                <h2>Welcome, ${name}!</h2>
                <p>Thank you for registering with FarmXpert. Please verify your email address to complete your registration.</p>
                <center>
                    <a href="${verifyUrl}" class="button">Verify Email Address</a>
                </center>
                <p style="color: #64748b; font-size: 14px;">This link will expire in 24 hours.</p>
                <p>If you didn't create an account, please ignore this email.</p>
            </div>
            <div class="footer">
                <p>© ${new Date().getFullYear()} FarmXpert - Pakistan's Premier Farm Management Solution</p>
            </div>
        </div>
    </body>
    </html>
    `;

    return sendEmail(email, 'Verify Your FarmXpert Account', html);
};

const sendPasswordResetEmail = async (email, name, token) => {
    const resetUrl = `${process.env.APP_URL || 'http://localhost:5000'}/reset-password?token=${token}`;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #f59e0b; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin:0;">🐄 FarmXpert</h1>
                <p style="margin:10px 0 0;">Password Reset Request</p>
            </div>
            <div class="content">
                <h2>Hello, ${name}!</h2>
                <p>We received a request to reset your password. Click the button below to create a new password.</p>
                <center>
                    <a href="${resetUrl}" class="button">Reset Password</a>
                </center>
                <p style="color: #64748b; font-size: 14px;">This link will expire in 1 hour.</p>
                <p>If you didn't request a password reset, please ignore this email or contact support if you're concerned.</p>
            </div>
            <div class="footer">
                <p>© ${new Date().getFullYear()} FarmXpert - Pakistan's Premier Farm Management Solution</p>
            </div>
        </div>
    </body>
    </html>
    `;

    return sendEmail(email, 'Reset Your FarmXpert Password', html);
};

const sendWelcomeEmail = async (email, name, farmName) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .feature { background: white; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #10b981; }
            .button { display: inline-block; background: #10b981; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin:0;">🐄 Welcome to FarmXpert!</h1>
                <p style="margin:10px 0 0;">Your Farm Management Journey Begins</p>
            </div>
            <div class="content">
                <h2>Congratulations, ${name}!</h2>
                <p>Your farm <strong>"${farmName}"</strong> has been successfully registered.</p>
                
                <h3>What you can do now:</h3>
                <div class="feature">📊 <strong>Track Cattle</strong> - Register animals, monitor weight gain</div>
                <div class="feature">🌾 <strong>Manage Feed</strong> - Track inventory, create ration packages</div>
                <div class="feature">💉 <strong>Vaccinations</strong> - Schedule and track FMD, LSD vaccines</div>
                <div class="feature">🕌 <strong>Qurbani Sales</strong> - Manage seasonal sales (Premium)</div>
                
                <center>
                    <a href="${process.env.APP_URL || 'http://localhost:5000'}" class="button">Go to Dashboard</a>
                </center>
            </div>
            <div class="footer">
                <p>© ${new Date().getFullYear()} FarmXpert - Pakistan's Premier Farm Management Solution</p>
            </div>
        </div>
    </body>
    </html>
    `;

    return sendEmail(email, `Welcome to FarmXpert - ${farmName}`, html);
};

const sendAnimalOwnerWelcomeEmail = async (email, name, animalTag, farmName, setupToken) => {
    const setupUrl = `${process.env.APP_URL || 'http://localhost:5000'}/setup-password?token=${setupToken}`;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .info-box { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #10b981; }
            .button { display: inline-block; background: #10b981; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin:0;">🐄 Welcome to FarmXpert!</h1>
                <p style="margin:10px 0 0;">Your Animal Has Been Registered</p>
            </div>
            <div class="content">
                <h2>Hello, ${name}!</h2>
                <p>Great news! Your animal has been registered at <strong>${farmName}</strong>.</p>
                
                <div class="info-box">
                    <strong>🏷️ Animal Tag:</strong> ${animalTag}<br>
                    <strong>🏠 Farm:</strong> ${farmName}
                </div>
                
                <p>An account has been created for you so you can track your animal's progress, weight gain, health status, and costs online.</p>
                
                <p><strong>What you can view:</strong></p>
                <ul>
                    <li>📊 Weight progress and growth tracking</li>
                    <li>💉 Vaccination and health records</li>
                    <li>💰 Cost breakdown and charges</li>
                    <li>📷 Photos and updates</li>
                </ul>
                
                <center>
                    <a href="${setupUrl}" class="button">Set Your Password</a>
                </center>
                <p style="color: #64748b; font-size: 14px;">This link will expire in 7 days. After setting your password, you can log in anytime to view your animal's status.</p>
            </div>
            <div class="footer">
                <p>© ${new Date().getFullYear()} FarmXpert - Pakistan's Premier Farm Management Solution</p>
            </div>
        </div>
    </body>
    </html>
    `;

    return sendEmail(email, `Welcome to FarmXpert - Your Animal ${animalTag} Registered`, html);
};

const sendLowStockAlertEmail = async (ownerEmail, ownerName, farmName, lowStockItems) => {
    const itemsList = lowStockItems.map(item => `
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #fee2e2; font-weight: 500;">${item.name}</td>
            <td style="padding: 12px; border-bottom: 1px solid #fee2e2; color: #dc2626; font-weight: bold;">${item.quantityKg.toLocaleString()} kg</td>
            <td style="padding: 12px; border-bottom: 1px solid #fee2e2; color: #64748b;">${item.lowStockThreshold.toLocaleString()} kg</td>
        </tr>
    `).join('');

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #fef2f2; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #fee2e2; }
            .alert-icon { font-size: 48px; margin-bottom: 10px; }
            .table-container { background: white; border-radius: 8px; overflow: hidden; margin: 20px 0; border: 1px solid #fecaca; }
            .data-table { width: 100%; border-collapse: collapse; }
            .data-table th { background: #fef2f2; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #991b1b; border-bottom: 2px solid #fecaca; }
            .button { display: inline-block; background: #10b981; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
            .urgent-tag { display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="alert-icon">⚠️</div>
                <h1 style="margin:0;">Low Feed Stock Alert</h1>
                <p style="margin:10px 0 0; opacity: 0.9;">${farmName}</p>
            </div>
            <div class="content">
                <span class="urgent-tag">🚨 Urgent Action Required</span>
                <h2 style="margin-top: 0;">Dear ${ownerName},</h2>
                <p>The following feed items at your farm have fallen <strong>below the minimum stock threshold</strong> and require immediate procurement:</p>
                
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Feed Item</th>
                                <th>Current Stock</th>
                                <th>Min. Threshold</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsList}
                        </tbody>
                    </table>
                </div>
                
                <p style="background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
                    <strong>💡 Recommendation:</strong> Contact your feed supplier immediately to avoid any disruption in feeding schedules. Low stock can affect animal weight gain and overall herd performance.
                </p>
                
                <center>
                    <a href="${process.env.APP_URL || 'http://localhost:5000'}" class="button">View Feed Inventory</a>
                </center>
            </div>
            <div class="footer">
                <p>This is an automated alert from FarmXpert.</p>
                <p>© ${new Date().getFullYear()} FarmXpert - Pakistan's Premier Farm Management Solution</p>
            </div>
        </div>
    </body>
    </html>
    `;

    return sendEmail(ownerEmail, `⚠️ URGENT: Low Feed Stock Alert - ${farmName}`, html);
};

// rows: [{ tagNumber, ownerName, totalDue, monthsDue, status, receivedUrl, pendingUrl }]
const sendMonthlyBillingReportEmail = async (ownerEmail, ownerName, farmName, cycleLabel, rows, currency, attachments, reviewUrl) => {
    const totalDue = rows.reduce((sum, r) => sum + r.totalDue, 0);

    const rowsHtml = rows.map(r => `
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${r.tagNumber}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${r.ownerName}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${currency} ${r.totalDue.toLocaleString()}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                <span style="padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: bold; ${r.status === 'OVERDUE' ? 'background:#fee2e2;color:#991b1b;' : 'background:#fef3c7;color:#92400e;'}">${r.status}</span>
            </td>
        </tr>
    `).join('');

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 700px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e2e8f0; }
            .table-container { background: white; border-radius: 8px; overflow: hidden; margin: 20px 0; border: 1px solid #e2e8f0; overflow-x: auto; }
            .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
            .data-table th { background: #f1f5f9; padding: 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #e2e8f0; }
            .button { display: inline-block; background: #10b981; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin:0;">Monthly Billing Report</h1>
                <p style="margin:10px 0 0; opacity: 0.85;">${farmName} &middot; ${cycleLabel}</p>
            </div>
            <div class="content">
                <h2 style="margin-top: 0;">Dear ${ownerName},</h2>
                <p><strong>${rows.length}</strong> animal(s) have a payment due this cycle, totaling <strong>${currency} ${totalDue.toLocaleString()}</strong>.</p>
                <p style="color:#64748b; font-size: 13px;">A full PDF and CSV report is attached. Once you've checked which animal owners have paid (e.g. against your bank statement), use the button below to mark them received - no login needed, and you can tick off several at once.</p>

                <center>
                    <a href="${reviewUrl}" class="button">Review &amp; Update Payments</a>
                </center>

                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr><th>Tag</th><th>Owner</th><th>Amount Due</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="footer">
                <p>This is an automated monthly billing report from FarmXpert.</p>
                <p>© ${new Date().getFullYear()} FarmXpert - Pakistan's Premier Farm Management Solution</p>
            </div>
        </div>
    </body>
    </html>
    `;

    return sendEmail(ownerEmail, `Monthly Billing Report - ${farmName} (${cycleLabel})`, html, { attachments });
};

const sendPaymentStatusUpdateEmail = async (animalOwnerEmail, animalOwnerName, farmOwnerEmail, farmName, animalTag, action, amountDue, currency) => {
    const isReceived = action === 'received';
    const subject = isReceived
        ? `Payment Confirmed - ${animalTag}`
        : `Payment Reminder - ${animalTag}`;

    const bodyHtml = isReceived
        ? `<p>Good news! ${farmName} has confirmed that your payment for animal <strong>${animalTag}</strong> has been received. Thank you for your prompt payment.</p>`
        : `<p>This is a reminder from ${farmName} that your payment of <strong>${currency} ${amountDue.toLocaleString()}</strong> for animal <strong>${animalTag}</strong> is still pending. Please arrange payment at your earliest convenience.</p>`;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${isReceived ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'}; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e2e8f0; }
            .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin:0;">${isReceived ? 'Payment Confirmed' : 'Payment Reminder'}</h1>
                <p style="margin:10px 0 0; opacity: 0.9;">${farmName}</p>
            </div>
            <div class="content">
                <h2 style="margin-top: 0;">Dear ${animalOwnerName},</h2>
                ${bodyHtml}
                <p>Thank you.</p>
            </div>
            <div class="footer">
                <p>© ${new Date().getFullYear()} FarmXpert - Pakistan's Premier Farm Management Solution</p>
            </div>
        </div>
    </body>
    </html>
    `;

    return sendEmail(animalOwnerEmail, subject, html, { cc: farmOwnerEmail });
};

const sendAnimalReportEmail = async (email, name, reportData) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f1f5f9; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); margin-top: 20px; margin-bottom: 20px; }
            .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; padding: 30px 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; }
            .header p { margin: 5px 0 0; opacity: 0.8; font-size: 14px; }
            .content { padding: 32px 24px; }
            
            .greeting { font-size: 18px; font-weight: 600; color: #1e293b; margin-bottom: 16px; }
            .intro-text { color: #64748b; margin-bottom: 24px; font-size: 15px; }
            
            .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
            
            .hero-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
            .stat-box { background: #ffffff; border: 1px solid #e2e8f0; padding: 16px; border-radius: 10px; text-align: center; }
            .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: 600; margin-bottom: 4px; }
            .stat-value { font-size: 18px; font-weight: 700; color: #0f172a; }
            .highlight { color: #0f172a; }
            
            .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; color: #475569; margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px; }
            
            .info-table { width: 100%; border-collapse: collapse; font-size: 14px; }
            .info-table td { padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
            .info-table tr:last-child td { border-bottom: none; }
            .info-label { color: #64748b; width: 40%; }
            .info-val { font-weight: 500; color: #334155; text-align: right; }
            
            .status-badge { display: inline-block; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 700; }
            .status-good { background-color: #dcfce7; color: #166534; }
            .status-warn { background-color: #fef9c3; color: #854d0e; }
            .status-bad { background-color: #fee2e2; color: #991b1b; }
            
            .footer { background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px; }
            .footer p { margin: 4px 0; }
            
            @media (max-width: 480px) {
                .hero-grid { grid-template-columns: 1fr; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>FarmXpert Report</h1>
                <p>Animal Performance Update</p>
            </div>
            
            <div class="content">
                <div class="greeting">Hello, ${name} 👋</div>
                <p class="intro-text">Here is the latest status report for your animal <strong>${reportData.tagNumber}</strong>.</p>
                
                <div class="hero-grid">
                    <div class="stat-box">
                        <div class="stat-label">Current Weight</div>
                        <div class="stat-value" style="color: #0f172a;">${reportData.currentWeight} <span style="font-size:12px; color:#64748b;">kg</span></div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">Status</div>
                        <div class="stat-value">
                            <span class="status-badge ${['Active', 'Sold'].includes(reportData.status) ? 'status-good' : 'status-warn'}">
                                ${reportData.status}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="section-title">🐄 Animal Identity</div>
                    <table class="info-table">
                        <tr>
                            <td class="info-label">Tag Number</td>
                            <td class="info-val" style="font-family: monospace; font-size: 15px;">${reportData.tagNumber}</td>
                        </tr>
                        <tr>
                            <td class="info-label">Breed</td>
                            <td class="info-val">${reportData.breed}</td>
                        </tr>
                    </table>
                </div>
                
                <div class="card">
                    <div class="section-title">🩺 Health & Care</div>
                    <table class="info-table">
                        <tr>
                            <td class="info-label">Vaccination</td>
                            <td class="info-val">
                                ${reportData.vaccinationStatus
            ? '<span class="status-badge status-good">✅ Up to Date</span>'
            : '<span class="status-badge status-bad">❌ Pending</span>'}
                            </td>
                        </tr>
                        <tr>
                            <td class="info-label">Monthly Package</td>
                            <td class="info-val">${reportData.packageName || 'Standard'}</td>
                        </tr>
                    </table>
                </div>
                
                <div class="card">
                    <div class="section-title">💰 Financials</div>
                    <table class="info-table">
                        <tr>
                            <td class="info-label">Monthly Charges</td>
                            <td class="info-val" style="font-size: 16px;">Rs. ${reportData.monthlyCharges.toLocaleString()}</td>
                        </tr>
                         <tr>
                            <td class="info-label">Payment Status</td>
                            <td class="info-val"><span class="status-badge status-good">Current</span></td>
                        </tr>
                    </table>
                </div>
                
                <p style="text-align: center; color: #64748b; font-size: 13px; margin-top: 30px;">
                    Questions? Reply to this email or contact farm management.
                </p>
            </div>
            
            <div class="footer">
                <p>Generated by <strong>FarmXpert</strong></p>
                <p>${new Date().getFullYear()} © All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;

    return sendEmail(email, `📈 Animal Report: ${reportData.tagNumber}`, html);
};

// Dunning notices sent by server/jobs/dunningScheduler.js to a farm's own owner
// (SaaS platform -> farm), distinct from sendMonthlyBillingReportEmail which is the
// farm's own billing report to ITS animal-owner customers. One function covers all
// stages since they share layout and only differ in color/copy/CTA.
const DUNNING_COPY = {
    UPCOMING: {
        color: '#2563eb',
        subjectPrefix: 'Upcoming payment',
        heading: 'Your subscription payment is coming up',
        body: (amount, currency, dueDate) => `Your next FarmXpert subscription payment of <strong>${currency} ${amount}</strong> is due on <strong>${dueDate}</strong>.`
    },
    DUE_TODAY: {
        color: '#d97706',
        subjectPrefix: 'Payment due today',
        heading: 'Your subscription payment is due today',
        body: (amount, currency, dueDate) => `Your FarmXpert subscription payment of <strong>${currency} ${amount}</strong> is due today (${dueDate}). Please arrange payment to keep your account in good standing.`
    },
    OVERDUE: {
        color: '#dc2626',
        subjectPrefix: 'Payment overdue',
        heading: 'Your subscription payment is overdue',
        body: (amount, currency, dueDate) => `Your FarmXpert subscription payment of <strong>${currency} ${amount}</strong> was due on ${dueDate} and is now overdue. Please arrange payment as soon as possible to avoid service interruption.`
    },
    FINAL_NOTICE: {
        color: '#dc2626',
        subjectPrefix: 'Final notice - account will be suspended',
        heading: 'Final notice: your account will be suspended soon',
        body: (amount, currency, dueDate) => `Your FarmXpert subscription payment of <strong>${currency} ${amount}</strong> (due ${dueDate}) is significantly overdue. Your account will be suspended shortly if payment is not received.`
    },
    SUSPENDED: {
        color: '#dc2626',
        subjectPrefix: 'Account suspended - payment overdue',
        heading: 'Your FarmXpert account has been suspended',
        body: (amount, currency, dueDate) => `Your FarmXpert account has been suspended due to a payment of <strong>${currency} ${amount}</strong> (due ${dueDate}) remaining unpaid. Please contact us to arrange payment and restore access.`
    },
    REACTIVATED: {
        color: '#16a34a',
        subjectPrefix: 'Account reactivated',
        heading: 'Your FarmXpert account is active again',
        body: () => `We've received your payment and your account has been reactivated. Thank you!`
    }
};

const sendBillingNoticeEmail = async (ownerEmail, ownerName, farmName, stage, { amount, currency, dueDate } = {}) => {
    const copy = DUNNING_COPY[stage];
    if (!copy) throw new Error(`Unknown dunning stage: ${stage}`);

    const formattedAmount = amount != null ? Number(amount).toLocaleString() : '';
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${copy.color}; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin:0;">🐄 FarmXpert</h1>
                <p style="margin:10px 0 0;">${copy.heading}</p>
            </div>
            <div class="content">
                <h2>Hello, ${ownerName}!</h2>
                <p>${copy.body(formattedAmount, currency || 'PKR', dueDate || '')}</p>
                <p style="color: #64748b; font-size: 14px;">Farm: ${farmName}</p>
                <p>If you've already paid, please disregard this message - it may take a day to reflect.</p>
            </div>
            <div class="footer">
                <p>© ${new Date().getFullYear()} FarmXpert - Pakistan's Premier Farm Management Solution</p>
            </div>
        </div>
    </body>
    </html>
    `;

    return sendEmail(ownerEmail, `${copy.subjectPrefix} - FarmXpert`, html);
};

// Automated upgrade reminder sent by server/jobs/capacityScheduler.js when a farm
// is nearing its plan's animal or user limit - distinct from sendBillingNoticeEmail
// (which is about a payment being late), this is about outgrowing the plan itself.
const sendCapacityWarningEmail = async (ownerEmail, ownerName, farmName, { resource, count, limit, utilizationPct }) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #d97706; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin:0;">🐄 FarmXpert</h1>
                <p style="margin:10px 0 0;">You're approaching your plan limit</p>
            </div>
            <div class="content">
                <h2>Hello, ${ownerName}!</h2>
                <p>Your farm "<strong>${farmName}</strong>" is using <strong>${count} of ${limit}</strong> ${resource} on your current plan (${utilizationPct}%).</p>
                <p>Consider upgrading your plan or adding capacity to avoid interruption when you reach the limit.</p>
            </div>
            <div class="footer">
                <p>© ${new Date().getFullYear()} FarmXpert - Pakistan's Premier Farm Management Solution</p>
            </div>
        </div>
    </body>
    </html>
    `;

    return sendEmail(ownerEmail, `Approaching your ${resource} limit - FarmXpert`, html);
};

module.exports = {
    sendEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendWelcomeEmail,
    sendAnimalOwnerWelcomeEmail,
    sendAnimalReportEmail,
    sendLowStockAlertEmail,
    sendMonthlyBillingReportEmail,
    sendPaymentStatusUpdateEmail,
    sendBillingNoticeEmail,
    sendCapacityWarningEmail
};
