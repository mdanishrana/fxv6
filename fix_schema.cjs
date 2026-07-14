const fs = require('fs');

const file = 'scripts/full_schema_linux_deploy.sql';
let content = fs.readFileSync(file, 'utf8');

// The regex will find "CREATE TABLE " and replace it with "CREATE TABLE IF NOT EXISTS "
// It ignores already replaced items
content = content.replace(/CREATE TABLE (?!IF NOT EXISTS)/g, 'CREATE TABLE IF NOT EXISTS ');

// Add IF NOT EXISTS to sequences and indexes for safety
content = content.replace(/CREATE SEQUENCE (?!IF NOT EXISTS)/g, 'CREATE SEQUENCE IF NOT EXISTS ');
content = content.replace(/CREATE INDEX (?!IF NOT EXISTS)/g, 'CREATE INDEX IF NOT EXISTS ');
content = content.replace(/CREATE UNIQUE INDEX (?!IF NOT EXISTS)/g, 'CREATE UNIQUE INDEX IF NOT EXISTS ');

fs.writeFileSync('scripts/full_schema_linux_deploy_safe.sql', content);
console.log('✅ Created safe schema file: scripts/full_schema_linux_deploy_safe.sql');
