const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:Nova2183417@localhost:5432/farmxpert_db' });

async function fix() {
    const res = await pool.query(`SELECT id, vaccination_history FROM cattle WHERE tenant_id = 'db6206f8-35e9-47b4-a0eb-81f01621aa25'`);
    let updated = 0;
    
    for (const row of res.rows) {
        let history = row.vaccination_history || [];
        if (typeof history === 'string') history = JSON.parse(history);
        
        if (!Array.isArray(history) || history.length === 0) continue;
        
        // Find latest COMPLETED record per vaccine
        const latestCompleted = new Map();
        for (const v of history) {
            if (v.status === 'COMPLETED') {
                const existing = latestCompleted.get(v.vaccineName);
                if (!existing || new Date(v.date) > new Date(existing.date)) {
                    latestCompleted.set(v.vaccineName, v);
                }
            }
        }
        
        // Keep all records EXCEPT SCHEDULED records if a COMPLETED record exists for that vaccine
        const newHistory = history.filter(v => {
            if (v.status === 'SCHEDULED') {
                const comp = latestCompleted.get(v.vaccineName);
                if (comp) {
                    // if scheduled is before or same as completed, remove it!
                    if (new Date(v.date) <= new Date(comp.date)) return false;
                }
            }
            return true;
        });
        
        // Also remove exact duplicates (same date, same vaccine, same status)
        const unique = [];
        const seen = new Set();
        for (const v of newHistory) {
            const key = `${v.vaccineName}-${v.date}-${v.status}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(v);
            }
        }
        
        // Let's also remove duplicate SCHEDULED ones (the older ones)
        const scheduledMap = new Map();
        const filteredUnique = [];
        for (let i = unique.length - 1; i >= 0; i--) {
            const v = unique[i];
            if (v.status === 'SCHEDULED') {
                if (scheduledMap.has(v.vaccineName)) {
                    // we already have a newer scheduled one, so skip this older one
                    continue;
                }
                scheduledMap.set(v.vaccineName, true);
            }
            filteredUnique.unshift(v);
        }
        
        if (JSON.stringify(filteredUnique) !== JSON.stringify(history)) {
            await pool.query(`UPDATE cattle SET vaccination_history = $1 WHERE id = $2`, [JSON.stringify(filteredUnique), row.id]);
            updated++;
        }
    }
    console.log(`Updated ${updated} animals.`);
    process.exit(0);
}
fix().catch(console.error);
