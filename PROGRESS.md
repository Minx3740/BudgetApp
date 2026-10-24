# PROGRESS

## Reprise

- Dernière mise à jour : 2026-10-25 00:44 (UTC+03:00).
- Branche : `reforme-budget` (ne pas travailler ni pousser sur `main`).
- Lot/tâche en cours : R3 — navigation, compte et réglages. R2 est validé par Laro ;
  l’essai sur smartphone/hors ligne est explicitement écarté à sa demande.
- Terminé et vérifié : l’enveloppe globale manuelle est indépendante des seuils ; accueil
  et Budgets affichent budget, dépenses nettes et solde ; les décisions de report sont
  réservées au propriétaire ; le mois partagé persiste dans `?mois=YYYY-MM` et filtre
  l’historique. Format `Ar`, états seuil à 80/100 %, et remboursements pris en compte.
  Validation complète : 58 tests, lint, typecheck, build et format check réussis ;
  `prettier --check` ciblé et `git diff --check` confirmés le 2026-10-24.
- Fait mais non vérifié à l’exécution : aucun essai manuel téléphone/hors ligne (non
  souhaité par Laro). L’outil navigateur précédent n’a pas démarré, car Chromium
  Playwright manque localement ; aucune installation n’a été lancée.
- Terminé et vérifié en R3 : en-tête compact avec sélecteur d’espace mobile, indicateur de
  synchronisation uniquement lorsqu’il est utile, menu avatar et déconnexion regroupée ;
  salutation et actions rapides redondantes retirées ; barre mobile à cinq emplacements
  avec « + » central et onglet Plus ; accès distinct à une page Mon profil en lecture.
  Réglages application : thème système/clair/sombre persisté localement, français, lien
  de réinitialisation du mot de passe et À propos. `npm test` (58), lint, typecheck,
  format check et build passent. En R3, l’écran Réglages de l’espace permet le renommage et
  l’archivage soft d’un espace partagé ; l’archivage exige un autre espace actif.
  Validations du changement courant : 60 tests, lint, typecheck, format check et build OK.
  Aucune vérification visuelle responsive ne peut être revendiquée ; essai téléphone écarté
  à la demande de Laro. Les actions de renommage/archivage utilisent les politiques RLS
  existantes ; aucun test SQL ni accès Supabase distant n’a été effectué.
- Prochaine action exacte : demander à Laro de trancher P7 pour la photo de profil
  (bucket public à chemin non devinable ou URLs signées) avant toute création de bucket,
  politique ou téléversement.
- Fait mais non vérifié à l’exécution : migration Supabase/RLS et pgTAP (`de32a7c`).
  Tests SQL indisponibles : `supabase`, `psql`, `postgres`, Docker et Podman absents.
  Aucune migration distante n’a été appliquée. Build réussi avec avertissement Vite sur
  un bundle JavaScript dépassant 500 kB.
