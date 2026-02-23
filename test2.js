const { pool } = require('./db.js');
async function test() {
    const statsQuery = `
      SELECT 
          l.id as listing_id,
          l.base_cost,
          COALESCE(SUM(b.quantity * l.price_per_unit), 0) as total_revenue
      FROM listings l
      LEFT JOIN bookings b ON l.id = b.listing_id 
      WHERE l.provider_id = 6
      GROUP BY l.id, l.base_cost
  `;
    const res = await pool.query(statsQuery);
    const fs = require('fs');
    fs.writeFileSync('test2.json', JSON.stringify(res.rows, null, 2));
    process.exit();
}
test();
