const { syncTenantFeedCosts } = require('./server/utils/feedCostSync.js');
const db = require('./server/db.js');

(async () => {
    try {
        const tenantId = 'db6206f8-35e9-47b4-a0eb-81f01621aa25';

        console.log('Testing sync on tenant:', tenantId);

        await syncTenantFeedCosts(tenantId);

        console.log('Done syncTenantFeedCosts');
        process.exit(0);
    } catch (err) {
        console.error('Fatal err:', err);
        process.exit(1);
    }
})();
