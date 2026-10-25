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

La section Espaces permet de créer un espace partagé, d'en sélectionner un, de gérer les membres
et leurs rôles, et de créer ou révoquer des invitations. Les liens sont à usage unique et valables
sept jours par défaut ; seul leur condensat est enregistré. L'acceptation nécessite Internet.
Les viewers ont une interface en lecture seule et les permissions restent imposées par la RLS.

Pour vérifier l'installation, lance `npm run build`, puis `npm run preview` et ouvre
l'URL locale dans Chrome. Utilise le menu du navigateur **Installer cashFlow+**. Le
service worker de production est activé dans le build ; en développement, il est
également activé pour faciliter les essais. Les icônes PNG et ICO sont générées à
partir de `public/budget-app-icon.svg` avec `npm run pwa:assets`.

## Déploiement sur Cloudflare Pages

Le projet Cloudflare Pages `budgetapp` est connecté directement au dépôt
`Minx3740/BudgetApp`. La branche de production est `main`, la commande de build est
`npm run build` et le répertoire publié est `dist`. Seule une mise à jour de `main`
déploie la production à [budgetapp-epz.pages.dev](https://budgetapp-epz.pages.dev).

### Aperçus de branches

Cloudflare crée un aperçu pour les autres branches. Pour vérifier une modification,
pousse la branche concernée ; par exemple, pousser `reforme-budget` déclenche un aperçu
à [reforme-budget.budgetapp-epz.pages.dev](https://reforme-budget.budgetapp-epz.pages.dev).
Cela ne modifie pas le site de production.

### Variables d’environnement

Dans les paramètres du projet Cloudflare Pages, définis les variables suivantes pour
les deux environnements **Production** et **Preview** :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

La clé publishable est exposée au navigateur par conception. N’utilise jamais une clé
`service_role` dans une variable `VITE_*`. Les URL de retour utilisées pour la connexion
et la confirmation par e-mail doivent également être autorisées dans Supabase, sous
**Authentication → URL Configuration → Redirect URLs**.

### Migrations déjà appliquées à la base Supabase distante

Le suivi du projet indique que les migrations ci-dessous ont déjà été appliquées au
projet Supabase distant utilisé pour les essais. Elles ne font pas partie du build
Cloudflare et ne sont pas appliquées automatiquement par l’intégration Git. Pour un
autre projet Supabase, examine d’abord son historique : les migrations s’appliquent
manuellement, dans l’ordre des noms de fichiers, et ne doivent pas être rejouées sur
une base qui les a déjà reçues.

1. `20261023154500_init_workspaces.sql`
2. `20261023160000_data_and_invitations.sql`
3. `20261023170000_personal_workspace_defaults.sql`
4. `20261024180000_sync_invariants.sql`
5. `20261024200000_r1_budget_model.sql`
6. `20261025000000_r3_private_avatars.sql`
7. `20261025090000_r5_recurring_expenses.sql`
8. `20261025095000_r5_recurring_expense_timestamps.sql`

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
dans le SQL Editor du tableau de bord. Vérifie d'abord l'historique du projet : sur une
base neuve, applique les fichiers de `supabase/migrations/` dans l'ordre de leurs noms ;
ne rejoue jamais une migration déjà appliquée. La liste des migrations déjà appliquées
au projet distant de test est donnée dans la section Cloudflare ci-dessus.

À chaque inscription, l'application crée un espace personnel « Perso », trois
comptes (espèces, mobile money, banque) et des catégories de revenus et dépenses.
L'authentification utilise exclusivement l'adresse e-mail et le mot de passe.
L'écran de connexion permet aussi de demander un lien de réinitialisation du mot
de passe et de renvoyer un e-mail de confirmation si le lien a expiré.
L'inscription redirige vers l'origine courante de l'application après confirmation.
Dans Supabase, ajoute `http://localhost:5173/**` aux Redirect URLs
(Authentication → URL Configuration) pour autoriser le retour vers l'application
en développement ; ajoute également l'URL de production lors du déploiement.
