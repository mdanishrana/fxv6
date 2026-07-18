
const app = require('./app');
const { startFeedProcessingSchedule } = require('./jobs/scheduler');
const { startBillingSchedule } = require('./jobs/billingScheduler');
const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  startFeedProcessingSchedule();
  startBillingSchedule();
});
