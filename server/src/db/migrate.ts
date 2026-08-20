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

-- Gestion des droits : roles nommes avec un niveau d'acces (aucun/lecture/lecture-ecriture) par
-- section, remplacant l'ancien role binaire admin/user. "Admin" et "Utilisateur" sont les deux
-- roles systeme seedes ci-dessous (proteges de la suppression/renommage), les autres sont crees
-- librement par un admin depuis Gestion des droits.
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_default_registration_role BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_roles_default_registration_role
  ON roles (is_default_registration_role) WHERE is_default_registration_role;

-- Absence de ligne pour une section = acces "aucun" (deny par defaut).
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  section VARCHAR(20) NOT NULL,
  access_level VARCHAR(10) NOT NULL CHECK (access_level IN ('read', 'write')),
  UNIQUE (role_id, section)
);

-- Keyed on the flag, not the name, since roles can be renamed from Gestion des droits (Rôle tab) —
-- matching by name would re-insert a duplicate system role on the next migrate run after a rename.
INSERT INTO roles (name, is_system, is_admin, is_default_registration_role)
SELECT 'Admin', true, true, false
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE is_admin = true);
INSERT INTO roles (name, is_system, is_admin, is_default_registration_role)
SELECT 'Utilisateur', true, false, true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE is_default_registration_role = true);

-- Mise a niveau des bases existantes : remplace l'ancienne colonne role (admin/user) par un
-- rattachement a un role de Gestion des droits.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id);
UPDATE users SET role_id = (SELECT id FROM roles WHERE is_admin = true)
  WHERE role_id IS NULL AND role = 'admin';
UPDATE users SET role_id = (SELECT id FROM roles WHERE is_default_registration_role = true)
  WHERE role_id IS NULL AND role = 'user';
ALTER TABLE users ALTER COLUMN role_id SET NOT NULL;
ALTER TABLE users DROP COLUMN IF EXISTS role;

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

-- Marque les modeles materiel pour lesquels l'import de configuration (Gestion des configurations)
-- est propose. Coche par defaut pour les modeles ayant deja un parseur code en dur cote serveur.
ALTER TABLE hardware_models ADD COLUMN IF NOT EXISTS config_import_enabled BOOLEAN NOT NULL DEFAULT false;
UPDATE hardware_models hm
SET config_import_enabled = true
FROM brands b
WHERE b.id = hm.brand_id
  AND ((b.name = 'HIRSCHMANN' AND hm.name = 'BRS30') OR (b.name = 'MOXA' AND hm.name = 'MGate 3480'))
  AND hm.config_import_enabled = false;

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

