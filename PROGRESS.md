# PROGRESS

## Reprise

- Dernière mise à jour : 2026-10-24 22:11 (+03:00).
- Branche : `reforme-budget` (branche créée depuis `main` avec les modifications
  locales préexistantes conservées).
- Lot/tâche en cours : R1 — tâche 2/7, simplification de la migration Supabase selon
  la décision destructive et préparation de ses tests SQL.
- Terminé et vérifié :
  - R0 : cahier v1.2 et guide UI validés par Laro ; suivi R0–R6 présent.
  - Schémas et types Zod R1 pour budget mensuel, report, types de transactions réformés
    et archive définis ; tests de contrats réussis.
  - Calculs purs R1 pour budget, dépenses/remboursements, revenus, ajustements et
    report définis ; tests ciblés réussis.
  - Au dernier contrôle : `npm run typecheck`, `npm run lint`, 15 tests ciblés,
    `npm run build`, Prettier ciblé et `git diff --check` réussis.
  - `deploy-pages.yml` est déclenché sur push vers `main` uniquement ; aucun push n’a
    été fait.
- Fait mais pas encore vérifié :
  - La décision destructive est reportée dans le cahier v1.2 et la réforme ; les listes
    R1 y sont simplifiées. Format et commit documentaire restent à faire.
  - `supabase/migrations/20261024200000_r1_budget_model.sql` est un brouillon
    incompatible avec la nouvelle décision (il archive/transfère les données et
    convertit les soldes) ; il faut le remplacer par une migration destructive simple.
  - Les types/calculs R1 ne sont pas raccordés à Dexie, repositories, bootstrap,
    synchronisation ni écran actuel.
- Prochaine action exacte : remplacer le contenu de
  `supabase/migrations/20261024200000_r1_budget_model.sql` pour vider les anciennes
  tables concernées et créer le schéma cible ; ne conserver aucune logique P11.
- Vérifications à exécuter avant R1 terminé : `npm run format`, `npm run lint`,
  `npm run typecheck`, `npm test`, `npm run build` et suite SQL pgTAP. Ne jamais
  appliquer une migration au Supabase distant sans accord explicite.
- Décisions confirmées :
  - P8 : montants TypeScript `number` entier sûr validé par Zod.
  - P9 : suivre les conventions de nommage existantes.
  - Données de test Supabase et locales supprimables : vider/supprimer les anciennes
    données, comptes, transferts et file d’attente ; aucun ajustement initial,
    archivage, report historique ou reprise des opérations en attente.
  - Dès la première utilisation avec des données à conserver, toute migration doit
    être conservatrice.
  - Adaptation minimale de l’écran transactions en R1 : retirer uniquement la
    dépendance aux comptes/transferts ; parcours complet reporté à R4.
- Questions ouvertes : aucune décision métier R1 ouverte. Aucun test SQL local dédié
  n’a encore été exécuté ; il faut confirmer les outils disponibles avant validation.
- Pièges connus :
  - Le worktree avait des changements locaux antérieurs ; les préserver et ne
    committer que les fichiers de la tâche concernée.
  - Ne pas tenter de compatibilité avec l’ancien modèle (aucune version n’a été
    déployée) et ne pas exécuter de DDL Supabase distant.
  - Le workflow Cloudflare ne doit déployer que depuis `main`; vérifier encore juste
    avant tout push.

## État actuel

- Jalon en cours : M9 (historique, finitions et robustesse)
- Dernier jalon validé : M8 (2026-10-24)
- Prochaine action : poursuivre M9 ; le test de conflit réel M6 entre appareils reste également à faire.
- Réforme budget : R0 validé ; R1 en cours sur `reforme-budget`.

## Jalons

| Jalon | Statut                                                                                      | Date       |
| ----- | ------------------------------------------------------------------------------------------- | ---------- |
| M0    | validé (CI verte)                                                                           | 2026-10-19 |
| M1    | validé                                                                                      | 2026-10-23 |
| M2    | validé                                                                                      | 2026-10-24 |
| M3    | validé*                                                                                     | 2026-10-24 |
| M4    | validé                                                                                      | 2026-10-24 |
| M5    | validé                                                                                      | 2026-10-24 |
| M6    | implémenté, migration appliquée, push/suppression validés ; test entre appareils en attente | 2026-10-24 |
| M7    | validé : calculs et parcours UI vérifiés                                                    | 2026-10-24 |
| M8    | validé : invitation, saisie en ligne et saisie hors-ligne synchronisée entre deux comptes   | 2026-10-24 |
| M9    | en cours : recherche, filtres et pagination de l'historique implémentés                     | 2026-10-24 |
| M10   | à faire                                                                                     |            |

