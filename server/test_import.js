const db = require('./db');
const tenantId = '1e37bc16-b18c-4235-9d36-e8220f862078'; // using any tenant ID or finding one
async function test() {
    const tRes = await db.query('SELECT id FROM tenants LIMIT 1');
    const tId = tRes.rows[0].id;

    const c = {
        tagNumber: 'A1001', name: 'Bessie', type: 'Cow', breed: 'Sahiwal', gender: 'Female', ageMonths: 24, teeth: 2, color: 'Red',
        vaccinationStatus: false, vaccinationHistory: [], status: 'Active',
        isPregnant: true, expectedCalvingDate: '2026-10-15',
        arrivalType: 'Mandi Purchase', entryDate: '2026-01-01', entryWeight: 350, currentWeight: 350,
        purchasePrice: 250000, targetWeight: 450, dailyTargetGain: 1.0, weightHistory: [{ date: '2026-01-01', weight: 350 }], transactions: [],
        ownerName: 'John Doe', ownerEmail: 'john@example.com', ownerMobile: '1234567890', monthlyPackageId: '', notes: 'Imported via CSV template'
    };

    try {
        const result = await db.query(
            `INSERT INTO cattle (
            tenant_id, tag_number, name, type, breed, gender, teeth, color, 
            status, arrival_type, entry_date, entry_weight, current_weight, 
            target_weight, daily_target_gain, purchase_price, owner_name, 
            owner_mobile, owner_email, owner_address, monthly_package_id, monthly_charges, notes, image_url,
            weight_history, vaccination_history, transactions, photos, video_links, documents, health_status, expected_calving_date, current_daily_milk_yield, age_months
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34)
        RETURNING *`,
            [
                tId, c.tagNumber, c.name || null, c.type, c.breed, c.gender, c.teeth, c.color,
                c.status, c.arrivalType, c.entryDate, c.entryWeight, c.currentWeight,
                c.targetWeight, c.dailyTargetGain, c.purchasePrice, c.ownerName,
                c.ownerMobile, c.ownerEmail, c.ownerAddress || null, c.monthlyPackageId || null, c.monthlyCharges || 0, c.notes || null, c.imageUrl || null,
                JSON.stringify(c.weightHistory || []), JSON.stringify(c.vaccinationHistory || []), JSON.stringify(c.transactions || []),
                JSON.stringify(c.photos || []), JSON.stringify(c.videos || []), JSON.stringify(c.documents || []),
                c.healthStatus || 'Healthy', c.expectedCalvingDate || null, c.currentDailyMilkYield || 0, c.ageMonths || null
            ]
        );
        console.log("SUCCESS!", result.rows[0].id);
    } catch (e) {
        console.error("DB ERROR: ", e);
    } finally {
        process.exit();
    }
}
test();
