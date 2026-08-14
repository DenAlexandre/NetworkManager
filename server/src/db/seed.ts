import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "./pool";

async function seedAdmin() {
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
}

const DEVICE_TYPES = ["Serveur", "Switch", "Firewall", "Automate", "Relais de dérivation optique"];

const BRANDS = ["DELL", "CISCO", "FORTINET", "HIRSCHMANN", "Schneider Electric"];

const HARDWARE_MODELS = [
  { brandName: "DELL", name: "Inconnu" },
  { brandName: "CISCO", name: "CISCO" },
  { brandName: "HIRSCHMANN", name: "MACH104-20TX-FR" },
  { brandName: "Schneider Electric", name: "M580" },
  { brandName: "HIRSCHMANN", name: "BRS30" },
  { brandName: "HIRSCHMANN", name: "OBR40" },
];

const LINK_TYPES = ["Fibre", "TCP/IP", "ModBus"];

const PORTS = [
  { id: 10, brandName: "DELL", hardwareModelName: "Inconnu", linkTypeName: "TCP/IP", label: "Port1" },
  { id: 20, brandName: "DELL", hardwareModelName: "Inconnu", linkTypeName: "TCP/IP", label: "IDRAC" },
  ...Array.from({ length: 48 }, (_, i) => ({
    id: 30 + i * 10,
    brandName: "CISCO",
    hardwareModelName: "CISCO",
    linkTypeName: "TCP/IP",
    label: `Port${i + 1}`,
  })),
];

async function resetSequence(table: string) {
  await pool.query(
    `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`,
    [table]
  );
}

async function seedReferenceData() {
  for (const name of DEVICE_TYPES) {
    await pool.query(`INSERT INTO device_types (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
  }

  for (const name of BRANDS) {
    await pool.query(`INSERT INTO brands (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
  }

  const brandRows = await pool.query("SELECT id, name FROM brands");
  const brandIdByName = new Map<string, number>(brandRows.rows.map((row) => [row.name, row.id]));

  for (const hm of HARDWARE_MODELS) {
    const brandId = brandIdByName.get(hm.brandName);
    await pool.query(
      `INSERT INTO hardware_models (brand_id, name) VALUES ($1, $2) ON CONFLICT (brand_id, name) DO NOTHING`,
      [brandId, hm.name]
    );
  }

  const hardwareModelRows = await pool.query("SELECT id, brand_id, name FROM hardware_models");
  const hardwareModelIdByKey = new Map<string, number>(
    hardwareModelRows.rows.map((row) => [`${row.brand_id}:${row.name}`, row.id])
  );

  for (const name of LINK_TYPES) {
    await pool.query(`INSERT INTO link_types (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
  }

  const linkTypeRows = await pool.query("SELECT id, name FROM link_types");
  const linkTypeIdByName = new Map<string, number>(linkTypeRows.rows.map((row) => [row.name, row.id]));

  for (const p of PORTS) {
    const linkTypeId = linkTypeIdByName.get(p.linkTypeName);
    const brandId = brandIdByName.get(p.brandName);
    const hardwareModelId = hardwareModelIdByKey.get(`${brandId}:${p.hardwareModelName}`);
    await pool.query(
      `INSERT INTO hardware_model_ports (id, hardware_model_id, link_type_id, label)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [p.id, hardwareModelId, linkTypeId, p.label]
    );
  }

  await resetSequence("device_types");
  await resetSequence("brands");
  await resetSequence("hardware_models");
  await resetSequence("link_types");
  await resetSequence("hardware_model_ports");

  console.log(
    `Type des données prêt : ${DEVICE_TYPES.length} types de matériel, ${BRANDS.length} constructeurs, ${HARDWARE_MODELS.length} matériels, ${LINK_TYPES.length} types de liaison, ${PORTS.length} ports.`
  );
}

async function seed() {
  await seedAdmin();
  await seedReferenceData();
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