## Réforme du budget (R0–R6)

Ces lots suivent la cible validée dans `docs/cahier-des-charges.md` v1.2. Ils sont
distincts des jalons historiques M0–M10. Chaque lot attend la validation de Laro avant
le suivant.

| Lot | Statut                                                                                                                               | Date       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| R0  | Validé — cahier v1.2, guide UI, état des lieux et propositions R1                                                                    | 2026-10-24 |
| R1  | En cours — contrats/calculs prêts ; migration destructive à simplifier ; stockage, sync, écran minimal et validation restent à faire | 2026-10-24 |
| R2  | À faire — budget, solde, seuils et écrans                                                                                            |            |
| R3  | À faire — navigation, profil et réglages                                                                                             |            |
| R4  | À faire — transactions, remboursements, ajustements et responsable                                                                   |            |
| R5  | À faire — forfaits                                                                                                                   |            |
| R6  | À faire — analyses                                                                                                                   |            |

### État des lieux vérifié pour R0

- La réforme complète est à la racine du dépôt : `reforme-budget-global.md`.
- Le cahier des charges v1.2 est validé et enregistré dans `docs/cahier-des-charges.md`.
- Le guide UI est créé dans `docs/guide-ui.md`, à partir des variables et composants
  visuels existants.
- Les migrations sont présentes dans `supabase/migrations/`.
- Le test RLS présent est `supabase/tests/database/001_rls_and_invitations.test.sql`.
  Aucun autre fichier de test SQL n’a été trouvé dans `supabase/tests/`.
- Playwright n’est pas déclaré dans le `package.json` inspecté.
- Le déploiement Cloudflare est décrit dans `.github/workflows/deploy-pages.yml`.
- P8 et P9 confirmées le 2026-10-24. Décision ultérieure de Laro : les données Supabase
  et Dexie sont des données de test et peuvent être supprimées ; aucune conservation
  d’anciens soldes, transferts, reports ou opérations en attente.
- Dès la première utilisation réelle avec données à conserver, les migrations devront
  être conservatrices.

## Décisions prises

- 2026-10-24 : nom officiel de l'application : cashFlow+.
- 2026-10-24 : l'import initial des données Supabase dans Dexie précède les écrans M5 afin de conserver les identifiants des espaces et des données déjà créés côté serveur.
- 2026-10-19 : Vite + React + TypeScript (SPA) à la place de Next.js, car l'app est pilotée par la base locale et n'a pas besoin de rendu serveur.
- 2026-10-19 : vite-plugin-pwa à la place de Serwist (conséquence du choix de Vite).
- 2026-10-19 : Tailwind CSS 4 via le plugin Vite. shadcn/ui sera ajouté en M3.
- 2026-10-19 : authentification par email et mot de passe uniquement en v1 (pas de Google).
- 2026-10-19 : moteur de synchronisation écrit à la main.
- 2026-10-19 : environnement de dev Windows 10, Node 22.14, npm, VS Code. Dépôt GitHub privé.
- 2026-10-19 : options TypeScript strictes activées (strict, noUncheckedIndexedAccess, noImplicitReturns, noImplicitOverride). exactOptionalPropertyTypes volontairement désactivé.
- 2026-10-19 : fins de ligne LF forcées (`.gitattributes` avec `eol=lf` et `endOfLine: "lf"` dans `.prettierrc`). La CI tourne sous Linux et échouait sur `format:check` à cause des fichiers formatés sous Windows.

## Règle de travail

- Avant chaque commit : `npm run format`, puis `npm run lint`, `npm run typecheck`,
  `npm test` et `npm run format:check`. La CI lance les mêmes contrôles et refuse le
  commit sinon. Sur la branche `reforme-budget`, committer une tâche terminée à la fois.

## Problèmes connus / dettes techniques

