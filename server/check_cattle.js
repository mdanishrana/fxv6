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
  const res = await client.query("SELECT * FROM cattle WHERE tenant_id = 'db6206f8-35e9-47b4-a0eb-81f01621aa25'");
  console.log("Cattle for db62...");
  console.log(res.rows);
  await client.end();
}

checkDB().catch(console.error);
