import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "./pool";

async function seed() {
  const username = process.env.SEED_ADMIN_USERNAME || "admin";
  const firstName = process.env.SEED_ADMIN_FIRST_NAME || "Admin";
  const lastName = process.env.SEED_ADMIN_LAST_NAME || "Admin";
  const email = process.env.SEED_ADMIN_EMAIL;
  const phone = process.env.SEED_ADMIN_PHONE || "";
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "SEED_ADMIN_EMAIL et SEED_ADMIN_PASSWORD doivent être définis dans .env"
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users (username, first_name, last_name, email, phone, password_hash, role)
     VALUES ($1, $2, $3, $4, $5, $6, 'admin')
     ON CONFLICT (email) DO UPDATE SET
       username = EXCLUDED.username,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       phone = EXCLUDED.phone,
       password_hash = EXCLUDED.password_hash,
       role = 'admin'`,
    [username, firstName, lastName, email, phone, passwordHash]
  );

  console.log(`Compte admin prêt : ${username} (${email})`);
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
