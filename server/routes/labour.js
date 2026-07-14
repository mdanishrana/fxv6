const express = require('express');
const router = express.Router();
const db = require('../db');

const requireTenant = (req, res, next) => {
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) return res.status(400).json({ error: 'Missing Tenant ID' });
    req.tenantId = tenantId;
    next();
};

router.use(requireTenant);

// --- WORKERS ---

router.get('/workers', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM workers WHERE tenant_id = $1 ORDER BY name',
            [req.tenantId]
        );
        res.json(result.rows.map(row => ({
            id: row.id,
            name: row.name,
            phone: row.phone,
            cnic: row.cnic,
            address: row.address,
            role: row.role,
            salaryType: row.salary_type,
            salaryAmount: parseFloat(row.salary_amount) || 0,
            joinDate: row.join_date,
            status: row.status,
            emergencyContact: row.emergency_contact,
            emergencyPhone: row.emergency_phone,
            notes: row.notes,
            createdAt: row.created_at
        })));
    } catch (err) {
        console.error('Error fetching workers:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/workers', async (req, res) => {
    const w = req.body;
    try {
        const result = await db.query(
            `INSERT INTO workers (tenant_id, name, phone, cnic, address, role, salary_type, salary_amount, join_date, status, emergency_contact, emergency_phone, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
            [req.tenantId, w.name, w.phone, w.cnic, w.address, w.role, w.salaryType || 'MONTHLY', w.salaryAmount || 0, w.joinDate, w.status || 'ACTIVE', w.emergencyContact, w.emergencyPhone, w.notes]
        );
        const row = result.rows[0];
        res.status(201).json({
            id: row.id,
            name: row.name,
            phone: row.phone,
            cnic: row.cnic,
            address: row.address,
            role: row.role,
            salaryType: row.salary_type,
            salaryAmount: parseFloat(row.salary_amount) || 0,
            joinDate: row.join_date,
            status: row.status,
            emergencyContact: row.emergency_contact,
            emergencyPhone: row.emergency_phone,
            notes: row.notes,
            createdAt: row.created_at
        });
    } catch (err) {
        console.error('Error creating worker:', err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/workers/:id', async (req, res) => {
    const w = req.body;
    try {
        const result = await db.query(
            `UPDATE workers SET 
                name = $1, phone = $2, cnic = $3, address = $4, role = $5, 
                salary_type = $6, salary_amount = $7, join_date = $8, status = $9,
                emergency_contact = $10, emergency_phone = $11, notes = $12, updated_at = NOW()
             WHERE id = $13 AND tenant_id = $14 RETURNING *`,
            [w.name, w.phone, w.cnic, w.address, w.role, w.salaryType, w.salaryAmount, w.joinDate, w.status, w.emergencyContact, w.emergencyPhone, w.notes, req.params.id, req.tenantId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Worker not found' });
        }
        const row = result.rows[0];
        res.json({
            id: row.id,
            name: row.name,
            phone: row.phone,
            cnic: row.cnic,
            address: row.address,
            role: row.role,
            salaryType: row.salary_type,
            salaryAmount: parseFloat(row.salary_amount) || 0,
            joinDate: row.join_date,
            status: row.status,
            emergencyContact: row.emergency_contact,
            emergencyPhone: row.emergency_phone,
            notes: row.notes,
            createdAt: row.created_at
        });
    } catch (err) {
        console.error('Error updating worker:', err);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/workers/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM attendance WHERE worker_id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
        await db.query('DELETE FROM wage_payments WHERE worker_id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
        await db.query('DELETE FROM workers WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting worker:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- ATTENDANCE ---

router.get('/attendance', async (req, res) => {
    const { date, workerId, startDate, endDate } = req.query;
    try {
        let query = `SELECT a.*, w.name as worker_name 
                     FROM attendance a 
                     LEFT JOIN workers w ON a.worker_id = w.id 
                     WHERE a.tenant_id = $1`;
        const params = [req.tenantId];
        
        if (date) {
            params.push(date);
            query += ` AND a.date = $${params.length}`;
        }
        if (workerId) {
            params.push(workerId);
            query += ` AND a.worker_id = $${params.length}`;
        }
        if (startDate && endDate) {
            params.push(startDate, endDate);
            query += ` AND a.date BETWEEN $${params.length - 1} AND $${params.length}`;
        }
        
        query += ' ORDER BY a.date DESC, w.name';
        
        const result = await db.query(query, params);
        res.json(result.rows.map(row => ({
            id: row.id,
            workerId: row.worker_id,
            workerName: row.worker_name,
            date: row.date,
            checkIn: row.check_in,
            checkOut: row.check_out,
            status: row.status,
            overtimeHours: parseFloat(row.overtime_hours) || 0,
            notes: row.notes
        })));
    } catch (err) {
        console.error('Error fetching attendance:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/attendance', async (req, res) => {
    const a = req.body;
    try {
        const result = await db.query(
            `INSERT INTO attendance (tenant_id, worker_id, date, check_in, check_out, status, overtime_hours, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
             ON CONFLICT (worker_id, date) DO UPDATE SET
                check_in = EXCLUDED.check_in,
                check_out = EXCLUDED.check_out,
                status = EXCLUDED.status,
                overtime_hours = EXCLUDED.overtime_hours,
                notes = EXCLUDED.notes
             RETURNING *`,
            [req.tenantId, a.workerId, a.date, a.checkIn || null, a.checkOut || null, a.status || 'PRESENT', a.overtimeHours || 0, a.notes]
        );
        const row = result.rows[0];
        res.status(201).json({
            id: row.id,
            workerId: row.worker_id,
            date: row.date,
            checkIn: row.check_in,
            checkOut: row.check_out,
            status: row.status,
            overtimeHours: parseFloat(row.overtime_hours) || 0,
            notes: row.notes
        });
    } catch (err) {
        console.error('Error creating attendance:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/attendance/bulk', async (req, res) => {
    const { date, records } = req.body;
    try {
        const results = [];
        for (const record of records) {
            const result = await db.query(
                `INSERT INTO attendance (tenant_id, worker_id, date, check_in, check_out, status, overtime_hours, notes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (worker_id, date) DO UPDATE SET
                    check_in = EXCLUDED.check_in,
                    check_out = EXCLUDED.check_out,
                    status = EXCLUDED.status,
                    overtime_hours = EXCLUDED.overtime_hours,
                    notes = EXCLUDED.notes
                 RETURNING *`,
                [req.tenantId, record.workerId, date, record.checkIn || null, record.checkOut || null, record.status || 'PRESENT', record.overtimeHours || 0, record.notes]
            );
            results.push(result.rows[0]);
        }
        res.json({ success: true, count: results.length });
    } catch (err) {
        console.error('Error saving bulk attendance:', err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/attendance/:id', async (req, res) => {
    const a = req.body;
    try {
        const result = await db.query(
            `UPDATE attendance SET 
                check_in = $1, check_out = $2, status = $3, overtime_hours = $4, notes = $5
             WHERE id = $6 AND tenant_id = $7 RETURNING *`,
            [a.checkIn || null, a.checkOut || null, a.status, a.overtimeHours || 0, a.notes, req.params.id, req.tenantId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Attendance record not found' });
        }
        const row = result.rows[0];
        res.json({
            id: row.id,
            workerId: row.worker_id,
            date: row.date,
            checkIn: row.check_in,
            checkOut: row.check_out,
            status: row.status,
            overtimeHours: parseFloat(row.overtime_hours) || 0,
            notes: row.notes
        });
    } catch (err) {
        console.error('Error updating attendance:', err);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/attendance/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM attendance WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting attendance:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- WAGE PAYMENTS ---

router.get('/wages', async (req, res) => {
    const { workerId } = req.query;
    try {
        let query = `SELECT wp.*, w.name as worker_name 
                     FROM wage_payments wp 
                     LEFT JOIN workers w ON wp.worker_id = w.id 
                     WHERE wp.tenant_id = $1`;
        const params = [req.tenantId];
        
        if (workerId) {
            params.push(workerId);
            query += ` AND wp.worker_id = $${params.length}`;
        }
        
        query += ' ORDER BY wp.created_at DESC';
        
        const result = await db.query(query, params);
        res.json(result.rows.map(row => ({
            id: row.id,
            workerId: row.worker_id,
            workerName: row.worker_name,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            daysWorked: row.days_worked,
            baseAmount: parseFloat(row.base_amount) || 0,
            overtimeAmount: parseFloat(row.overtime_amount) || 0,
            deductions: parseFloat(row.deductions) || 0,
            bonus: parseFloat(row.bonus) || 0,
            totalAmount: parseFloat(row.total_amount) || 0,
            paymentStatus: row.payment_status,
            paymentDate: row.payment_date,
            paymentMethod: row.payment_method,
            notes: row.notes,
            createdAt: row.created_at
        })));
    } catch (err) {
        console.error('Error fetching wage payments:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/wages', async (req, res) => {
    const wp = req.body;
    try {
        const result = await db.query(
            `INSERT INTO wage_payments (tenant_id, worker_id, period_start, period_end, days_worked, base_amount, overtime_amount, deductions, bonus, total_amount, payment_status, payment_date, payment_method, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
            [req.tenantId, wp.workerId, wp.periodStart, wp.periodEnd, wp.daysWorked || 0, wp.baseAmount || 0, wp.overtimeAmount || 0, wp.deductions || 0, wp.bonus || 0, wp.totalAmount, wp.paymentStatus || 'PENDING', wp.paymentDate || null, wp.paymentMethod, wp.notes]
        );
        const row = result.rows[0];
        res.status(201).json({
            id: row.id,
            workerId: row.worker_id,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            daysWorked: row.days_worked,
            baseAmount: parseFloat(row.base_amount) || 0,
            overtimeAmount: parseFloat(row.overtime_amount) || 0,
            deductions: parseFloat(row.deductions) || 0,
            bonus: parseFloat(row.bonus) || 0,
            totalAmount: parseFloat(row.total_amount) || 0,
            paymentStatus: row.payment_status,
            paymentDate: row.payment_date,
            paymentMethod: row.payment_method,
            notes: row.notes,
            createdAt: row.created_at
        });
    } catch (err) {
        console.error('Error creating wage payment:', err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/wages/:id', async (req, res) => {
    const wp = req.body;
    try {
        const result = await db.query(
            `UPDATE wage_payments SET 
                period_start = $1, period_end = $2, days_worked = $3, base_amount = $4,
                overtime_amount = $5, deductions = $6, bonus = $7, total_amount = $8,
                payment_status = $9, payment_date = $10, payment_method = $11, notes = $12
             WHERE id = $13 AND tenant_id = $14 RETURNING *`,
            [wp.periodStart, wp.periodEnd, wp.daysWorked, wp.baseAmount, wp.overtimeAmount, wp.deductions, wp.bonus, wp.totalAmount, wp.paymentStatus, wp.paymentDate || null, wp.paymentMethod, wp.notes, req.params.id, req.tenantId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Wage payment not found' });
        }
        const row = result.rows[0];
        res.json({
            id: row.id,
            workerId: row.worker_id,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            daysWorked: row.days_worked,
            baseAmount: parseFloat(row.base_amount) || 0,
            overtimeAmount: parseFloat(row.overtime_amount) || 0,
            deductions: parseFloat(row.deductions) || 0,
            bonus: parseFloat(row.bonus) || 0,
            totalAmount: parseFloat(row.total_amount) || 0,
            paymentStatus: row.payment_status,
            paymentDate: row.payment_date,
            paymentMethod: row.payment_method,
            notes: row.notes,
            createdAt: row.created_at
        });
    } catch (err) {
        console.error('Error updating wage payment:', err);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/wages/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM wage_payments WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting wage payment:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- CALCULATE WAGES FOR PERIOD ---

router.post('/wages/calculate', async (req, res) => {
    const { workerId, periodStart, periodEnd } = req.body;
    try {
        const workerResult = await db.query(
            'SELECT * FROM workers WHERE id = $1 AND tenant_id = $2',
            [workerId, req.tenantId]
        );
        if (workerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Worker not found' });
        }
        const worker = workerResult.rows[0];
        
        const attendanceResult = await db.query(
            `SELECT * FROM attendance 
             WHERE worker_id = $1 AND tenant_id = $2 AND date BETWEEN $3 AND $4`,
            [workerId, req.tenantId, periodStart, periodEnd]
        );
        
        let daysWorked = 0;
        let halfDays = 0;
        let totalOvertimeHours = 0;
        
        attendanceResult.rows.forEach(a => {
            if (a.status === 'PRESENT') daysWorked++;
            else if (a.status === 'HALF_DAY') halfDays++;
            totalOvertimeHours += parseFloat(a.overtime_hours) || 0;
        });
        
        const effectiveDays = daysWorked + (halfDays * 0.5);
        let baseAmount = 0;
        let overtimeAmount = 0;
        const salaryAmount = parseFloat(worker.salary_amount) || 0;
        
        if (worker.salary_type === 'DAILY') {
            baseAmount = effectiveDays * salaryAmount;
            overtimeAmount = totalOvertimeHours * (salaryAmount / 8);
        } else if (worker.salary_type === 'HOURLY') {
            const hoursWorked = effectiveDays * 8;
            baseAmount = hoursWorked * salaryAmount;
            overtimeAmount = totalOvertimeHours * salaryAmount * 1.5;
        } else {
            baseAmount = salaryAmount;
            overtimeAmount = totalOvertimeHours * (salaryAmount / 26 / 8);
        }
        
        res.json({
            workerId,
            workerName: worker.name,
            periodStart,
            periodEnd,
            daysWorked: Math.round(effectiveDays * 10) / 10,
            totalOvertimeHours,
            baseAmount: Math.round(baseAmount),
            overtimeAmount: Math.round(overtimeAmount),
            totalAmount: Math.round(baseAmount + overtimeAmount)
        });
    } catch (err) {
        console.error('Error calculating wages:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
