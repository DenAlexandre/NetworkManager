import "dotenv/config";
import { pool } from "./pool";

const SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(30) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mise a niveau des bases existantes creees avant l'ajout de ces colonnes.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

UPDATE users SET username = COALESCE(username, 'user' || id) WHERE username IS NULL;
UPDATE users SET first_name = COALESCE(first_name, 'Inconnu') WHERE first_name IS NULL;
UPDATE users SET last_name = COALESCE(last_name, 'Inconnu') WHERE last_name IS NULL;
UPDATE users SET phone = COALESCE(phone, '') WHERE phone IS NULL;

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN last_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username ON users(username);

CREATE TABLE IF NOT EXISTS device_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS brands (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS hardware_models (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  name VARCHAR(150) NOT NULL,
  UNIQUE (brand_id, name)
);

-- Suppression du module "Materiel reseau" (Equipements/Constructeurs) : plus reference par l'app.
DROP TABLE IF EXISTS network_equipment;
DROP TABLE IF EXISTS manufacturers;

CREATE TABLE IF NOT EXISTS link_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL
);

ALTER TABLE IF EXISTS manufacturer_ports RENAME TO hardware_model_ports;

CREATE TABLE IF NOT EXISTS hardware_model_ports (
  id SERIAL PRIMARY KEY,
  hardware_model_id INTEGER NOT NULL REFERENCES hardware_models(id) ON DELETE CASCADE,
  link_type_id INTEGER NOT NULL REFERENCES link_types(id),
  label VARCHAR(100) NOT NULL
);

-- Mise a niveau des bases existantes creees avant l'extraction de link_types.
ALTER TABLE hardware_model_ports ADD COLUMN IF NOT EXISTS port_type VARCHAR(50);
ALTER TABLE hardware_model_ports ADD COLUMN IF NOT EXISTS link_type_id INTEGER REFERENCES link_types(id);

INSERT INTO link_types (name)
SELECT DISTINCT port_type FROM hardware_model_ports WHERE port_type IS NOT NULL
ON CONFLICT (name) DO NOTHING;

UPDATE hardware_model_ports p
SET link_type_id = lt.id
FROM link_types lt
WHERE p.link_type_id IS NULL AND p.port_type = lt.name;

ALTER TABLE hardware_model_ports ALTER COLUMN link_type_id SET NOT NULL;
ALTER TABLE hardware_model_ports DROP COLUMN IF EXISTS port_type;

CREATE INDEX IF NOT EXISTS ix_hardware_model_ports_hardware_model ON hardware_model_ports(hardware_model_id);
`;

async function migrate() {
  await pool.query(SQL);
  console.log("Migration terminée.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
