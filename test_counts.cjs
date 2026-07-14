const db = require('./server/db');

async function checkCounts() {
    const tenantId = '7bca8694-9bb3-4e40-abdb-4cbaad99e009';
    
    console.log("1. Fetching Groups...");
    const groups = await db.query(`SELECT id, name FROM cattle_groups WHERE tenant_id = $1`, [tenantId]);
    console.log(groups.rows);

    console.log("\n2. Fetching Raw cattle group_ids...");
    const cattle = await db.query(`SELECT id, tag_number, group_id, status FROM cattle WHERE tenant_id = $1 AND group_id IS NOT NULL`, [tenantId]);
    console.log(cattle.rows);

    console.log("\n3. Running API Count Query...");
    const counts = await db.query(`
        SELECT group_id, COUNT(id)::int as cnt
        FROM cattle
        WHERE tenant_id = $1 AND group_id IS NOT NULL AND status = 'ACTIVE'
        GROUP BY group_id
    `, [tenantId]);
    console.log(counts.rows);
    
    process.exit(0);
}

checkCounts().catch(console.error);
