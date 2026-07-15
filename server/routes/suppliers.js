const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use((req, res, next) => {
    req.tenantId = req.user.tenantId;
    next();
});

// --- SUPPLIERS ---

router.get('/', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM suppliers WHERE tenant_id = $1 ORDER BY name',
            [req.tenantId]
        );
        res.json(result.rows.map(row => ({
            id: row.id,
            name: row.name,
            company: row.company,
            phone: row.phone,
            email: row.email,
            address: row.address,
            category: row.category,
            notes: row.notes,
            status: row.status,
            createdAt: row.created_at
        })));
    } catch (err) {
        console.error('Error fetching suppliers:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    const s = req.body;
    try {
        const result = await db.query(
            `INSERT INTO suppliers (tenant_id, name, company, phone, email, address, category, notes, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [req.tenantId, s.name, s.company, s.phone, s.email, s.address, s.category, s.notes, s.status || 'ACTIVE']
        );
        const row = result.rows[0];
        res.status(201).json({
            id: row.id,
            name: row.name,
            company: row.company,
            phone: row.phone,
            email: row.email,
            address: row.address,
            category: row.category,
            notes: row.notes,
            status: row.status,
            createdAt: row.created_at
        });
    } catch (err) {
        console.error('Error creating supplier:', err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', async (req, res) => {
    const s = req.body;
    try {
        const result = await db.query(
            `UPDATE suppliers SET 
                name = $1, company = $2, phone = $3, email = $4, address = $5, 
                category = $6, notes = $7, status = $8, updated_at = NOW()
             WHERE id = $9 AND tenant_id = $10 RETURNING *`,
            [s.name, s.company, s.phone, s.email, s.address, s.category, s.notes, s.status, req.params.id, req.tenantId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Supplier not found' });
        }
        const row = result.rows[0];
        res.json({
            id: row.id,
            name: row.name,
            company: row.company,
            phone: row.phone,
            email: row.email,
            address: row.address,
            category: row.category,
            notes: row.notes,
            status: row.status,
            createdAt: row.created_at
        });
    } catch (err) {
        console.error('Error updating supplier:', err);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM supplier_purchases WHERE supplier_id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
        await db.query('DELETE FROM suppliers WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting supplier:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- PURCHASES ---

router.get('/purchases', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT sp.*, s.name as supplier_name 
             FROM supplier_purchases sp 
             LEFT JOIN suppliers s ON sp.supplier_id = s.id 
             WHERE sp.tenant_id = $1 
             ORDER BY sp.purchase_date DESC`,
            [req.tenantId]
        );
        res.json(result.rows.map(row => ({
            id: row.id,
            supplierId: row.supplier_id,
            supplierName: row.supplier_name,
            purchaseDate: row.purchase_date,
            invoiceNumber: row.invoice_number,
            items: row.items || [],
            subtotal: parseFloat(row.subtotal) || 0,
            taxAmount: parseFloat(row.tax_amount) || 0,
            totalAmount: parseFloat(row.total_amount) || 0,
            paymentStatus: row.payment_status,
            paidAmount: parseFloat(row.paid_amount) || 0,
            paymentDate: row.payment_date,
            paymentMethod: row.payment_method,
            notes: row.notes,
            createdAt: row.created_at
        })));
    } catch (err) {
        console.error('Error fetching purchases:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/purchases', async (req, res) => {
    const p = req.body;
    try {
        const result = await db.query(
            `INSERT INTO supplier_purchases 
             (tenant_id, supplier_id, purchase_date, invoice_number, items, subtotal, tax_amount, total_amount, payment_status, paid_amount, payment_date, payment_method, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
            [
                req.tenantId, p.supplierId, p.purchaseDate, p.invoiceNumber, 
                JSON.stringify(p.items || []), p.subtotal || 0, p.taxAmount || 0, p.totalAmount,
                p.paymentStatus || 'PENDING', p.paidAmount || 0, p.paymentDate || null, p.paymentMethod, p.notes
            ]
        );
        const row = result.rows[0];
        res.status(201).json({
            id: row.id,
            supplierId: row.supplier_id,
            purchaseDate: row.purchase_date,
            invoiceNumber: row.invoice_number,
            items: row.items || [],
            subtotal: parseFloat(row.subtotal) || 0,
            taxAmount: parseFloat(row.tax_amount) || 0,
            totalAmount: parseFloat(row.total_amount) || 0,
            paymentStatus: row.payment_status,
            paidAmount: parseFloat(row.paid_amount) || 0,
            paymentDate: row.payment_date,
            paymentMethod: row.payment_method,
            notes: row.notes,
            createdAt: row.created_at
        });
    } catch (err) {
        console.error('Error creating purchase:', err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/purchases/:id', async (req, res) => {
    const p = req.body;
    try {
        const result = await db.query(
            `UPDATE supplier_purchases SET 
                supplier_id = $1, purchase_date = $2, invoice_number = $3, items = $4,
                subtotal = $5, tax_amount = $6, total_amount = $7, payment_status = $8,
                paid_amount = $9, payment_date = $10, payment_method = $11, notes = $12, updated_at = NOW()
             WHERE id = $13 AND tenant_id = $14 RETURNING *`,
            [
                p.supplierId, p.purchaseDate, p.invoiceNumber, JSON.stringify(p.items || []),
                p.subtotal || 0, p.taxAmount || 0, p.totalAmount, p.paymentStatus,
                p.paidAmount || 0, p.paymentDate || null, p.paymentMethod, p.notes,
                req.params.id, req.tenantId
            ]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Purchase not found' });
        }
        const row = result.rows[0];
        res.json({
            id: row.id,
            supplierId: row.supplier_id,
            purchaseDate: row.purchase_date,
            invoiceNumber: row.invoice_number,
            items: row.items || [],
            subtotal: parseFloat(row.subtotal) || 0,
            taxAmount: parseFloat(row.tax_amount) || 0,
            totalAmount: parseFloat(row.total_amount) || 0,
            paymentStatus: row.payment_status,
            paidAmount: parseFloat(row.paid_amount) || 0,
            paymentDate: row.payment_date,
            paymentMethod: row.payment_method,
            notes: row.notes,
            createdAt: row.created_at
        });
    } catch (err) {
        console.error('Error updating purchase:', err);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/purchases/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM supplier_purchases WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting purchase:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
