# Cuisine

Site de recettes de cuisine avec gestion de rôles : les utilisateurs (`user`) proposent des recettes,
qui doivent être validées par un administrateur (`admin`) avant d'être visibles publiquement.

## Stack

- **client/** : React + Vite + TypeScript, React Router
- **server/** : Node.js + Express + TypeScript, PostgreSQL (`pg`), JWT (cookie httpOnly), bcrypt

## Prérequis

- Node.js 18+
- Une base PostgreSQL accessible

## Installation

### 1. Base de données

Le plus simple : lancer PostgreSQL via Docker avec le script fourni (idempotent, volume persistant) :

```powershell
./scripts/start-db.ps1
```

Sinon, créez manuellement une base PostgreSQL (ex: `cuisine`), puis dans `server/` :

```bash
cd server
cp .env.example .env
# éditez .env : DATABASE_URL, JWT_SECRET, SEED_ADMIN_*
npm install
npm run migrate   # crée/met à jour les tables users / recipes
npm run seed      # crée le compte admin défini dans .env
```

### 2. Serveur + client

```powershell
./scripts/run-dev.ps1   # installe les dépendances si besoin et ouvre server (4000) + client (5173)
```

Ou manuellement :

```bash
cd server && npm run dev       # http://localhost:4000
cd client && cp .env.example .env && npm run dev   # http://localhost:5173
```

## Lancer en debug depuis VS Code

Ouvrez `Cuisine.code-workspace` (double-clic, ou `code Cuisine.code-workspace`), puis dans l'onglet **Run and Debug** (Ctrl+Shift+D) :

- **Server: Debug (Express/TS)** : lance `npm run dev` dans un terminal avec breakpoints actifs sur le code TypeScript du serveur.
- **Client: Debug (Chrome)** : démarre le serveur Vite puis ouvre Chrome avec les breakpoints actifs sur le code React (`client/src`).
- **Full Stack: Server + Client** : lance les deux en même temps.

Les configurations sont dans `.vscode/launch.json` et `.vscode/tasks.json`.

## Fonctionnement

- Un visiteur non connecté peut consulter les recettes **validées**.
- L'inscription demande : pseudo, nom, prénom, email, téléphone et mot de passe. La **connexion se
  fait avec le pseudo** (pas l'email).
- Un utilisateur inscrit peut proposer une recette (statut `pending`), voir ses propres soumissions
  (tous statuts) et supprimer/modifier celles encore en attente.
- Un administrateur (compte créé via `npm run seed`) accède à `/admin` pour valider ou rejeter les
  recettes en attente.

## Structure

```
Cuisine/
├── client/   # application React
└── server/   # API REST Express
```
