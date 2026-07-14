const { syncAnimalFeedCosts } = require('./server/utils/feedCostSync.js');
const db = require('./server/db.js');

(async () => {
    try {
        const tenantRes = await db.query('SELECT id FROM tenants LIMIT 1');
        const tenantId = tenantRes.rows[0].id;

        const cattleRes = await db.query('SELECT id, entry_date FROM cattle WHERE tenant_id = $1 LIMIT 1', [tenantId]);
        const animal = cattleRes.rows[0];
        console.log('Testing for animal', animal);

        await syncAnimalFeedCosts(tenantId, animal.id);

        const logs = await db.query('SELECT * FROM animal_feed_cost_logs WHERE animal_id = $1', [animal.id]);
        console.log('Resulting logs count:', logs.rows.length);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
