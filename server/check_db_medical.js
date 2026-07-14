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
  const res = await client.query("SELECT * FROM medical_inventory");
  console.log("Found " + res.rows.length + " medical items in the database:");
  console.log(res.rows);
  await client.end();
}

checkDB().catch(console.error);
