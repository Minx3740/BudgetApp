# Cahier des charges — Application de gestion de budget (nom provisoire : `[NOM_APP]`)

Version 1.1 (19 octobre 2026). Document de référence à coller au début de CHAQUE conversation avec l'IA, avec `PROGRESS.md`.

Changements par rapport à la 1.0 : décisions techniques tranchées (Vite + React à la place de Next.js), section 0 réécrite pour un travail en chat (et non avec un agent qui lit le dépôt), TypeScript fixé en 6.0.x, M0 adapté, annexe B réécrite.

---

## 0. Règles de travail en session (mode chat)

Le développeur travaille seul, avec une IA en conversation. L'IA ne voit ni le dépôt ni le terminal : tout passe par ce que le développeur colle dans le chat. Ces règles évitent les erreurs et les dérives.

1. **Début de session** : le développeur colle ce document et `PROGRESS.md`. L'IA résume en 3 lignes où on en est avant de continuer.
2. **Un jalon à la fois** (section 11), et une étape à la fois dans le jalon. L'IA ne passe au suivant qu'après « jalon N validé » ou la confirmation de l'étape.
3. **Format d'une étape** : (a) ce qu'on fait et pourquoi, (b) où : chemin exact du fichier ou dossier et commande exacte, (c) comment vérifier. Les fichiers viennent après l'explication, jamais avant.
4. **Fichiers complets** : l'IA fournit des fichiers entiers avec leur chemin, jamais des extraits avec « le reste inchangé ». Si elle n'a pas vu le fichier existant, elle le demande avant de proposer un remplacement.
5. **Erreurs** : le développeur colle le message complet (pas une paraphrase), avec la commande lancée. L'IA identifie la cause avant de proposer un correctif, et évite `--force` et `--legacy-peer-deps`.
6. **Décisions verrouillées** (section 3) : l'IA ne les change pas d'elle-même. Si elle pense qu'une décision est mauvaise, elle l'écrit avec ses arguments et attend la réponse.
7. **Pas d'invention** : les API des bibliothèques changent. En cas de doute sur une fonction, une option ou une version, l'IA dit « je ne suis pas sûr » et indique où vérifier (documentation officielle de la version installée).
8. **Pas de dépendance ajoutée sans justification** : nom, rôle, alternative écartée.
9. **Sécurité** : aucune clé secrète dans le dépôt ni côté client. La clé `service_role` de Supabase n'est JAMAIS utilisée dans le navigateur. Toute donnée est protégée par la RLS côté base, pas seulement par du code applicatif.
10. **Fin de jalon** : l'IA fournit (a) la liste des fichiers livrés, (b) les commandes de vérification (lint, typecheck, tests, scénario manuel), (c) le `PROGRESS.md` complet mis à jour, que le développeur enregistre, (d) la liste de ce qui n'est PAS fait.
11. **Ambiguïté** : l'IA pose UNE question précise plutôt que de deviner.
12. **Hors périmètre** : tout ce qui est en section 5 est interdit en v1, même si c'est « facile à ajouter ».
13. **Conversations longues** : une conversation par jalon, avec ce document et `PROGRESS.md` en tête. Le jalon M6 peut demander plusieurs conversations.

Environnement du développeur : Windows 10, PowerShell, VS Code, Git, Node 22.14, npm.

---

## 1. Contexte et objectif

Application de gestion de budget permettant, dans une même application :

- un **budget personnel** (créé automatiquement) ;
- des **budgets partagés** (colocation, famille, projet) rejoints **par invitation** ;
- une saisie des dépenses **très rapide**, qui **fonctionne hors-ligne** et se synchronise ensuite.

Promesse utilisateur : _« Savoir en un coup d'œil combien il me reste à dépenser ce mois-ci. »_

## 2. Utilisateurs et contexte d'usage

- Usage **privé** : quelques utilisateurs (pas de grand public en v1).
- Appareils : **téléphones Android** (Chrome), usage secondaire sur ordinateur.
- Connectivité **instable** (Madagascar) : le hors-ligne est une exigence centrale, pas un bonus.
- Langue de l'interface : **français** (structure prête pour d'autres langues, sans les implémenter).
- Devise par défaut : **Ariary (MGA)**, sans décimales en pratique.

## 3. Décisions techniques

