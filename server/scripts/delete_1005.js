const db = require('../db');
async function run() {
    try {
        const res = await db.query("SELECT id FROM cattle WHERE tag_number='1005'");
        if (res.rows.length === 0) {
            console.log('Cattle 1005 not found');
            return;
        }
        const cId = res.rows[0].id;
        const delRes = await db.query('DELETE FROM payments WHERE cattle_id=$1', [cId]);
        console.log('Deleted ' + delRes.rowCount + ' payments for 1005');
    } catch(e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