- Vérifications finales R1 : `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `npm run format:check` et tests SQL pgTAP. Aucun test ne doit
  appliquer de migration au projet Supabase distant.
- Décisions confirmées : P8 (montants entiers sûrs validés avec Zod) ; P9 (noms selon
  les conventions du dépôt) ; aucune ancienne version n’a été déployée ; supprimer les
  données Supabase et locales de test est autorisé ; aucun ajustement de solde initial,
  aucune archive de transfert, aucune décision de report historique, aucune migration
  de l’ancienne outbox ; première utilisation réelle : toutes les migrations devront
  préserver les données conservables. Pour l’écran, réponse au formulaire antérieur
  prioritaire : adaptation minimale en R1, parcours complet en R4.
- Questions encore ouvertes : essai manuel mobile/hors ligne puis en ligne à faire sur le
  téléphone de Laro ; tests pgTAP R1 à exécuter lorsqu’un environnement PostgreSQL local
  sera disponible. Aucune question métier R2 ouverte.
- Pièges connus : préserver les autres changements préexistants du worktree ; la
  migration Supabase distante ne doit jamais être exécutée sans accord explicite ;
  workflow Cloudflare `deploy-pages.yml` doit se déclencher uniquement sur `main` ;
  vérifié : son déclencheur push ne cible que `main`. Aucun push n’a été effectué.

## État actuel

- Jalon historique en cours : M9 (historique, finitions et robustesse).
- Dernier jalon historique validé : M8 (2026-10-24).
- Prochaine action historique : poursuivre M9 ; le test de conflit réel M6 entre
  appareils reste également à faire.
- Réforme budget : R0 et R1 terminés ; R2 approuvé et en cours.

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

| Lot | Statut                                                                                                                  | Date       |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ---------- |
| R0  | Validé — cahier v1.2, guide UI, état des lieux et propositions R1                                                       | 2026-10-24 |
| R1  | Implémentation terminée ; validations disponibles réussies ; pgTAP non exécuté faute d’outils locaux ; Laro a validé R2 | 2026-10-24 |
| R2  | Validé par Laro ; validations automatisées OK ; essai mobile/hors ligne écarté à sa demande                             | 2026-10-25 |
| R3  | En cours — navigation et réglages implémentés ; photo de profil et validation finale en attente de P7                   | 2026-10-25 |
| R4  | À faire — transactions, remboursements, ajustements et responsable                                                      |            |
| R5  | À faire — forfaits                                                                                                      |            |
| R6  | À faire — analyses                                                                                                      |            |

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

| Tâche                               | État                                                 | Détail                                                                                                            |
| ----------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Contrats TypeScript/Zod             | Terminée, commitée et vérifiée                       | Montants sûrs, budgets globaux/catégorie, reports et nouveaux types de transaction                                |
| Calculs purs et tests unitaires     | Terminée, commitée et vérifiée                       | Dépenses nettes, budget, reports et limites ; anciens calculs par comptes retirés                                 |
| Migration Supabase et tests RLS     | Code simplifié et commité ; non validé à l’exécution | `de32a7c`; pgTAP réécrit ; outil PostgreSQL local absent, aucun accès distant autorisé                            |
| Schéma local Dexie et remise à zéro | Terminée, commitée                                   | v2→v4 vide les données de test/outbox, retire `accounts` et ajoute les tables R1 ; 9 tests ciblés réussis         |
| Repositories et bootstrap           | Terminée, commitée ; tests ciblés réussis            | Import/purge des budgets mensuels et décisions de report ; repositories R1 sans comptes                           |
| Synchronisation                     | Terminée, commitée ; 14 tests ciblés réussis         | Push/pull catégories, transactions, budgets de catégorie, budgets mensuels et décisions de report                 |
| Écran transactions minimum          | Terminée, commitée (`823b636`)                       | Dépenses, remboursements, revenus et ajustements ; comptes/transferts retirés ; parcours complet conservé pour R4 |
| Validation R1                       | Réussie sauf SQL non exécuté                         | `npm test` : 56 ; lint, typecheck, build, format check : OK ; pgTAP bloqué par l’absence d’outils locaux          |

### Tâches R2

| Tâche                                  | État                    | Détail                                                                                                                         |
| -------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Aligner la réforme et partager le mois | Terminée                | Contradiction corrigée ; état partagé, URL `?mois=YYYY-MM`, filtrage de l’historique et date d’ajout liés au mois sélectionné. |
| Enveloppe globale et seuils            | Terminée                | Enveloppe manuelle distincte, reprise explicite du montant précédent, seuils indépendants et états à 80/100 %.                 |
| Solde et décisions de report           | Terminée                | Solde et résumé mensuel affichés ; report proposé selon les règles et décisions réservées au propriétaire.                     |
| États et validations R2                | Terminé ; automatisé OK | 58 tests, lint, typecheck, build et format check OK ; essai téléphone/hors ligne explicitement écarté par Laro.                |

### Tâches R3

| Tâche                                      | État                 | Détail                                                                                                                                                             |
| ------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| En-tête compact et état de synchronisation | Terminée et vérifiée | Sélecteur d’espace mobile ; statut seulement si nécessaire ; avatar et déconnexion regroupés ; salutation retirée.                                                 |
| Navigation mobile et grand écran           | Terminée             | Barre mobile 5 places ; barre latérale groupée avec Forfaits désactivé jusqu’à R5, membres et réglages sous Espace ; Plus regroupe les outils.                     |
| Menu avatar et page Mon profil             | Terminée             | Le menu sépare Mon profil et Réglages de l’application ; la page profil affiche identité, e-mail et rôle actif.                                                    |
| Réglages de l’application                  | Terminée             | Thème système/clair/sombre local, langue française, lien de modification du mot de passe et À propos ; état de sync séparé.                                        |
| Réglages de l’espace                       | Terminée             | Renommage pour le propriétaire ; archivage soft des espaces partagés, uniquement si un autre espace actif existe ; RLS existante demeure la protection serveur.    |
| Photo de profil                            | Bloquée              | Décision P7 requise : bucket public à chemin non devinable ou URLs signées.                                                                                        |
| Validation R3                              | En cours             | 60 tests, lint, typecheck, format check et build OK ; UI non vérifiée visuellement ; tests SQL/directs à exécuter avec un environnement Supabase local disponible. |

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
