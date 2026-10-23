# cashFlow+

Application web installable (PWA) de gestion de budget : un budget personnel et des budgets partagés par invitation, avec saisie des dépenses hors-ligne. Projet en cours de développement, usage privé.

Le cahier des charges est dans `docs/cahier-des-charges.md`. L'état d'avancement est dans `PROGRESS.md`.

## Stack

Vite, React, TypeScript strict, Tailwind CSS 4, shadcn/ui, Supabase (Postgres, Auth, RLS), Dexie (IndexedDB), Zod et vite-plugin-pwa.

## Prérequis

Node 22 ou plus récent, npm, Git.

## Lancer le projet

```
npm install
cp .env.example .env
npm run dev
```

Sous PowerShell, copie `.env.example` vers `.env.local` avec `Copy-Item .env.example .env.local`. Vérifie que l'URL et la clé publishable correspondent au projet Supabase utilisé.

## Scripts

| Commande               | Rôle                               |
| ---------------------- | ---------------------------------- |
| `npm run dev`          | serveur de développement           |
| `npm run build`        | typecheck puis build de production |
| `npm run lint`         | ESLint                             |
| `npm run typecheck`    | vérification des types             |
| `npm run test`         | tests Vitest (une exécution)       |
| `npm run test:watch`   | tests Vitest en continu            |
| `npm run format`       | formate le code avec Prettier      |
| `npm run format:check` | vérifie le formatage sans modifier |
| `npm run pwa:assets`   | régénère les icônes depuis le SVG  |

## Sécurité

Aucune clé secrète dans le dépôt. Le fichier `.env` n'est jamais versionné. La clé `service_role` de Supabase ne doit jamais apparaître côté client.

## Application installable

Le service worker met en cache l'app shell pour qu'elle puisse s'ouvrir hors-ligne ;
la page statique `/offline.html` est également incluse comme secours. Les données métier
sont maintenant stockées localement dans IndexedDB via Dexie. Les repositories écrivent
chaque modification et son entrée d'outbox dans une transaction locale. Après connexion,
une première copie paginée est importée, puis le moteur M6 pousse l'outbox et récupère les
changements distants avec des curseurs par espace/table. Il se relance à l'ouverture, au
retour du réseau, au retour au premier plan et périodiquement. La déconnexion efface la base
locale.

L'accueil affiche aussi le reste à dépenser du mois, la moyenne quotidienne, les dernières
transactions et les catégories les plus consommées. La section Budgets permet de créer et
modifier des plafonds mensuels par catégorie ; dépenses et progression sont calculées à partir
des données locales et restent consultables hors-ligne.

Pour vérifier l'installation, lance `npm run build`, puis `npm run preview` et ouvre
l'URL locale dans Chrome. Utilise le menu du navigateur **Installer cashFlow+**. Le
service worker de production est activé dans le build ; en développement, il est
également activé pour faciliter les essais. Les icônes PNG et ICO sont générées à
partir de `public/budget-app-icon.svg` avec `npm run pwa:assets`.

## Base de données

Les migrations et tests RLS sont dans `supabase/`. Pour démarrer la base locale et
exécuter les tests pgTAP, installer Docker Desktop et la CLI Supabase, puis lancer
dans PowerShell :

```powershell
supabase start
supabase test db
```

Les migrations locales sont appliquées par `supabase start`. La première migration
crée les profils et espaces ; la suivante ajoute les données métier et les invitations.

Pour un projet Supabase hébergé, les migrations SQL peuvent aussi être appliquées
dans le SQL Editor du tableau de bord, dans l'ordre chronologique. Ne les exécute
que sur un projet neuf ou dont l'historique de migrations correspond.
Applique les migrations M1 `20261023154500` et `20261023160000` avant la migration
M2 `20261023170000` ; le trigger d'inscription M2 dépend des tables métier créées par
la deuxième migration M1. Pour activer la synchronisation M6 sur le projet hébergé,
applique aussi `20261024180000_sync_invariants.sql` après les migrations précédentes
dans le SQL Editor. Cette migration ajoute l'horloge serveur et le timestamp des budgets,
et empêche la résurrection d'une ligne supprimée.

À chaque inscription, l'application crée un espace personnel « Perso », trois
comptes (espèces, mobile money, banque) et des catégories de revenus et dépenses.
L'authentification utilise exclusivement l'adresse e-mail et le mot de passe.
L'écran de connexion permet aussi de demander un lien de réinitialisation du mot
de passe. Dans Supabase, ajoute `http://localhost:5173/**` aux Redirect URLs
(Authentication → URL Configuration) pour autoriser le retour vers l'application
en développement ; ajoute également l'URL de production lors du déploiement.
