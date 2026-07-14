const db = require('./server/db.js');

(async () => {
    try {
        const cattleRes = await db.query('SELECT DISTINCT tenant_id FROM cattle WHERE monthly_package_id IS NOT NULL');
        console.log(`Cattle with packages are in these tenants:`);
        for (const r of cattleRes.rows) {
            console.log(r.tenant_id);
            const userRes = await db.query('SELECT email FROM users WHERE tenant_id = $1', [r.tenant_id]);
            for (const u of userRes.rows) {
                console.log(`  User: ${u.email}`);
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
