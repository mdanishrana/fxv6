
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set in .env. Refusing to start.');
  process.exit(1);
}

const app = express();
const port = process.env.PORT || 5000;

// Security headers. CSP is disabled for now since the built frontend isn't
// set up with nonces/hashes for its inline scripts/styles yet.
app.use(helmet({ contentSecurityPolicy: false }));

// Middleware
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin/non-browser requests (no Origin header) and anything on the allowlist
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} is not allowed`));
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Cache control for development
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// Request Logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes
const cattleRoutes = require('./routes/cattle');
const feedRoutes = require('./routes/feed');
const tenantRoutes = require('./routes/tenants');
const financeRoutes = require('./routes/finance');
const aiRoutes = require('./routes/ai');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const plansRoutes = require('./routes/plans');
const paymentsRoutes = require('./routes/payments');
const subscriptionsRoutes = require('./routes/subscriptions');
const suppliersRoutes = require('./routes/suppliers');
const labourRoutes = require('./routes/labour');
const contentRoutes = require('./routes/content');
const notificationsRoutes = require('./routes/notifications');

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/cattle', cattleRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/labour', labourRoutes);
app.use('/api/breeding', require('./routes/breeding'));
app.use('/api/genetics', require('./routes/genetics'));
app.use('/api/content', contentRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/medical', require('./routes/medical'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/finance', financeRoutes);
app.use('/api/logs', require('./routes/logs'));
app.use('/api/groups', require('./routes/groups'));

app.get('/health', (req, res) => {
  res.send('BovineMax API is running');
});

// API 404 Handler - Catch API requests that didn't match a route
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API Route not found' });
});

// Serve Static Frontend
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// Handle React Routing (send all non-API requests to index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Generic error handler - never leak stack traces/file paths to clients
app.use((err, req, res, next) => {
  if (err && err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
