# PROGRESS

## Reprise

- Dernière mise à jour : 2026-10-25 14:15 (UTC+03:00).
- Branche courante : `reforme-budget` ; `main` n’a pas été modifiée. Ne jamais pousser sur
  `main`.
- Lot/tâche en cours : validation manuelle de l’aperçu Cloudflare ; Laro a terminé les
  essais sur téléphone et rapporte les 12 scénarios OK.
- Terminé et vérifié : état Git relevé. Changements déjà présents avant cette tâche,
  à préserver et ne pas commiter comme partie de cette tâche : `.env.example`,
  `.github/workflows/ci.yml`, la modification préexistante de `src/components/workspaces/
workspace-management.tsx`, les modifications préexistantes de `README.md` et
  `vite.config.ts`, et le fichier non suivi `.github/workflows/deploy-pages.yml`.
  Le présent travail a aussi actualisé la section Cloudflare de `README.md` et ramené
  `base` à `/` dans `vite.config.ts`.
- Terminé et vérifié : aucun `_redirects` ni `404.html` dans `public` ou `dist`.
  Après `npm run build`, le manifeste généré indique `start_url: "/"` et `scope: "/"`;
  l’enregistrement du service worker utilise `registerSW({ immediate: true })`, sans
  domaine fixe. `vite.config.ts` utilise `base = '/'`, et le manifeste/service worker
  générés ne contiennent ni domaine Cloudflare codé en dur, ni ancien chemin `/BudgetApp/`.
- Terminé et vérifié : le build de production passe (2026-10-25), avec l’avertissement
  Vite non bloquant sur le chunk principal de 811,57 kB. Le workflow local non suivi
  `.github/workflows/deploy-pages.yml` a `push` limité à `main`, mais conserve aussi
  `workflow_dispatch` : un lancement manuel peut sélectionner une autre branche.
- Terminé : README décrit l’intégration Git Cloudflare, le projet `budgetapp`, les
  variables Production/Preview, la production sur `main`, l’aperçu de branche, et les huit
  migrations déclarées déjà appliquées au projet Supabase distant de test, dans l’ordre
  des noms. Aucune migration Supabase n’a été exécutée durant cette tâche.
- Terminé : Laro a autorisé la suppression du workflow local obsolète ; le fichier
  `.github/workflows/deploy-pages.yml` a été supprimé. La CI GitHub n’a pas été modifiée.
- Terminé : `docs/test-telephone.md` contient les scénarios détaillés et les résultats
  saisis par Laro. Les 12 scénarios sont marqués OK : connexion/déconnexion, sous-route,
  revenu, dépenses avec/sans seuil, remboursement/ajustement, déficit, date du 31,
  génération/modification de forfait, affichage mobile, hors ligne/synchronisation et
  droits d’un membre invité. Résultats rapportés par Laro, non reproduits indépendamment.
- Vérifications finales : `npm test` réussi (77 tests, 13 fichiers), `npm run lint`,
  `npm run typecheck`, `npm run build` et `git diff --check` réussis. Build PWA réussi ;
  avertissement Vite non bloquant sur le chunk principal de 811,57 kB.
- Formatage : `npx prettier --check PROGRESS.md README.md vite.config.ts
docs/test-telephone.md` passe. `npm run format:check` échoue uniquement sur
  `.github/workflows/ci.yml`, modification préexistante volontairement préservée.
- Tests SQL : `supabase test db` non exécuté ; CLI Supabase et Docker ne sont pas installés.
  Les tests SQL R1/R3/R5 précédemment validés restent documentés ci-dessous. Aucun SQL ni
  migration distante n’a été exécuté pour cette tâche.
- Commit et push effectués : `f781f3e` (`docs: prepare Cloudflare Pages branch preview`)
  sur `origin/reforme-budget`. La branche suit son upstream et est synchronisée.
- Prochaine action exacte : choisir la prochaine priorité de développement (par exemple
  poursuivre les finitions M9 ou traiter les dettes reportées M10/M6) ; les essais
  téléphoniques de l’aperçu sont rapportés OK par Laro.
- Vérifications finales à lancer : `npm test`, `npm run lint`,
  `npm run typecheck`, `npm run format:check`, `npm run build`, `git diff --check` et
  `supabase test db` (tests SQL locaux, si Docker et la CLI Supabase sont disponibles).
- Décisions confirmées : intégration Git Cloudflare Pages (projet `budgetapp`, dépôt
  `Minx3740/BudgetApp`), production depuis `main`, build `npm run build`, sortie `dist`,
  aperçus de branches ; `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` définies
  dans les environnements Production et Preview. Push autorisé uniquement de
  `reforme-budget`, après les vérifications finales. Aucune migration distante durant
  cette tâche. Les migrations de test déjà appliquées ne doivent pas être rejouées.
- Décision de Laro : suppression du workflow local obsolète `deploy-pages.yml` autorisée ;
  Cloudflare Pages reste le seul mécanisme de déploiement. La CI GitHub reste en place.
