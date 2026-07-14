const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'farmxpert_db',
  password: 'Nova2183417',
  port: 5432,
});

async function checkDB() {
  await client.connect();
  const res = await client.query("SELECT id, name, created_at FROM tenants WHERE status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1");
  console.log("Newest Tenant:");
  console.log(res.rows);
  await client.end();
}

checkDB().catch(console.error);
