# Déploiement gratuit sans Docker (Cloudflare Pages + Render + Supabase)

Alternative au `docker-compose.yml` (toujours utilisable en interne/local) : héberger l'app
gratuitement, sans carte bancaire, sur trois services séparés. Front et back sont sur des domaines
différents (cross-origin) et les fichiers uploadés (photos/fiches techniques) sont stockés dans un
bucket Supabase Storage plutôt que sur disque, puisque Render (plan gratuit) n'a pas de disque
persistant.

## 1. Supabase (base de données + stockage des fichiers)

1. Créer un compte et un projet sur https://supabase.com (aucune carte bancaire requise).
2. Récupérer la chaîne de connexion Postgres (Project Settings > Database > Connection string,
   mode "Transaction" ou "Session") — ce sera `DATABASE_URL` côté backend.
3. Storage > créer un bucket nommé `uploads`, **public** (lecture anonyme autorisée) — c'est là que
   vont les photos de matériel et fiches techniques. Aucune sous-arborescence à créer à l'avance :
   `hardware-models/`, `hardware-model-datasheets/`, `site-datasheets/` sont créés automatiquement
   au premier upload de chaque type.
4. Project Settings > API : noter l'URL du projet (`SUPABASE_URL`) et la clé
   **service_role** (`SUPABASE_SERVICE_ROLE_KEY` — jamais exposée au client, uniquement au backend).
5. Depuis un poste avec Node installé, initialiser le schéma et le compte admin une seule fois en
   pointant vers cette base :
   ```bash
   cd server
   DATABASE_URL="<connection string Supabase>" DATABASE_SSL=true npm run migrate
   DATABASE_URL="<connection string Supabase>" DATABASE_SSL=true SEED_ADMIN_USERNAME=Admin SEED_ADMIN_PASSWORD=... npm run seed
   ```
   (adapter les `SEED_ADMIN_*` comme dans `server/.env.example`).

## 2. Render (backend)

1. Créer un compte sur https://render.com (pas de carte bancaire pour le plan free) et connecter le
   repo Git du projet.
2. "New > Blueprint" et pointer sur ce repo : Render détecte `render.yaml` à la racine et propose de
   créer le service `networkmanager-backend` (free, `rootDir: server`, build `npm ci && npm run
   build`, start `npm run migrate && npm run seed && npm run start`).
3. Renseigner les variables marquées `sync: false` dans le dashboard :
   - `DATABASE_URL` : la chaîne de connexion Supabase de l'étape 1.
   - `JWT_SECRET` : chaîne aléatoire longue.
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET=uploads`.
   - `SEED_ADMIN_*` : mêmes valeurs qu'à l'étape 1.5 (le `npm run seed` au démarrage du service est
     idempotent, comme en local/Docker).
   - `CLIENT_ORIGIN` : laisser vide pour l'instant, à renseigner après l'étape 3 (URL Cloudflare
     Pages).
4. Déployer. Noter l'URL du service une fois en ligne (`https://networkmanager-backend.onrender.com`).

Le plan gratuit Render met le service en veille après 15 min d'inactivité (la première requête après
réveil prend 30-60s).

## 3. Cloudflare Pages (frontend)

1. Créer un compte sur https://pages.cloudflare.com (pas de carte bancaire) et connecter le repo.
2. Configuration du build :
   - Racine du projet : `client`
   - Commande de build : `npm run build`
   - Dossier de sortie : `dist`
3. Variables d'environnement du build :
   - `VITE_API_URL=https://networkmanager-backend.onrender.com/api` (URL Render de l'étape 2)
   - `VITE_UPLOADS_BASE_URL=https://<project-ref>.supabase.co/storage/v1/object/public/uploads`
     (URL publique du bucket Supabase de l'étape 1)
4. Déployer. Noter l'URL Cloudflare Pages (`https://<project>.pages.dev` ou domaine personnalisé).

## 4. Recroiser les URLs

Retourner dans Render et régler `CLIENT_ORIGIN` sur l'URL Cloudflare Pages de l'étape 3, puis
redéployer le backend (nécessaire pour que CORS/cookie cross-site acceptent les requêtes du
frontend).

## Vérification

- Ouvrir l'URL Cloudflare Pages, se connecter avec le compte admin seedé — confirme CORS + cookie
  cross-site (`COOKIE_CROSS_SITE=true` côté Render).
- Uploader une photo de matériel dans Type des données > Matériel — confirme le driver Supabase
  Storage (`STORAGE_DRIVER=supabase`).
- Système > Base de données > télécharger les sauvegardes "Données", "Droits" et "Fichiers" —
  confirme que `uploadStorage` fonctionne aussi pour le backup/restore des fichiers en mode Supabase.
