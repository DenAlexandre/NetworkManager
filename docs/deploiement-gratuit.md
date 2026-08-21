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
5. **Optionnel mais recommandé** : vérifier la connexion à Supabase depuis un poste avec Node
   installé, avant de configurer Render. `render.yaml` fait déjà tourner `npm run migrate && npm run
   seed` automatiquement à chaque démarrage du service Render (comme `docker/backend/start.sh` le
   fait pour Docker) — cette étape n'est donc pas strictement nécessaire, mais permet de voir
   immédiatement une éventuelle erreur de connexion (mauvaise chaîne `DATABASE_URL`, SSL requis,
   etc.) plutôt que de la découvrir dans les logs de déploiement Render.

   `npm run migrate` (`server/src/db/migrate.ts`) crée toutes les tables dans la base (`users`,
   `roles`, `equipment`, ...) ; `npm run seed` (`server/src/db/seed.ts`) crée/met à jour le compte
   administrateur (`SEED_ADMIN_*`) — c'est ce compte qui servira à se connecter une fois l'app en
   ligne. Les deux scripts sont idempotents (relançables sans risque).

   En PowerShell (remplacer les valeurs, notamment `SEED_ADMIN_*` comme dans
   `server/.env.example`) :
   ```powershell
   cd server
   $env:DATABASE_URL = "<connection string Supabase>"
   $env:DATABASE_SSL = "true"
   npm run migrate

   $env:SEED_ADMIN_USERNAME = "Admin"
   $env:SEED_ADMIN_FIRST_NAME = "Admin"
   $env:SEED_ADMIN_LAST_NAME = "Admin"
   $env:SEED_ADMIN_EMAIL = "admin@example.com"
   $env:SEED_ADMIN_PHONE = "0000000000"
   $env:SEED_ADMIN_PASSWORD = "Admin123"
   npm run seed

   # Ces $env: ne modifient que cette fenêtre PowerShell — les nettoyer (ou fermer la fenêtre)
   # pour ne pas risquer qu'une autre commande npm de cette session (ex. `npm run dev`) parte
   # par erreur sur la base Supabase au lieu de la base locale.
   Remove-Item Env:DATABASE_URL, Env:DATABASE_SSL, Env:SEED_ADMIN_USERNAME, Env:SEED_ADMIN_FIRST_NAME, Env:SEED_ADMIN_LAST_NAME, Env:SEED_ADMIN_EMAIL, Env:SEED_ADMIN_PHONE, Env:SEED_ADMIN_PASSWORD
   ```

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

Le routage SPA (recharger une page sur `/equipment`, etc. sans 404) est géré par
`client/wrangler.jsonc` (`assets.not_found_handling: "single-page-application"`) — Cloudflare
déploie désormais ce type de projet sur son infrastructure Workers, où un fichier `_redirects` avec
une règle `/* -> /index.html` est rejeté au déploiement ("infinite redirect loop") car il entre en
conflit avec cette gestion native ; ne pas réintroduire de `_redirects` pour ce besoin.

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