- Questions encore ouvertes : prochaine priorité après les validations R0–R6 et les essais
  sur téléphone.
- Pièges connus : le workflow est non suivi, cible l’ancien projet `cashflow-plus`, et
  offre un déclenchement manuel en plus du push sur `main`. Sa suppression ne doit pas
  toucher la CI ni l’intégration Git Cloudflare. Préserver les changements préexistants
  listés ci-dessus. Le fichier `deploy-pages.yml` était non suivi avant sa suppression :
  sa suppression locale ne constitue donc pas un changement de fichier suivi dans le
  commit. Les changements préexistants toujours non committés sont `.env.example`,
  `.github/workflows/ci.yml`, la partie antérieure de `README.md`, les modifications
  antérieures de `src/components/workspaces/workspace-management.tsx` et de
  `vite.config.ts`. L’aperçu attendu est
  `reforme-budget.budgetapp-epz.pages.dev`, sans modifier la production.

## État actuel

- Jalon historique en cours : M9 (historique, finitions et robustesse).
- Dernier jalon historique validé : M8 (2026-10-24).
- Prochaine action historique : poursuivre M9 ; le test de conflit réel M6 entre
  appareils reste également à faire.
- Réforme budget : R0–R4 terminés et validés ; R5 en cours.

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

| Lot | Statut                                                                                                 | Date       |
| --- | ------------------------------------------------------------------------------------------------------ | ---------- |
| R0  | Validé — cahier v1.2, guide UI, état des lieux et propositions R1                                      | 2026-10-24 |
| R1  | Implémentation terminée ; validations automatisées et pgTAP distant réussis (29/29) ; Laro a validé R2 | 2026-10-25 |
| R2  | Validé par Laro ; validations automatisées OK ; essai mobile/hors ligne écarté à sa demande            | 2026-10-25 |
| R3  | Validé par Laro ; implémentation terminée ; pgTAP distant réussi (4/4)                                 | 2026-10-25 |
| R4  | Validé par Laro après aperçu local ; 66 tests, lint, typecheck, build et format check OK               | 2026-10-25 |
| R5  | Validé par Laro ; migration, interface et tests SQL terminés (33/33)                                   | 2026-10-25 |
| R6  | Validé par Laro ; implémentation et contrôles terminés                                                 | 2026-10-25 |

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
- Décisions P8 et P9 confirmées. P11 est retirée et remplacée : Supabase et Dexie
  contiennent seulement des données de test et peuvent être vidés ; ne pas convertir
  les soldes, archiver les transferts, créer des reports historiques ni migrer l’ancienne
  outbox. Après la première utilisation réelle avec données à garder, toute migration
  devra être conservatrice.
- Décision confirmée par Laro : budget global mensuel manuel et unique par espace/mois,
  sans catégorie ; les seuils par catégorie sont indépendants.

### Tâches R1

| Tâche                               | État                                                   | Détail                                                                                                            |
| ----------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Contrats TypeScript/Zod             | Terminée, commitée et vérifiée                         | Montants sûrs, budgets globaux/catégorie, reports et nouveaux types de transaction                                |
| Calculs purs et tests unitaires     | Terminée, commitée et vérifiée                         | Dépenses nettes, budget, reports et limites ; anciens calculs par comptes retirés                                 |
| Migration Supabase et tests RLS     | Corrigés ; migration distante appliquée ; pgTAP réussi | `de32a7c`; 29/29 assertions, zéro échec ; politique propriétaire appliquée et intégrée à la migration locale      |
| Schéma local Dexie et remise à zéro | Terminée, commitée                                     | v2→v4 vide les données de test/outbox, retire `accounts` et ajoute les tables R1 ; 9 tests ciblés réussis         |
| Repositories et bootstrap           | Terminée, commitée ; tests ciblés réussis              | Import/purge des budgets mensuels et décisions de report ; repositories R1 sans comptes                           |
| Synchronisation                     | Terminée, commitée ; 14 tests ciblés réussis           | Push/pull catégories, transactions, budgets de catégorie, budgets mensuels et décisions de report                 |
| Écran transactions minimum          | Terminée, commitée (`823b636`)                         | Dépenses, remboursements, revenus et ajustements ; comptes/transferts retirés ; parcours complet conservé pour R4 |
| Validation R1                       | Réussie                                                | `npm test` : 56 ; lint, typecheck, build, format check : OK ; pgTAP distant : 29/29, zéro échec                   |

### Tâches R2

| Tâche                                  | État                    | Détail                                                                                                                         |
| -------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Aligner la réforme et partager le mois | Terminée                | Contradiction corrigée ; état partagé, URL `?mois=YYYY-MM`, filtrage de l’historique et date d’ajout liés au mois sélectionné. |
| Enveloppe globale et seuils            | Terminée                | Enveloppe manuelle distincte, reprise explicite du montant précédent, seuils indépendants et états à 80/100 %.                 |
| Solde et décisions de report           | Terminée                | Solde et résumé mensuel affichés ; report proposé selon les règles et décisions réservées au propriétaire.                     |
| États et validations R2                | Terminé ; automatisé OK | 58 tests, lint, typecheck, build et format check OK ; essai téléphone/hors ligne explicitement écarté par Laro.                |

