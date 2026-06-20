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

## 🛠️ Installation & Développement local

*(Instructions de démarrage à compléter en cours de développement)*
