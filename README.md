# FitTrack Dara Smart Scale Integration (QNScale)

Une application Web Progressive (PWA) et son API backend modulaire permettant de récupérer directement les mesures de poids et de composition corporelle de la balance FitTrack Dara via l'API Web Bluetooth, de façon locale et sécurisée.

## 🚀 Architecture

Ce projet est un mono-dépôt composé de deux parties :

- **`/backend`** : Serveur HTTP ultra-rapide (NodeJS + TypeScript + Fastify + Drizzle ORM + PostgreSQL) conçu pour être hébergé sur AlwaysData.
- **`/frontend`** : Application web client React + Vite + TypeScript utilisant la Web Bluetooth API pour se connecter directement à la balance.

## 🔒 Sécurité et Confidentialité

1. **Web Bluetooth et HTTPS** : L'accès au matériel Bluetooth est strictement contrôlé par les navigateurs. Il requiert obligatoirement une connexion HTTPS sécurisée (sauf en développement sur `localhost`) et une action explicite de l'utilisateur (clic sur un bouton) pour initier l'appairage.
2. **Isolation des Données** : Les profils de mesures sont protégés et liés de manière stricte au compte de l'utilisateur via authentification par jetons sécurisés (JWT).
3. **Zéro Cloud tiers** : Vos données physiologiques et pesées restent sur votre serveur personnel AlwaysData et votre base PostgreSQL, sans fuite de données vers des serveurs constructeurs tiers.

## 📡 Utilisation de la balance (Web Bluetooth)

La connexion à la balance passe par **Web Bluetooth**, dont les contraintes sont à connaître :

- **Navigateur** : uniquement **Chrome / Edge / Opera** (desktop ou Android). Firefox, Safari et **iOS ne supportent pas** Web Bluetooth.
- **HTTPS obligatoire** (sauf `localhost` en dev), et la connexion doit être déclenchée par un **clic**. L'aperçu intégré d'un IDE ne peut PAS ouvrir le sélecteur d'appareils — utilisez un vrai Chrome.
- **Réveillez la balance** (montez brièvement dessus) juste avant de cliquer « Lancer une pesée » : une balance BLE ne diffuse que lorsqu'elle est active.
- **Un seul central à la fois** : si l'app FitTrack du téléphone est connectée, coupez son Bluetooth, sinon la balance n'est pas joignable depuis le navigateur.
- **Windows** : ne PAS appairer la balance dans les Paramètres Bluetooth de Windows. Si elle y figure déjà et que la connexion échoue, retirez-la (« Supprimer le périphérique »).

### Reconnexion sans re-sélectionner

- Dans une même session, l'app **réutilise** automatiquement la balance déjà choisie (pas de sélecteur au 2ᵉ essai).
- Pour la conserver **entre les sessions** (après fermeture de Chrome), activez une fois ces deux flags puis relancez Chrome :
  - `chrome://flags/#enable-web-bluetooth-new-permissions-backend` → **Enabled**
  - `chrome://flags/#enable-experimental-web-platform-features` → **Enabled**

  L'app utilisera alors `navigator.bluetooth.getDevices()` pour reconnecter sans repasser par le sélecteur.

> ℹ️ **À propos de la « low latency »** : l'API Web Bluetooth **n'expose aucun contrôle** de la latence ni de la priorité de connexion BLE (`requestConnectionPriority` n'existe qu'en **natif Android**). Pour une balance qui envoie des pesées ponctuelles, ce n'est pas un facteur limitant. Un contrôle fin de la connexion nécessiterait une app native ou Capacitor (Android uniquement).

## 🛠️ Installation & Développement local

### Prérequis

- **Node.js ≥ 20** (testé sur Node 22) et **npm**
- Un navigateur compatible **Web Bluetooth** (Chrome, Edge ou Opera) pour la connexion à la balance
- En local, aucune base à installer : le backend utilise **PGlite** (PostgreSQL embarqué) persisté dans `./db_data`

### 1. Backend

```bash
cd backend
cp .env.example .env        # puis adaptez les valeurs si besoin
npm install
npm run dev                 # API sur http://localhost:3006 (+ WebSocket sur /ws)
```

Les migrations de base de données sont appliquées automatiquement au démarrage.

| Script            | Rôle                                                        |
| ----------------- | ----------------------------------------------------------- |
| `npm run dev`     | Démarre l'API en mode watch (PGlite local)                  |
| `npm run build`   | Compile le TypeScript vers `dist/`                          |
| `npm start`       | Lance le serveur compilé (`dist/server.js`)                 |
| `npm test`        | Tests unitaires (calculateur BIA)                           |
| `npm run db:generate` | Génère une migration Drizzle à partir du schéma         |
| `npm run db:studio`   | Ouvre Drizzle Studio                                    |

### 2. Frontend

```bash
cd frontend
cp .env.example .env        # VITE_API_URL et VITE_WS_URL pointent sur le backend
npm install
npm run dev                 # PWA sur http://localhost:5173
```

> 📱 Le serveur de dev écoute sur `0.0.0.0`, ce qui permet d'ouvrir l'app depuis un
> smartphone sur le même réseau Wi-Fi. **Attention** : la Web Bluetooth exige le HTTPS
> (sauf sur `localhost`). Pour tester depuis un téléphone, exposez l'app via un tunnel
> HTTPS (ex. `ngrok`, `cloudflared`) et ajustez `VITE_API_URL` / `VITE_WS_URL` en conséquence.

### 3. Variables d'environnement

| Côté     | Variable        | Description                                                        |
| -------- | --------------- | ----------------------------------------------------------------- |
| Backend  | `NODE_ENV`      | `development` (PGlite) ou `production` (PostgreSQL)                |
| Backend  | `PORT` / `HOST` | Port et hôte d'écoute (par défaut `3006` / `0.0.0.0`)             |
| Backend  | `DATABASE_URL`  | Connexion PostgreSQL — **requise en production**                  |
| Backend  | `JWT_SECRET`    | Secret de signature JWT — **obligatoire en production**           |
| Backend  | `CORS_ORIGIN`   | Origine autorisée (URL du frontend) — à définir en production     |
| Frontend | `VITE_API_URL`  | URL de l'API REST (suffixe `/api` inclus)                         |
| Frontend | `VITE_WS_URL`   | URL du WebSocket temps réel (même port que le backend)            |

### 4. Déploiement (production)

```bash
# Backend (ex. AlwaysData)
cd backend && npm install && npm run build && NODE_ENV=production npm start

# Frontend : build statique à servir derrière HTTPS
cd frontend && npm install && npm run build   # génère dist/
```

En production, le serveur **refuse de démarrer** si `JWT_SECRET` n'est pas défini, et
avertit dans les logs si `CORS_ORIGIN` est laissé ouvert (`*`).

> ⚠️ **Avertissement santé** : les valeurs de composition corporelle sont estimées par
> des formules empiriques de bio-impédance (BIA) et ne constituent pas un diagnostic
> médical.
