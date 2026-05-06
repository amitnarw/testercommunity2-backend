import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:admin@localhost:5432/intester'
});

const result = await pool.query(`SELECT unnest(enum_range(NULL::"NotificationType"))::text AS enum_value`);
console.log('NotificationType enum values in DB:');
result.rows.forEach(r => console.log(' -', r.enum_value));
await pool.end();