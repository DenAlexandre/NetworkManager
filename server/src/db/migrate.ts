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

-- Mise a niveau des bases existantes creees avant l'ajout du type de materiel.
ALTER TABLE hardware_models ADD COLUMN IF NOT EXISTS device_type_id INTEGER REFERENCES device_types(id);

UPDATE hardware_models
SET device_type_id = (SELECT id FROM device_types ORDER BY id LIMIT 1)
WHERE device_type_id IS NULL;

ALTER TABLE hardware_models ALTER COLUMN device_type_id SET NOT NULL;

ALTER TABLE hardware_models ADD COLUMN IF NOT EXISTS image_path VARCHAR(500);
ALTER TABLE hardware_models ADD COLUMN IF NOT EXISTS datasheet_path VARCHAR(500);

-- Suppression du module "Materiel reseau" (Equipements/Constructeurs) : plus reference par l'app.
DROP TABLE IF EXISTS network_equipment;
DROP TABLE IF EXISTS manufacturers;

CREATE TABLE IF NOT EXISTS link_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL
);

-- Couleur et epaisseur de trait utilisees pour dessiner ce type de liaison sur le plan.
ALTER TABLE link_types ADD COLUMN IF NOT EXISTS color VARCHAR(7);
ALTER TABLE link_types ADD COLUMN IF NOT EXISTS stroke_width REAL NOT NULL DEFAULT 3;

UPDATE link_types
SET color = (ARRAY['#e63946','#2a9d8f','#457b9d','#f4a261','#8338ec','#ffb703','#06923e','#d62839'])[(id % 8) + 1]
WHERE color IS NULL;

ALTER TABLE link_types ALTER COLUMN color SET DEFAULT '#8b5cf6';
ALTER TABLE link_types ALTER COLUMN color SET NOT NULL;

-- Indique si ce type de liaison ne peut relier que deux equipements (un seul lien par port).
ALTER TABLE link_types ADD COLUMN IF NOT EXISTS point_to_point BOOLEAN NOT NULL DEFAULT false;

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

-- Zone graphique du port sur l'image du materiel (en pixels, resolution naturelle de
-- l'image, origine en haut a gauche), pour le plan de cablage.
ALTER TABLE hardware_model_ports ADD COLUMN IF NOT EXISTS region_x REAL;
ALTER TABLE hardware_model_ports ADD COLUMN IF NOT EXISTS region_y REAL;
ALTER TABLE hardware_model_ports ADD COLUMN IF NOT EXISTS region_width REAL;
ALTER TABLE hardware_model_ports ADD COLUMN IF NOT EXISTS region_height REAL;

CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) UNIQUE NOT NULL
);

ALTER TABLE sites ADD COLUMN IF NOT EXISTS datasheet_path VARCHAR(500);

CREATE TABLE IF NOT EXISTS zones (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id),
  name VARCHAR(150) NOT NULL,
  UNIQUE (site_id, name)
);

CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  zone_id INTEGER NOT NULL REFERENCES zones(id),
  name VARCHAR(150) NOT NULL,
  UNIQUE (zone_id, name)
);
CREATE INDEX IF NOT EXISTS ix_rooms_zone ON rooms(zone_id);

CREATE TABLE IF NOT EXISTS equipment (
  id SERIAL PRIMARY KEY,
  device_type_id INTEGER NOT NULL REFERENCES device_types(id),
  hardware_model_id INTEGER NOT NULL REFERENCES hardware_models(id),
  name VARCHAR(200) NOT NULL
);

-- Mise a niveau des bases existantes creees avant l'introduction des salles : le materiel
-- etait directement rattache a une zone, il passe maintenant par une salle.
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS zone_id INTEGER REFERENCES zones(id);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES rooms(id);

INSERT INTO rooms (zone_id, name)
SELECT DISTINCT zone_id, 'Salle par défaut' FROM equipment WHERE zone_id IS NOT NULL AND room_id IS NULL
ON CONFLICT (zone_id, name) DO NOTHING;

UPDATE equipment e
SET room_id = r.id
FROM rooms r
WHERE e.room_id IS NULL AND e.zone_id IS NOT NULL AND e.zone_id = r.zone_id AND r.name = 'Salle par défaut';

ALTER TABLE equipment ALTER COLUMN room_id SET NOT NULL;
ALTER TABLE equipment DROP COLUMN IF EXISTS zone_id;

CREATE INDEX IF NOT EXISTS ix_equipment_room ON equipment(room_id);

CREATE TABLE IF NOT EXISTS equipment_links (
  id SERIAL PRIMARY KEY,
  parent_equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  parent_port_id INTEGER NOT NULL REFERENCES hardware_model_ports(id),
  child_equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  child_port_id INTEGER NOT NULL REFERENCES hardware_model_ports(id),
  CHECK (parent_equipment_id != child_equipment_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_equipment_links_parent_port ON equipment_links(parent_equipment_id, parent_port_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_equipment_links_child_port ON equipment_links(child_equipment_id, child_port_id);
CREATE INDEX IF NOT EXISTS ix_equipment_links_parent ON equipment_links(parent_equipment_id);
CREATE INDEX IF NOT EXISTS ix_equipment_links_child ON equipment_links(child_equipment_id);

-- Reglages d'adressage par instance de materiel pour chaque port de son modele : adresse
-- ModBus pour les ports ModBus, VLAN/IP/passerelle/masque pour les ports TCP/IP.
CREATE TABLE IF NOT EXISTS equipment_port_settings (
  id SERIAL PRIMARY KEY,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  hardware_model_port_id INTEGER NOT NULL REFERENCES hardware_model_ports(id) ON DELETE CASCADE,
  modbus_address VARCHAR(50),
  vlan VARCHAR(50),
  ip_address VARCHAR(45),
  gateway VARCHAR(45),
  subnet_mask VARCHAR(45),
  UNIQUE (equipment_id, hardware_model_port_id)
);

CREATE TABLE IF NOT EXISTS apis (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  migration_date DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  doe_up_to_date BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS api_id INTEGER REFERENCES apis(id);
CREATE INDEX IF NOT EXISTS ix_equipment_api ON equipment(api_id);

-- Schema de cablage (plan Design) enregistre pour une API : disposition des cartes
-- materiel sur le canevas et courbure des liaisons, un seul schema par API.
CREATE TABLE IF NOT EXISTS design_schemas (
  id SERIAL PRIMARY KEY,
  api_id INTEGER NOT NULL REFERENCES apis(id) ON DELETE CASCADE,
  layout JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_design_schemas_api ON design_schemas(api_id);
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