-- Renomme depuis modbus_link_types : le concept s'est avere plus general qu'un simple sous-type
-- de liaison ModBus (un "type de configuration" nomme, reutilisable sur n'importe quel port).
ALTER TABLE IF EXISTS modbus_link_types RENAME TO configuration_types;

-- Catalogue de "types de configuration" : profils nommes de configuration reutilisables sur les
-- ports (Gestion des ports), independants des link_types generiques (Fibre/TCP-IP/ModBus/...).
CREATE TABLE IF NOT EXISTS configuration_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  configuration TEXT NOT NULL DEFAULT ''
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

-- Type de configuration optionnel associe au port (Gestion des ports), independant du type de
-- liaison physique.
ALTER TABLE hardware_model_ports ADD COLUMN IF NOT EXISTS configuration_type_id INTEGER REFERENCES configuration_types(id);

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

-- Variable de supervision d'un modele materiel (nom, unite, registre a lire), independante des
-- ports/liaisons.
CREATE TABLE IF NOT EXISTS hardware_model_variables (
  id SERIAL PRIMARY KEY,
  hardware_model_id INTEGER NOT NULL REFERENCES hardware_models(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  unit VARCHAR(50) NOT NULL DEFAULT '',
  register VARCHAR(50) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_hardware_model_variables_hardware_model ON hardware_model_variables(hardware_model_id);

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
-- A "point à point" port (Fibre, TCP/IP...) may only ever appear in a single link; a non-"point à
-- point" port (ModBus bus wiring) must be allowed to fan out to any number of links in the same
-- role. That distinction depends on link_types.point_to_point, which a partial unique index can't
-- reference (its predicate can only see this table's own columns), so uniqueness is enforced in
-- the application layer instead (server/src/routes/equipmentLinks.ts, findPortInUse) — these are
-- now plain lookup indexes, not unique constraints.
DROP INDEX IF EXISTS ux_equipment_links_parent_port;
DROP INDEX IF EXISTS ux_equipment_links_child_port;
CREATE INDEX IF NOT EXISTS ix_equipment_links_parent_port ON equipment_links(parent_equipment_id, parent_port_id);
CREATE INDEX IF NOT EXISTS ix_equipment_links_child_port ON equipment_links(child_equipment_id, child_port_id);
CREATE INDEX IF NOT EXISTS ix_equipment_links_parent ON equipment_links(parent_equipment_id);
CREATE INDEX IF NOT EXISTS ix_equipment_links_child ON equipment_links(child_equipment_id);

-- Type de configuration optionnel associe a la liaison elle-meme (distinct de celui des ports).
ALTER TABLE equipment_links ADD COLUMN IF NOT EXISTS configuration_type_id INTEGER REFERENCES configuration_types(id);

-- Backfill : reprend le type de liaison du port parent (meme convention que le defaut applique aux
-- nouvelles liaisons dessinees dans Design, cf. DEFAULT_CONFIGURATION_TYPE_NAME_BY_PORT_TYPE cote
-- client) pour les liaisons existantes qui n'ont pas encore de type de configuration explicite.
UPDATE equipment_links l
SET configuration_type_id = ct.id
FROM hardware_model_ports p
JOIN link_types lt ON lt.id = p.link_type_id
JOIN configuration_types ct ON ct.name = CASE lt.name
  WHEN 'ModBus' THEN 'ModBus RTU-RS485-9600-8-N-1'
  WHEN 'TCP/IP' THEN 'TCP-IP'
END
WHERE l.parent_port_id = p.id
  AND l.configuration_type_id IS NULL
  AND lt.name IN ('ModBus', 'TCP/IP');

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

-- Reglages par instance de materiel pour chaque variable de son modele : mnemonique et
-- description propres a cet equipement, distincts de la variable catalogue elle-meme.
CREATE TABLE IF NOT EXISTS equipment_variable_settings (
  id SERIAL PRIMARY KEY,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  hardware_model_variable_id INTEGER NOT NULL REFERENCES hardware_model_variables(id) ON DELETE CASCADE,
  mnemonic VARCHAR(150) NOT NULL DEFAULT '',
  description VARCHAR(255) NOT NULL DEFAULT '',
  UNIQUE (equipment_id, hardware_model_variable_id)
);

-- Identifiant unique propre a cet equipement pour cette variable (meme format que le mnemonique).
ALTER TABLE equipment_variable_settings ADD COLUMN IF NOT EXISTS unique_id VARCHAR(150) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS apis (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  migration_date DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  doe_up_to_date BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS api_id INTEGER REFERENCES apis(id);
CREATE INDEX IF NOT EXISTS ix_equipment_api ON equipment(api_id);

-- Marque le materiel racine de l'arborescence Design pour son API (remplace l'ancien
-- rattachement en dur au nom "FO-R406A").
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS is_api_start_point BOOLEAN NOT NULL DEFAULT false;

-- Rattachement libre d'un materiel a un autre materiel de la meme API (hors liaison de port, ex.
-- un onduleur associe a son disjoncteur amont). L'unicite "meme API" et "pas de lien vers soi-meme"
-- est verifiee cote application (routes/equipment.ts) plutot qu'en base.
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS linked_equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_equipment_linked_equipment ON equipment(linked_equipment_id);

-- Schema de cablage (plan Design) enregistre pour une API : disposition des cartes
-- materiel sur le canevas et courbure des liaisons, un seul schema par API.
CREATE TABLE IF NOT EXISTS design_schemas (
  id SERIAL PRIMARY KEY,
  api_id INTEGER NOT NULL REFERENCES apis(id) ON DELETE CASCADE,
  layout JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_design_schemas_api ON design_schemas(api_id);

-- Memorise, par modele de catalogue, la correspondance choisie par l'admin entre un nom de port
-- tel que rapporte par une configuration importee (switch_ports.port_name) et un port existant du
-- modele (hardware_model_ports), quand ce nom ne correspondait a aucun port par simple egalite de
-- label. Une fois resolue pour un modele, la meme correspondance s'applique automatiquement a
-- toute future configuration important ce meme nom de port pour ce modele (pas de nouvelle
-- confirmation demandee a l'admin).
CREATE TABLE IF NOT EXISTS hardware_model_port_aliases (
  id SERIAL PRIMARY KEY,
  hardware_model_id INTEGER NOT NULL REFERENCES hardware_models(id) ON DELETE CASCADE,
  source_label VARCHAR(100) NOT NULL,
  hardware_model_port_id INTEGER NOT NULL REFERENCES hardware_model_ports(id) ON DELETE CASCADE,
  UNIQUE (hardware_model_id, source_label)
);

-- Gestion des configurations : import de fichiers de configuration MOXA (switchs BRS30 en XML,
-- passerelles MGate en binaire .cfg MGateManager). Chaque configuration importee est rattachee
-- au modele materiel du catalogue (Type des donnees > Materiel) via hardware_model_id, mais reste
-- independante de l'inventaire "equipment" (pas d'instance de materiel creee automatiquement).
CREATE TABLE IF NOT EXISTS switch_configurations (
  id SERIAL PRIMARY KEY,
  hardware_model_id INTEGER REFERENCES hardware_models(id),
  product_id VARCHAR(100) NOT NULL DEFAULT '',
  firmware_version VARCHAR(50) NOT NULL DEFAULT '',
  sys_name VARCHAR(200) NOT NULL DEFAULT '',
  sys_contact VARCHAR(200) NOT NULL DEFAULT '',
  sys_location VARCHAR(200) NOT NULL DEFAULT '',
  management_ip VARCHAR(45) NOT NULL DEFAULT '',
  prefix_length INTEGER NOT NULL DEFAULT 0,
  gateway_ip VARCHAR(45) NOT NULL DEFAULT '',
  management_vlan_id INTEGER NOT NULL DEFAULT 0,
  raw_xml TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by_id INTEGER NOT NULL REFERENCES users(id)
);

ALTER TABLE switch_configurations ADD COLUMN IF NOT EXISTS hardware_model_id INTEGER REFERENCES hardware_models(id);
UPDATE switch_configurations s
SET hardware_model_id = (
  SELECT hm.id FROM hardware_models hm
  JOIN brands b ON b.id = hm.brand_id
  WHERE b.name = 'HIRSCHMANN' AND hm.name = 'BRS30'
  LIMIT 1
)
WHERE s.hardware_model_id IS NULL;
ALTER TABLE switch_configurations ALTER COLUMN hardware_model_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS switch_vlans (
  id SERIAL PRIMARY KEY,
  switch_configuration_id INTEGER NOT NULL REFERENCES switch_configurations(id) ON DELETE CASCADE,
  vlan_index INTEGER NOT NULL,
  name VARCHAR(200) NOT NULL DEFAULT '',
  egress_ports TEXT NOT NULL DEFAULT '',
  forbidden_ports TEXT NOT NULL DEFAULT '',
  untagged_ports TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_switch_vlans_config ON switch_vlans(switch_configuration_id);

CREATE TABLE IF NOT EXISTS switch_ports (
  id SERIAL PRIMARY KEY,
  switch_configuration_id INTEGER NOT NULL REFERENCES switch_configurations(id) ON DELETE CASCADE,
  port_name VARCHAR(50) NOT NULL DEFAULT '',
  admin_status INTEGER NOT NULL DEFAULT 0,
  power_state INTEGER NOT NULL DEFAULT 0,
  auto_power_down INTEGER NOT NULL DEFAULT 0,
  cable_crossing INTEGER NOT NULL DEFAULT 0,
  mau_type_oid VARCHAR(100) NOT NULL DEFAULT '',
  speed_label VARCHAR(50) NOT NULL DEFAULT '',
  auto_neg_admin_status INTEGER NOT NULL DEFAULT 0,
  pvid INTEGER NOT NULL DEFAULT 0,
  acceptable_frame_types INTEGER NOT NULL DEFAULT 0,
  ingress_filtering INTEGER NOT NULL DEFAULT 0,
  stp_port_state INTEGER NOT NULL DEFAULT 0,
  lldp_admin_status INTEGER NOT NULL DEFAULT 0,
  mrp_role VARCHAR(100) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_switch_ports_config ON switch_ports(switch_configuration_id);

CREATE TABLE IF NOT EXISTS switch_mrp_configs (
  id SERIAL PRIMARY KEY,
  switch_configuration_id INTEGER NOT NULL REFERENCES switch_configurations(id) ON DELETE CASCADE,
  domain_name VARCHAR(200) NOT NULL DEFAULT '',
  ring_port1 VARCHAR(50) NOT NULL DEFAULT '',
  ring_port2 VARCHAR(50) NOT NULL DEFAULT '',
  role_admin_state INTEGER NOT NULL DEFAULT 0,
  recovery_delay INTEGER NOT NULL DEFAULT 0,
  vlan_id INTEGER NOT NULL DEFAULT 0,
  mrm_priority INTEGER NOT NULL DEFAULT 0,
  row_status INTEGER NOT NULL DEFAULT 0,
  ring_coupling_port VARCHAR(50) NOT NULL DEFAULT '',
  ring_coupling_row_status INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_switch_mrp_configs_config ON switch_mrp_configs(switch_configuration_id);

CREATE TABLE IF NOT EXISTS mgate_configurations (
  id SERIAL PRIMARY KEY,
  hardware_model_id INTEGER REFERENCES hardware_models(id),
  ip_address VARCHAR(45) NOT NULL DEFAULT '',
  subnet_mask VARCHAR(45) NOT NULL DEFAULT '',
  default_gateway VARCHAR(45) NOT NULL DEFAULT '',
  mac_address VARCHAR(17) NOT NULL DEFAULT '',
  dhcp_enabled BOOLEAN NOT NULL DEFAULT false,
  dns_server1 VARCHAR(45) NOT NULL DEFAULT '',
  dns_server2 VARCHAR(45) NOT NULL DEFAULT '',
  device_name VARCHAR(200) NOT NULL DEFAULT '',
  description VARCHAR(500) NOT NULL DEFAULT '',
  location VARCHAR(200) NOT NULL DEFAULT '',
  contact VARCHAR(200) NOT NULL DEFAULT '',
  modbus_tcp_port INTEGER NOT NULL DEFAULT 502,
  max_tcp_sessions INTEGER NOT NULL DEFAULT 16,
  snmp_enabled BOOLEAN NOT NULL DEFAULT false,
  snmp_version VARCHAR(20) NOT NULL DEFAULT '',
  read_community VARCHAR(100) NOT NULL DEFAULT '',
  write_community VARCHAR(100) NOT NULL DEFAULT '',
  trap_server VARCHAR(100) NOT NULL DEFAULT '',
  web_console_enabled BOOLEAN NOT NULL DEFAULT false,
  telnet_console_enabled BOOLEAN NOT NULL DEFAULT false,
  raw_cfg BYTEA,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by_id INTEGER NOT NULL REFERENCES users(id)
);

ALTER TABLE mgate_configurations ADD COLUMN IF NOT EXISTS hardware_model_id INTEGER REFERENCES hardware_models(id);
UPDATE mgate_configurations m
SET hardware_model_id = (
  SELECT hm.id FROM hardware_models hm
  JOIN brands b ON b.id = hm.brand_id
  WHERE b.name = 'MOXA' AND hm.name = 'MGate 3480'
  LIMIT 1
)
WHERE m.hardware_model_id IS NULL;
ALTER TABLE mgate_configurations ALTER COLUMN hardware_model_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS mgate_serial_ports (
  id SERIAL PRIMARY KEY,
  mgate_configuration_id INTEGER NOT NULL REFERENCES mgate_configurations(id) ON DELETE CASCADE,
  port_number INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  interface VARCHAR(20) NOT NULL DEFAULT '',
  baud_rate INTEGER NOT NULL DEFAULT 0,
  data_bits INTEGER NOT NULL DEFAULT 0,
  parity VARCHAR(20) NOT NULL DEFAULT '',
  stop_bits INTEGER NOT NULL DEFAULT 0,
  flow_control VARCHAR(20) NOT NULL DEFAULT '',
  protocol VARCHAR(50) NOT NULL DEFAULT '',
  operation_mode VARCHAR(50) NOT NULL DEFAULT '',
  response_timeout INTEGER NOT NULL DEFAULT 0,
  recovery_time INTEGER NOT NULL DEFAULT 0,
  delay_between_poll INTEGER NOT NULL DEFAULT 0,
  termination_enabled BOOLEAN NOT NULL DEFAULT false,
  pull_high_low VARCHAR(20) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_mgate_serial_ports_config ON mgate_serial_ports(mgate_configuration_id);

CREATE TABLE IF NOT EXISTS mgate_slave_ids (
  id SERIAL PRIMARY KEY,
  mgate_serial_port_id INTEGER NOT NULL REFERENCES mgate_serial_ports(id) ON DELETE CASCADE,
  slave_number_start INTEGER NOT NULL,
  slave_number_end INTEGER NOT NULL,
  modbus_id_start INTEGER NOT NULL,
  modbus_id_end INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_mgate_slave_ids_port ON mgate_slave_ids(mgate_serial_port_id);

-- Configurations de reporting enregistrees par un admin : colonnes affichees, tri et filtres par
-- colonne (au format "valeur affichee -> incluse"), pour retrouver d'un clic une vue du tableau
-- de reporting sans reconfigurer les cases a cocher et les filtres a chaque visite.
CREATE TABLE IF NOT EXISTS report_configs (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  column_ids JSONB NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  sort_column_id VARCHAR(100),
  sort_dir VARCHAR(4) NOT NULL DEFAULT 'asc',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE report_configs DROP COLUMN IF EXISTS filter_mode;

-- Remembers the "N'afficher que les ports / équipements ayant une liaison" checkbox alongside
-- the rest of a saved reporting view.
ALTER TABLE report_configs ADD COLUMN IF NOT EXISTS only_linked BOOLEAN NOT NULL DEFAULT false;
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
