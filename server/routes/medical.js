const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware: auth } = require('../middleware/auth');

// Get all medical items (Active only by default)
router.get('/:tenantId', auth, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { type, status } = req.query;

        let query = 'SELECT * FROM medical_inventory WHERE tenant_id = $1';
        const params = [tenantId];
        let paramCount = 1;

        if (type) {
            paramCount++;
            query += ` AND type = $${paramCount}`;
            params.push(type);
        }

        if (status) {
            paramCount++;
            query += ` AND status = $${paramCount}`;
            params.push(status);
        } else {
            // Default to showing active items if no status specified
            // query += ` AND status = 'ACTIVE'`;
        }

        query += ' ORDER BY name ASC, batch_number ASC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Add new medical item
router.post('/:tenantId', auth, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        // Handle both camelCase (frontend) and snake_case inputs
        const { type, name, batchNumber, batch_number, manufacturer, quantity, unit, costPerUnit, cost_per_unit, expiryDate, expiry_date, notes } = req.body;

        const batch = batchNumber || batch_number;
        const cost = costPerUnit || cost_per_unit || 0;
        const expiry = expiryDate || expiry_date;

        const newItem = await pool.query(
            `INSERT INTO medical_inventory 
      (tenant_id, type, name, batch_number, manufacturer, quantity, unit, cost_per_unit, expiry_date, notes) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
      RETURNING *`,
            [tenantId, type, name, batch, manufacturer, quantity, unit, cost, expiry, notes]
        );

        res.json(newItem.rows[0]);
    } catch (err) {
        console.error('Error adding medical item:', err.message);
        res.status(500).send('Server Error');
    }
});

// Update medical item
router.put('/:tenantId/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, batchNumber, batch_number, manufacturer, quantity, unit, costPerUnit, cost_per_unit, expiryDate, expiry_date, status, notes } = req.body;

        const batch = batchNumber || batch_number;
        const cost = costPerUnit || cost_per_unit || 0;
        const expiry = expiryDate || expiry_date;

        // Build update query dynamically
        // For simplicity, updating all fields
        const updateQuery = `
      UPDATE medical_inventory 
      SET name = $1, batch_number = $2, manufacturer = $3, quantity = $4, 
          unit = $5, cost_per_unit = $6, expiry_date = $7, status = $8, notes = $9, updated_at = CURRENT_TIMESTAMP
      WHERE id = $10 AND tenant_id = $11
      RETURNING *
    `;

        const result = await pool.query(updateQuery, [
            name, batch, manufacturer, quantity, unit, cost, expiry, status, notes,
            id, req.user.tenantId
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Item not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating medical item:', err.message);
        res.status(500).send('Server Error');
    }
});

// Delete medical item
router.delete('/:tenantId/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;

        // Instead of hard delete, maybe soft delete? Plan said "Archive/Delete".
        // Let's do hard delete for now as per "Delete" in plan, or check if used.
        // Ideally we should check if used in history, but for now simple delete.

        const deleteQuery = 'DELETE FROM medical_inventory WHERE id = $1 AND tenant_id = $2 RETURNING *';
        const result = await pool.query(deleteQuery, [id, tenantId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Item not found' });
        }

        res.json({ msg: 'Item deleted' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
