# Consignes projet — Balance

> ⚠️ Ce fichier est le **miroir** de `AGENTS.md` (chargé, lui, par les autres agents).
> Les deux doivent rester autonomes et dire la même chose : **toute modification ici
> est à reporter dans `AGENTS.md`**.

## ⚠️ RÈGLE ABSOLUE — Navigateur : uniquement l'intégré local, JAMAIS un navigateur externe

Pour **tester ou prévisualiser** quoi que ce soit, utiliser **exclusivement le navigateur
intégré local** de l'outil : le volet de prévisualisation *in-app* (serveur MCP
`Claude_Browser`). Ce volet reste **local à la machine en cours** et ne peut jamais
s'afficher ailleurs.

**Il est INTERDIT d'utiliser un navigateur externe / réel** — c'est-à-dire les outils
`mcp__claude-in-chrome__*` (et l'ancienne graphie `mcp__Claude_in_Chrome__*`), soit tout ce
qui pilote un **vrai Chrome, Firefox ou Edge** via une extension « navigateur connecté ».
Ne pas les charger, ne pas les appeler.

**Pourquoi.** Le compte de ce poste est **partagé** entre plusieurs personnes.
L'outil « navigateur externe » se connecte au navigateur réel *rattaché au compte* : il peut
donc ouvrir un onglet **sur le PC de quelqu'un d'autre** (Chrome **comme Firefox**).
C'est déjà arrivé sur plusieurs projets de ce poste. Le navigateur intégré local n'a pas ce problème.

**Garde-fou technique.** Un blocage dur est en place dans `.claude/settings.json`
(`permissions.deny` sur `mcp__claude-in-chrome` et `mcp__Claude_in_Chrome`).
Ce fichier est **versionné exprès** pour que la protection survive à un clone frais.
**Ne pas le retirer.**

> Règle simple : si un test nécessite un navigateur, c'est le **volet de prévisualisation
> intégré**, point. Jamais un vrai navigateur.

## Build & déploiement

- **Toujours builder en local**, jamais sur le serveur : AlwaysData n'a pas assez de RAM
  pour compiler et tue le processus.
- Le déploiement de référence est la CI (`.github/workflows/deploy.yml`, push sur `main`).
  `deploy.ps1` est le repli manuel équivalent.
- Garder l'app **légère** : peu de dépendances, pas de gros framework ajouté sans raison.
