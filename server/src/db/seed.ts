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

const MANUFACTURERS = [
  { id: 10, deviceTypeName: "Serveur", brandName: "DELL", hardwareModelName: "Inconnu", docPath: null, ioType: null },
  { id: 20, deviceTypeName: "Switch", brandName: "CISCO", hardwareModelName: "CISCO", docPath: null, ioType: null },
  { id: 30, deviceTypeName: "Firewall", brandName: "FORTINET", hardwareModelName: null, docPath: null, ioType: null },
  {
    id: 40,
    deviceTypeName: "Switch",
    brandName: "HIRSCHMANN",
    hardwareModelName: "MACH104-20TX-FR",
    docPath: null,
    ioType: null,
  },
  {
    id: 50,
    deviceTypeName: "Automate",
    brandName: "Schneider Electric",
    hardwareModelName: "M580",
    docPath: null,
    ioType: null,
  },
  {
    id: 60,
    deviceTypeName: "Switch",
    brandName: "HIRSCHMANN",
    hardwareModelName: "BRS30",
    docPath: null,
    ioType: null,
  },
  {
    id: 70,
    deviceTypeName: "Relais de dérivation optique",
    brandName: "HIRSCHMANN",
    hardwareModelName: "OBR40",
    docPath: "D:\\temp\\BNP\\Logiciel\\Doc\\IG_OBR40_01_0413_fr.pdf",
    ioType: null,
  },
];

const EQUIPMENT = [
  { id: 10, name: "SRV-MN-HIV-GTB", manufacturerId: 10 },
  { id: 20, name: "SRV-MN-HIS1-GTB", manufacturerId: 10 },
  { id: 30, name: "SRV-MN-ACQ5-GTB", manufacturerId: 10 },
  { id: 40, name: "Switch Cisco CIS", manufacturerId: 20 },
  { id: 50, name: "Firewall FORTINET", manufacturerId: 30 },
  { id: 60, name: "Switch interco HIRSCHMANN MACH104-20TX-FR", manufacturerId: 40 },
  { id: 70, name: "API-1109B-CFON", manufacturerId: 50 },
  { id: 80, name: "API-1109B-CVCN", manufacturerId: 50 },
  { id: 90, name: "OBR40-90", manufacturerId: 70 },
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

async function seedNetworkEquipment() {
  for (const name of DEVICE_TYPES) {
    await pool.query(`INSERT INTO device_types (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
  }

  const deviceTypeRows = await pool.query("SELECT id, name FROM device_types");
  const deviceTypeIdByName = new Map<string, number>(
    deviceTypeRows.rows.map((row) => [row.name, row.id])
  );

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

  for (const m of MANUFACTURERS) {
    const deviceTypeId = deviceTypeIdByName.get(m.deviceTypeName);
    const brandId = brandIdByName.get(m.brandName);
    const hardwareModelId = m.hardwareModelName
      ? hardwareModelIdByKey.get(`${brandId}:${m.hardwareModelName}`)
      : null;
    await pool.query(
      `INSERT INTO manufacturers (id, device_type_id, brand_id, hardware_model_id, doc_path, io_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [m.id, deviceTypeId, brandId, hardwareModelId, m.docPath, m.ioType]
    );
  }

  for (const e of EQUIPMENT) {
    await pool.query(
      `INSERT INTO network_equipment (id, name, manufacturer_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [e.id, e.name, e.manufacturerId]
    );
  }

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
  await resetSequence("manufacturers");
  await resetSequence("network_equipment");
  await resetSequence("link_types");
  await resetSequence("hardware_model_ports");

  console.log(
    `Matériel réseau prêt : ${DEVICE_TYPES.length} types de matériel, ${BRANDS.length} constructeurs, ${HARDWARE_MODELS.length} matériels catalogue, ${MANUFACTURERS.length} déclinaisons constructeur, ${EQUIPMENT.length} matériels, ${LINK_TYPES.length} types de liaison, ${PORTS.length} ports.`
  );
}

async function seed() {
  await seedAdmin();
  await seedNetworkEquipment();
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
