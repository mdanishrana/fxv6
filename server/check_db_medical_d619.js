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
  const res = await client.query("SELECT * FROM medical_inventory WHERE tenant_id = 'd6192a16-f268-4faa-a7d6-63fbb5319c2e'");
  console.log("Found " + res.rows.length + " medical items for d619...:");
  console.log(res.rows);
  await client.end();
}

checkDB().catch(console.error);