- TypeScript est fixé à ~6.0.3 dans package.json. Le modèle Vite proposait 7.0.2, mais typescript-eslint 8.71.2 n'accepte que les versions inférieures à 6.1.0. À réexaminer quand typescript-eslint supportera TypeScript 7.
- Les actions GitHub de la CI sont en v4 (checkout, setup-node). Elles fonctionnent. Surveiller un éventuel avertissement de dépréciation.
- M1 : schéma relu et tests SQL confirmés par le développeur ; migrations appliquées au projet Supabase hébergé.
- M2 : migrations appliquées ; inscription, confirmation e-mail, réinitialisation du mot de passe, connexion et déconnexion validées sur Supabase le 2026-10-24.
- M3 : shadcn/ui initialisé avec Radix Nova ; navigation responsive, manifest, icônes et service worker livrés. Build, précache, shell hors-ligne simulé, badge réseau et navigation validés dans Chromium. Dérogation acceptée : installation Android réelle et audit Lighthouse reportés à M10.
- M4 : validé le 2026-10-24. Couche miroir Dexie avec outbox transactionnelle, validation Zod, repositories typés et hooks réactifs ; purge locale à la déconnexion. Six tests IndexedDB passent. Synchronisation non implémentée (réservée à M6).
- M5 : validé le 2026-10-24. Écrans locaux de transactions, comptes et catégories ; ajout rapide en panneau, archivage, modification et suppression logique. Le solde est calculé localement ; scénario dépense → modification → suppression et recalcul testé. Import Supabase réel vérifié dans l'app : 1 espace, 3 comptes et 8 catégories chargés ; saisie/écrans parcourus en mode hors-ligne sans modifier les données personnelles.
- M6 : moteur client implémenté : push séquentiel/idempotent avec reprise, pull paginé par curseur (chevauchement 60 s), horloge serveur, tombstones prioritaires, purge après retrait d'accès, indicateur UI et relance manuelle. Tests automatisés couvrent l'interruption au milieu du push, l'accusé perdu, les conflits, les suppressions et l'accès retiré. La migration `supabase/migrations/20261024180000_sync_invariants.sql` a été exécutée avec succès dans Supabase le 2026-10-24. Une dépense de test a été créée, synchronisée puis supprimée logiquement dans l'application ; le test réel de conflit entre deux appareils reste à faire.
- M7 : calcul local du budget mensuel, accueil et gestion des plafonds implémentés. Couverture : dépenses par catégorie, reste global et quotidien, catégorie sans plafond, dépassement, suppression logique et changement de mois. Lint, TypeScript, formatage, 32 tests et build de production passent. Dans l'application, l'accueil, la vue Budgets, le formulaire sans enregistrement et la navigation entre mois ont été vérifiés ; aucune donnée personnelle n'a été modifiée.
- M8 : validé le 2026-10-24. Fonctionnalités livrées : création d'espaces partagés avec comptes/catégories par défaut, sélecteur persistant, invitation à usage unique valable 7 jours (jeton aléatoire 256 bits stocké haché), acceptation par RPC, révocation et gestion des rôles/membres. Les accès viewer sont en lecture seule dans l'UI ; RLS reste l'autorité serveur. La synchronisation actualise aussi le rôle depuis le serveur. Validation réelle à deux comptes : le propriétaire a invité le deuxième compte, qui a accepté l'invitation comme membre ; une dépense saisie en ligne a été vue par le propriétaire ; une seconde dépense de 3 MGA saisie hors-ligne a été enregistrée localement, mise en attente, puis synchronisée et visible côté propriétaire après le retour en ligne. Les tests automatisés (35), le lint, TypeScript, le formatage et le build passent. Trois dépenses de test (1, 2 et 3 MGA) restent dans l'espace `TEST M8 - cashFlow+`.
- M9 : recherche texte sans distinction d'accents et filtres par dates, catégorie, compte et membre ajoutés à l'historique. Pagination de 50 lignes pour borner le rendu, état vide distinct quand les filtres ne trouvent rien, et commandes avec libellés accessibles. Tests automatisés couvrent les filtres combinés, les transferts filtrés par compte et un jeu de 5 000 transactions (100 pages, 50 éléments maximum par page). Vérification navigateur sur l'espace M8 : recherche correspondante et aucun résultat affichés correctement. Un workflow Cloudflare Pages est présent ; déploiement réel et essai smartphone restent à valider avec les variables Actions et l'URL de redirection Supabase. Le polissage complet, les autres états de robustesse/accessibilité et la validation du jalon restent à faire.

## Ce qui n'est PAS encore fait

- *M3 est validé avec installation Android et audit Lighthouse reportés à M10 ; les données métier hors-ligne arrivent en M4.
- Playwright.
