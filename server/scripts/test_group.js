const db = require('../db');
async function main() {
    // Get first group and first cattle for this tenant
    const grp = await db.query("SELECT id, name FROM cattle_groups WHERE tenant_id='7bca8694-9bb3-4e40-abdb-4cbaad99e009' LIMIT 1");
    if (!grp.rows.length) { console.log('No groups found'); process.exit(1); }
    const groupId = grp.rows[0].id;
    console.log('Testing with group:', grp.rows[0].name, groupId);

    const cattle = await db.query("SELECT id, tag_number FROM cattle WHERE tenant_id='7bca8694-9bb3-4e40-abdb-4cbaad99e009' LIMIT 1");
    if (!cattle.rows.length) { console.log('No cattle found'); process.exit(1); }
    const cattleId = cattle.rows[0].id;
    console.log('Testing with cattle:', cattle.rows[0].tag_number, cattleId);

    // Direct UPDATE
    const res = await db.query("UPDATE cattle SET group_id=$1 WHERE id=$2 RETURNING id, tag_number, group_id", [groupId, cattleId]);
    console.log('UPDATE result:', res.rows[0]);

    process.exit(0);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
