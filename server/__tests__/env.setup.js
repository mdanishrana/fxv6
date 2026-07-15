// Runs before any test file's own imports (setupFiles execute in a phase separate from
// the hoisted imports of the test file itself, unlike setting process.env directly inside
// an ESM test file - those assignments run AFTER hoisted imports, too late to matter).
//
// Server-side tests must never hit real dev data or trigger real external side effects
// (email sends, Sentry reports) just by importing the app.
process.env.DB_NAME = process.env.TEST_DB_NAME || 'farmxpert_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-suite-secret-not-used-in-prod';
process.env.GMAIL_APP_PASSWORD = '';
delete process.env.SENTRY_DSN;