### Tâches R3

| Tâche                                      | État                    | Détail                                                                                                                                                                                                                   |
| ------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| En-tête compact et état de synchronisation | Terminée et vérifiée    | Sélecteur d’espace mobile ; statut seulement si nécessaire ; avatar et déconnexion regroupés ; salutation retirée. Commit `b039624`.                                                                                     |
| Navigation mobile et grand écran           | Terminée                | Barre mobile 5 places ; barre latérale groupée avec Forfaits désactivé jusqu’à R5, membres et réglages sous Espace ; Plus regroupe les outils. Commit `b039624`.                                                         |
| Menu avatar et page Mon profil             | Terminée                | Le menu sépare Mon profil et Réglages de l’application ; la page profil affiche identité, e-mail et rôle actif. Commit `da2e431`.                                                                                        |
| Réglages de l’application                  | Terminée                | Thème système/clair/sombre local, langue française, lien de modification du mot de passe et À propos ; état de sync séparé. Commit `5108755`.                                                                            |
| Réglages de l’espace                       | Terminée                | Renommage pour le propriétaire ; archivage soft des espaces partagés, uniquement si un autre espace actif existe ; RLS existante demeure la protection serveur. Commit `0e56945`.                                        |
| Photo de profil                            | Implémentée et vérifiée | P7 confirmé : bucket privé, téléversement WebP, suppression, URLs signées et avatars de membres ; `npm test` (63), lint, typecheck, format check et build OK. Commit `918982b` ; migration distante appliquée et testée. |
| Validation R3                              | Terminée                | Vérifications applicatives automatisées OK ; pgTAP distant : 4/4 assertions, zéro échec ; essai téléphone écarté par Laro.                                                                                               |

### Tâches R4

| Tâche                                            | État                 | Détail                                                                                                                            |
| ------------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Formulaire complet et attribution du responsable | Terminée et vérifiée | Responsable distinct de l’auteur en espace partagé ; catégories facultatives pour dépenses/remboursements, requises pour revenus. |
| Filtres de l’historique et attribution visible   | Terminée et vérifiée | Filtres Dépenses/Revenus/Tout ; remboursement avec dépenses ; ajustement seulement dans Tout ; responsable séparé de l’auteur.    |
| Vérification des agrégats R4                     | Terminée et vérifiée | 13 tests de calcul passent ; dépenses/remboursements sans catégorie comptés une fois ; revenus et ajustements exclus du budget.   |
| Validation R4                                    | Terminée             | 66 tests, lint, typecheck, format check, diff check et build OK ; avertissement bundle 791 kB ; essai mobile écarté.              |

### Tâches R5

| Tâche                                             | État     | Détail                                                                                                                        |
| ------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Modèle, Dexie, bootstrap et synchronisation       | Terminé  | Récurrence en lecture seule, références nullables, migration Dexie v5 conservatrice ; 68 tests et contrôles complets réussis. |
| Migration Supabase, RLS et génération idempotente | Terminée | Correctif timestamps appliqué au projet jetable après accord explicite ; pgTAP 33/33 réussis, 0 échec, transaction annulée.   |
| Écran Forfaits et parcours                        | Terminé  | Lecture hors ligne ; création/édition/arrêt ; génération au changement de mois ; tests automatisés réussis.                   |
| Validation R5                                     | Terminée | R5 validé implicitement par « ok, reprends alors » ; pgTAP 33/33 et vérifications applicatives réussis.                       |

### Tâches R6

| Tâche                                  | État     | Détail                                                                                                |
| -------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| Agrégations et tests unitaires         | Terminé  | Quatre séries et indicateurs purs ; 5 tests ciblés, typecheck et format vérifiés.                     |
| Volet Analyses accessible et paresseux | Terminé  | Quatre graphiques SVG, valeurs consultables en texte ; code séparé dans un chunk chargé à la demande. |
| Validation R6                          | Terminée | Validée par Laro le 2026-10-25 ; 77 tests, lint, typecheck, format, build et diff check OK.           |

## Décisions prises

- 2026-10-24 : nom officiel de l'application : cashFlow+.
- 2026-10-25 : Laro a confirmé que le projet Supabase affiché « Production » est jetable
  et a autorisé la suppression de ses données ainsi que l’application des migrations R1
  et R3 ; ces migrations ont été appliquées, ne pas les rejouer.
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

- Avant chaque commit : `npm run format`, puis `npm run lint`, `npm run typecheck`, `npm run test` et `npm run format:check`. La CI lance les mêmes contrôles et refuse le commit sinon.

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
