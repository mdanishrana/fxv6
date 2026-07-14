const db = require('./db');
async function checkData() {
    const res = await db.query("SELECT id, tag_number, mother_tag FROM cattle WHERE mother_tag IS NOT NULL");
    console.log(res.rows);
    process.exit(0);
}
checkData();
