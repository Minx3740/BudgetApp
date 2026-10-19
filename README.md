# Budget App (nom provisoire)

Application web installable (PWA) de gestion de budget : un budget personnel et des budgets partagés par invitation, avec saisie des dépenses hors-ligne. Projet en cours de développement, usage privé.

Le cahier des charges est dans `docs/cahier-des-charges.md`. L'état d'avancement est dans `PROGRESS.md`.

## Stack

Vite, React, TypeScript strict, Tailwind CSS. Prévus dans les jalons suivants : Supabase (Postgres, Auth, RLS), Dexie (IndexedDB), Zod, vite-plugin-pwa, Playwright.

## Prérequis

Node 22 ou plus récent, npm, Git.

## Lancer le projet

```
npm install
cp .env.example .env
npm run dev
```

Sous PowerShell, remplace la deuxième commande par `Copy-Item .env.example .env`. Pour l'instant aucune variable n'est utilisée, le fichier `.env` ne servira qu'à partir du jalon M2.

## Scripts

| Commande               | Rôle                                  |
| ---------------------- | ------------------------------------- |
| `npm run dev`          | serveur de développement              |
| `npm run build`        | typecheck puis build de production    |
| `npm run lint`         | ESLint                                |
| `npm run typecheck`    | vérification des types                |
| `npm run test`         | tests Vitest (une exécution)          |
| `npm run test:watch`   | tests Vitest en continu               |
| `npm run format`       | formate le code avec Prettier         |
| `npm run format:check` | vérifie le formatage sans modifier    |

## Sécurité

Aucune clé secrète dans le dépôt. Le fichier `.env` n'est jamais versionné. La clé `service_role` de Supabase ne doit jamais apparaître côté client.