| #   | Décision                                                                                                                                                                                        | Statut                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| D1  | Application **web installable (PWA)**, mobile-first, responsive                                                                                                                                 | Verrouillée                |
| D2  | **Offline-first** : l'interface lit et écrit toujours dans la base locale ; le réseau n'est qu'une synchronisation en arrière-plan                                                              | Verrouillée                |
| D3  | Front : **Vite + React + TypeScript strict** (SPA). Pas de rendu serveur : l'app est pilotée par la base locale                                                                                 | Verrouillée (19/10/2026)   |
| D4  | UI : **Tailwind CSS 4** (plugin Vite) + **shadcn/ui** (ajouté en M3)                                                                                                                            | Validée                    |
| D5  | Backend : **Supabase** (Postgres + Auth + RLS). À vérifier avant M1 : limites du plan gratuit, notamment la mise en pause des projets inactifs                                                  | Validée, à vérifier        |
| D6  | Stockage local : **IndexedDB via Dexie**                                                                                                                                                        | Validée                    |
| D7  | PWA / service worker : **vite-plugin-pwa** (Workbox)                                                                                                                                            | Validée                    |
| D8  | Validation des données : **Zod** (même schéma côté client et serveur)                                                                                                                           | Validée                    |
| D9  | Tests : **Vitest** (unitaire), **Playwright** (e2e, y compris mode hors-ligne), tests SQL pour la RLS avec `supabase test db` (pgTAP)                                                           | Validée                    |
| D10 | Montants : **entiers** (jamais de flottants). Solde = **calculé** à partir des transactions, jamais stocké                                                                                      | Verrouillée                |
| D11 | Identifiants : **UUID générés côté client** (permet la création hors-ligne et l'idempotence)                                                                                                    | Verrouillée                |
| D12 | Suppression : **soft delete** (`deleted_at`) pour que la synchronisation puisse propager les suppressions                                                                                       | Verrouillée                |
| D13 | Conflits de synchronisation : **dernière écriture gagne, au niveau de la ligne**, selon l'horodatage serveur ; une **suppression l'emporte** sur une modification                               | Verrouillée                |
| D14 | TypeScript fixé à **~6.0.3** dans `package.json`, car `typescript-eslint` 8.71.2 n'accepte que les versions inférieures à 6.1.0. À réexaminer quand `typescript-eslint` supportera TypeScript 7 | Verrouillée (dette connue) |
| D15 | Authentification : **email + mot de passe uniquement** en v1 (pas de Google)                                                                                                                    | Verrouillée                |
| D16 | Moteur de synchronisation **écrit à la main** (pas de PowerSync ou équivalent), le modèle étant simple (lignes indépendantes, dernière écriture gagne)                                          | Validée                    |

Options TypeScript strictes activées (M0) : `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noImplicitOverride`. `exactOptionalPropertyTypes` est volontairement désactivé (il casse régulièrement les bibliothèques).

## 4. Fonctionnalités v1 et critères d'acceptation

**F-01 Authentification**

- Inscription/connexion par email + mot de passe.
- La première connexion nécessite le réseau ; ensuite l'app s'ouvre **hors-ligne** avec la session en cache.
- Critère : après connexion, mode avion + fermeture/réouverture de l'app → l'app s'ouvre et affiche les données locales.

**F-02 Espace personnel automatique**

- À l'inscription, un espace « Perso » est créé (avec comptes et catégories par défaut).
- Critère : un nouvel utilisateur peut saisir une dépense moins de 30 secondes après l'inscription.

**F-03 Espaces partagés**

- Créer un espace partagé ; le créateur en est propriétaire.
- Rôles : `owner` (tout, gère les membres), `member` (lit/écrit les données), `viewer` (lecture seule).
- Critère : un `viewer` ne peut ni créer ni modifier (vérifié par un test RLS, pas seulement par l'UI).

**F-04 Invitations**

- Le propriétaire génère un lien/code : rôle choisi, expiration (défaut 7 jours), usage unique par défaut, révocable.
- Le jeton est aléatoire (32 octets minimum), **stocké haché** côté base.
- L'acceptation se fait via une fonction serveur atomique (RPC) ; elle nécessite d'être en ligne.
- Critère : un jeton expiré, révoqué ou déjà utilisé est refusé avec un message clair.

**F-05 Comptes/portefeuilles**

- Créer/modifier/archiver (espèces, mobile money, banque…). Solde calculé.

**F-06 Catégories**

- Dépense ou revenu ; nom, icône, couleur ; modifiables ; archivage plutôt que suppression si utilisée.

**F-07 Transactions**

- Types : dépense, revenu, transfert entre comptes.
- Saisie : montant, catégorie, compte, date (défaut aujourd'hui), note optionnelle.
- Critère : saisie d'une dépense en moins de 5 secondes et 4 interactions maximum depuis l'écran d'accueil ; fonctionne hors-ligne ; visible immédiatement.
- Modification et suppression (soft delete). Dans un espace partagé, l'auteur est enregistré et affiché.

**F-08 Budgets mensuels**

- Un plafond par catégorie et par mois.
- Affichage : dépensé, restant, barre de progression, dépassement signalé visuellement.

**F-09 Écran d'accueil**

- Montre, pour l'espace actif et le mois en cours : **reste à dépenser** (budget total − dépensé), reste par jour, dernières transactions, catégories les plus consommées.
- Sélecteur d'espace toujours accessible.

**F-10 Historique**

- Liste des transactions avec filtres (période, catégorie, compte, membre) et recherche texte ; défilement fluide sur plusieurs milliers de lignes (virtualisation si nécessaire).

**F-11 Synchronisation et état réseau**

- Indicateur discret : « Synchronisé » / « n modifications en attente » / « Hors-ligne ».
- Synchronisation au retour du réseau, à l'ouverture de l'app, au retour au premier plan, et périodiquement.
- Ne jamais perdre une écriture locale : si la synchro échoue, l'opération reste dans la file d'attente et sera retentée.

**F-12 Installation PWA**

- Installable (manifest, icônes, `display: standalone`), démarrage instantané grâce à l'app shell en cache.

## 5. Hors périmètre v1 (interdit sans accord explicite)

Import/lecture de SMS mobile money · connexion bancaire automatique · dépenses récurrentes · alertes/notifications push · objectifs d'épargne · export CSV · pièces jointes/photos de reçus · répartition « qui doit combien » · multi-devises · statistiques avancées · mode sombre (prévoir les variables CSS pour l'ajouter, ne pas l'implémenter) · connexion Google · monétisation.

## 6. Modèle de données (Postgres)

Toutes les tables métier ont : `id uuid` (généré par le client), `created_at`, `updated_at` (posé par un **trigger serveur**), `deleted_at` nullable. Les noms ci-dessous sont indicatifs ; le schéma exact est livré et validé au jalon M1.

- `profiles` (id = id Supabase Auth, display_name)
- `workspaces` (name, type `personal|shared`, currency défaut `MGA`, owner_id)
- `memberships` (workspace_id, user_id, role) — clé primaire (workspace_id, user_id)
- `invitations` (workspace_id, token_hash, role, expires_at, max_uses, used_count, revoked_at, created_by)
- `accounts` (workspace_id, name, type, initial_balance, archived_at)
- `categories` (workspace_id, name, kind, icon, color, archived_at)
- `transactions` (workspace_id, account_id, to_account_id nullable, category_id nullable pour les transferts, kind `expense|income|transfer`, amount bigint > 0, occurred_on date, note, created_by)
- `budgets` (workspace_id, category_id, month = premier jour du mois, limit_amount) — unicité (workspace_id, category_id, month)

Contraintes à imposer en base : montants strictement positifs, cohérence workspace entre une transaction et son compte/catégorie, un transfert exige `to_account_id` différent du compte source.

## 7. Sécurité (RLS)

- RLS activée sur **toutes** les tables ; aucune table sans politique.
- Fonction utilitaire du type `is_member(workspace_id)` / `has_role(workspace_id, role)` ; les politiques en dépendent.
- `viewer` : lecture seule. `member` : lecture + écriture des données de l'espace. `owner` : en plus, gestion des membres et invitations.
- Un utilisateur ne voit que les espaces dont il est membre.
- L'acceptation d'invitation passe par une fonction `SECURITY DEFINER` qui vérifie jeton, expiration, révocation, quota et insère le membership dans une transaction.
- **Tests RLS obligatoires** (utilisateur A ne lit pas l'espace de B ; viewer ne peut pas écrire ; membre retiré perd l'accès).
- Données locales : IndexedDB n'est pas chiffrée. Risque connu (téléphone perdu) ; verrouillage de l'app prévu hors v1. À la déconnexion, la base locale est vidée.
- `.env` n'est jamais versionné ; `.env.example` ne contient aucune valeur secrète.

## 8. Architecture offline-first et synchronisation

**Principe** : l'UI ne parle qu'à la base locale (Dexie). Un moteur de synchronisation distinct fait le lien avec Supabase.

- **Import initial** : après connexion en ligne, un service dédié lit une copie paginée des espaces accessibles et de leurs données, puis l'insère dans Dexie sans outbox. Les écrans métier ne lisent et n'écrivent que dans Dexie ; l'import initial ne remplace pas le moteur de synchronisation M6. Une première utilisation hors-ligne sans espace local affiche une erreur explicite et propose de réessayer au retour du réseau.
- **Écriture** : l'action écrit dans la table locale ET ajoute une entrée dans une **file d'attente (`outbox`)** : `op_id` (uuid), table, type (`upsert`/`delete`), payload, `created_at`, tentatives, statut.
- **Push** : le moteur envoie les opérations dans l'ordre. Elles sont **idempotentes** (upsert par UUID) : rejouer une opération ne duplique rien. Une opération n'est retirée de la file qu'après confirmation du serveur.
- **Pull** : le moteur demande, par table, les lignes dont `updated_at` est supérieur au dernier curseur connu, avec un **léger chevauchement** (ex. 60 s) pour éviter de rater des lignes commitées dans le désordre ; la fusion étant idempotente, le chevauchement est sans danger.
- **Conflits** : voir D13. L'horodatage serveur fait foi (pas l'horloge du téléphone).
- **Perte d'accès** : si le serveur répond « interdit » pour un espace (membre retiré), l'espace local est purgé.
- **Auth hors-ligne** : la session est conservée ; le rafraîchissement du jeton se fait au retour du réseau. L'expiration du jeton ne doit jamais bloquer la consultation/saisie locale.
- **Limite connue** : l'API Background Sync n'est pas fiable partout ; ne pas s'y appuyer. Synchroniser à l'ouverture, au retour du réseau (`online`), au retour au premier plan (`visibilitychange`) et périodiquement.
- **Calculs** (soldes, restant du budget) : faits **localement** à partir des données locales ; ils peuvent être temporairement en retard sur un autre appareil, ce que l'indicateur de synchro rend explicite.

## 9. Exigences UX/UI (« une vraie app, pas un site »)

- Mobile-first ; barre de navigation **en bas** (Accueil, Transactions, Budgets, Espaces) ; bouton d'action principal « + ».
- Saisie de montant avec **pavé numérique natif** (`inputmode="numeric"`) ; ajout de transaction dans un panneau (bottom sheet, composant Drawer de shadcn/ui), jamais une page complète.
- **Mises à jour optimistes** et **squelettes de chargement** ; aucun spinner bloquant ; aucun rechargement de page.
- Cibles tactiles ≥ 48 px ; gestion des zones sûres (encoche, barre de gestes) ; retour arrière cohérent avec le geste Android.
- Animations à 60 fps : uniquement `transform` et `opacity`, durée courte ; respecter `prefers-reduced-motion`.
- États vides soignés, messages d'erreur humains, formatage des montants (`1 250 000 Ar`) et des dates en français.
- Responsive : sur grand écran, la barre du bas devient une navigation latérale.
- Accessibilité de base : contrastes AA, libellés sur les champs, focus visible.

## 10. Exigences non fonctionnelles

- Ouverture à froid de l'app installée < 2 s sur téléphone milieu de gamme (cible, à mesurer).
- Ajout d'une transaction : retour visuel < 100 ms.
- Lighthouse : PWA installable ; Performance ≥ 90 en mobile (cible).
- TypeScript `strict` (avec les options de la section 3), ESLint, Prettier ; pas de `any` sans commentaire justifié.
- Aucune donnée sensible dans les logs. Variables d'environnement documentées dans `.env.example`.

---

## 11. Plan d'étapes (jalons)

Chaque jalon a : **livrables**, **critère de validation**, **interdits**. L'IA s'arrête à la fin du jalon et attend « jalon N validé ».

**M0 — Cadrage et dépôt**

- Livrables : projet Vite + React + TypeScript strict + Tailwind 4 + ESLint/Prettier + Vitest (un test minimal temporaire), scripts `lint`, `typecheck`, `test`, `format`, `format:check`, `README.md`, `PROGRESS.md`, `.env.example`, `.gitignore` qui ignore `.env`, ce cahier des charges dans `docs/`, dépôt GitHub privé, CI simple (lint + typecheck + tests).
- Validation : `npm run lint`, `typecheck`, `test`, `format:check` et `build` passent ; l'app démarre ; la CI est au vert sur GitHub.
- Interdit : toute fonctionnalité, Supabase, shadcn/ui.

**M1 — Base de données et sécurité (AVANT toute interface)**

- Prérequis : compte Supabase créé, limites du plan gratuit vérifiées.
- Livrables : migrations SQL du schéma (section 6), triggers `updated_at`, fonctions `is_member`/`has_role`, politiques RLS, fonction RPC d'acceptation d'invitation, **tests SQL des politiques**.
- Validation : tous les tests RLS passent (A ne voit pas B ; viewer en lecture seule ; invitation expirée/révoquée refusée). Le développeur relit le schéma.
- Interdit : UI.

**M2 — Authentification et espace personnel**

- Livrables : inscription/connexion/déconnexion, création automatique du profil + espace « Perso » + comptes/catégories par défaut (trigger ou RPC), garde de routes.
- Validation : un nouvel utilisateur arrive sur un espace prêt à l'emploi.

**M3 — Coquille d'application (app shell) et PWA**

- Livrables : installation de shadcn/ui, layout mobile-first, barre de navigation basse, thème (variables CSS), manifest, icônes, service worker pour l'app shell (vite-plugin-pwa), page « hors-ligne » de secours.
- Validation : installable sur Android ; l'app shell s'ouvre en mode avion ; Lighthouse PWA OK.

**M4 — Couche de données locale**

- Livrables : schéma Dexie miroir du serveur + table `outbox`, « repositories » typés (create/update/softDelete/list) qui écrivent local + outbox, hooks de lecture réactifs (liveQuery), tests unitaires (le test temporaire de M0 est supprimé).
- Validation : tests unitaires ; l'UI ne contient AUCUN appel direct à Supabase pour les données métier.
- Interdit : moteur de synchro.

**M5 — Comptes, catégories, transactions (100 % local)**

- Livrables : écrans et formulaires F-05, F-06, F-07, panneau de saisie rapide, calcul local des soldes.
- Validation : critère de saisie < 5 s ; tout fonctionne en mode avion.

**M6 — Moteur de synchronisation**

- Livrables : push de l'outbox (idempotent, ordonné, avec reprise), pull par curseur avec chevauchement, gestion des erreurs (réseau, 401, 403, conflit), indicateur de synchro (F-11), tests d'intégration.
- Validation : scénarios obligatoires — (1) saisie hors-ligne puis retour du réseau ; (2) coupure au milieu d'un push, sans doublon ni perte ; (3) deux appareils modifient la même ligne (règle D13) ; (4) suppression propagée ; (5) retrait d'un membre → purge locale.
- C'est le jalon le plus risqué : prévoir du temps et ne pas le bâcler.

**M7 — Budgets et écran d'accueil**

- Livrables : F-08 et F-09, calculs locaux testés (cas limites : changement de mois, catégorie sans budget, dépassement).
- Validation : le « reste à dépenser » est exact sur un jeu de données de test.

**M8 — Espaces partagés, invitations, rôles**

- Livrables : création d'espace partagé, sélecteur d'espace, génération/révocation d'invitation, page d'acceptation, gestion des membres et rôles, affichage de l'auteur.
- Validation : scénario complet à deux comptes (A invite B, B saisit, A voit la dépense) y compris avec B hors-ligne pendant la saisie.

**M9 — Historique, finitions, robustesse**

- Livrables : F-10 (filtres, recherche, virtualisation), états vides, erreurs, accessibilité de base, polissage des animations.
- Validation : fluidité sur 5 000 transactions de test.

**M10 — Qualité et mise en bêta privée**

- Livrables : tests e2e Playwright (dont hors-ligne), revue de sécurité (RLS, secrets, CORS, en-têtes), mesure de performance, déploiement (hébergement statique), procédure de sauvegarde de la base, guide d'installation pour les testeurs.
- Validation : checklist de la section 12 entièrement cochée.

---

## 12. Définition de « terminé » pour la v1

- [ ] Toutes les fonctionnalités F-01 à F-12 respectent leurs critères.
- [ ] Les scénarios hors-ligne de M6 et M8 passent en automatique.
- [ ] Aucune table sans RLS ; tests RLS au vert.
- [ ] Aucune clé secrète côté client ni dans l'historique du dépôt.
- [ ] Installable sur Android, fonctionnel en mode avion après première connexion.
- [ ] `PROGRESS.md` à jour, `README.md` permet à un tiers de lancer le projet.

---

## Annexe A — Modèle de `PROGRESS.md`

```mark

```
