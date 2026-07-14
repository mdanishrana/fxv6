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
  const res = await client.query("SELECT u.id, u.role, u.email, t.id as tenant_id FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id WHERE LOWER(u.email) = 'mdaanish87@gmail.com'");
  console.log("Users for mdaanish87@gmail.com (case insensitive):");
  console.log(res.rows);
  await client.end();
}

checkDB().catch(console.error);
