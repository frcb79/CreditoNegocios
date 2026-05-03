const { Pool } = require("pg");

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://local:local@localhost:5432/creditonegocios";

const pool = new Pool({ connectionString });

async function promoteToSuperAdmin() {
  try {
    // Try to update existing user
    const updateResult = await pool.query(
      `UPDATE users SET role='super_admin', updated_at=NOW() 
       WHERE email='francocb79@gmail.com'
       RETURNING id, email, role, is_active;`
    );

    if (updateResult.rows.length > 0) {
      console.log("✓ User role updated:");
      console.log(updateResult.rows[0]);
    } else {
      console.log("✗ User not found with email francocb79@gmail.com");
    }

    await pool.end();
  } catch (error) {
    console.error("Error:", error.message);
    await pool.end();
    process.exit(1);
  }
}

promoteToSuperAdmin();
