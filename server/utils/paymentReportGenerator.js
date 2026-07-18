const PDFDocument = require('pdfkit');

// rows: [{ tagNumber, ownerName, ownerMobile, totalDue, monthsDue, status, oldestDueDate }]

function generatePaymentReportCSV(rows, currency) {
    const escape = (val) => {
        const s = String(val ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Tag Number', 'Owner Name', 'Owner Mobile', `Total Due (${currency})`, 'Months Due', 'Status', 'Oldest Due Date'];
    const lines = [header.map(escape).join(',')];
    for (const r of rows) {
        lines.push([
            r.tagNumber, r.ownerName, r.ownerMobile, r.totalDue, r.monthsDue, r.status,
            r.oldestDueDate ? new Date(r.oldestDueDate).toISOString().split('T')[0] : ''
        ].map(escape).join(','));
    }
    return lines.join('\n');
}

function generatePaymentReportPDF(rows, tenant, cycleLabel) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const currency = tenant.currency || 'PKR';

        doc.fontSize(18).font('Helvetica-Bold').text(tenant.name || 'FarmXpert', { align: 'left' });
        doc.fontSize(12).font('Helvetica').fillColor('#555').text('Monthly Billing Status Report', { align: 'left' });
        doc.text(`Billing cycle: ${cycleLabel}`, { align: 'left' });
        doc.moveDown(1);
        doc.fillColor('#000');

        const totalDue = rows.reduce((sum, r) => sum + r.totalDue, 0);
        doc.fontSize(11).font('Helvetica-Bold').text(`${rows.length} animal(s) with payment due  -  Total outstanding: ${currency} ${totalDue.toLocaleString()}`);
        doc.moveDown(0.5);

        const colX = { tag: 40, owner: 120, due: 300, months: 380, status: 440 };
        const rowHeight = 20;

        const drawHeader = () => {
            doc.fontSize(9).font('Helvetica-Bold');
            doc.text('Tag', colX.tag, doc.y, { continued: false, width: 70 });
            doc.text('Owner', colX.owner, doc.y - 11, { width: 170 });
            doc.text(`Due (${currency})`, colX.due, doc.y - 11, { width: 70 });
            doc.text('Months', colX.months, doc.y - 11, { width: 50 });
            doc.text('Status', colX.status, doc.y - 11, { width: 100 });
            doc.moveDown(0.5);
            doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#ccc').stroke();
            doc.moveDown(0.3);
        };

        drawHeader();
        doc.font('Helvetica').fontSize(9);

        for (const r of rows) {
            if (doc.y > 760) {
                doc.addPage();
                drawHeader();
                doc.font('Helvetica').fontSize(9);
            }
            const y = doc.y;
            doc.text(r.tagNumber || '-', colX.tag, y, { width: 70 });
            doc.text(r.ownerName || '-', colX.owner, y, { width: 170 });
            doc.text(r.totalDue.toLocaleString(), colX.due, y, { width: 70 });
            doc.text(String(r.monthsDue), colX.months, y, { width: 50 });
            doc.text(r.status, colX.status, y, { width: 100 });
            doc.moveDown(0.9);
        }

        doc.end();
    });
}

module.exports = { generatePaymentReportCSV, generatePaymentReportPDF };
