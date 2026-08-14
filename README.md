# Cuisine

Application de gestion des droits : inscription, connexion et gestion des rôles utilisateur
(`user` / `admin`).

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

Sinon, créez manuellement une base PostgreSQL (ex: `networkmanager`), puis dans `server/` :

```bash
cd server
cp .env.example .env
# éditez .env : DATABASE_URL, JWT_SECRET, SEED_ADMIN_*
npm install
npm run migrate   # crée/met à jour la table users
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

## Fonctionnement

- L'inscription demande : pseudo, nom, prénom, email, téléphone et mot de passe. La **connexion se
  fait avec le pseudo** (pas l'email).
- Un utilisateur inscrit accède à ses informations de compte.
- Un administrateur (compte créé via `npm run seed`) dispose du rôle `admin`, distingué du rôle
  `user` par le middleware `requireRole` côté serveur et par `AdminRoute` côté client.

## Structure

```
Cuisine/
├── client/   # application React
└── server/   # API REST Express
```
