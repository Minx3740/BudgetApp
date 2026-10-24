# Réforme du budget de cashFlow+

Version 1.0, rédigée le 24 octobre 2026. À ranger dans `docs\reforme-budget-global.md`.

## 0. À lire d'abord

Ce document décrit une réforme complète du budget de l'application cashFlow+ (dépôt `budget-app`). Il s'adresse à l'IA qui développe l'application avec Laro, en conversation. Il complète le cahier des charges `docs\cahier-des-charges.md` (v1.1) et le remplace sur tous les points qu'il traite. En cas de contradiction, ce document gagne.

### 0.1 Méthode de travail (inchangée)

- Une étape à la fois. Ne pas passer à la suivante sans la validation de Laro.
- Pour chaque étape : 1. expliquer ce qu'on fait et pourquoi ; 2. dire où cela va (chemin Windows depuis la racine du dépôt) ; 3. fournir les fichiers complets, pas des extraits ; 4. donner la commande de vérification et le résultat attendu.
- Ne jamais supposer le contenu d'un fichier existant. Demander à Laro de le coller avant de le modifier. Ce qui n'est pas connu est marqué **[à vérifier dans le dépôt]**.
- Réponses denses et directes. Laro est en L3 d'informatique et n'a pas étudié la gestion financière : expliquer une notion financière en une ou deux phrases la première fois qu'elle apparaît.
- Distinguer ce qui est décidé (sections 1 à 12) de ce qui est proposé (section 15). Faire confirmer chaque proposition avant le lot concerné.

### 0.2 Documents à mettre à jour

La réforme change le périmètre fonctionnel, donc le cahier des charges doit être modifié. C'est l'objet du lot R0. À la fin de chaque lot, mettre à jour ce qui a changé :

- `docs\cahier-des-charges.md` : passer en v1.2. Sections concernées : fonctionnalités du budget et des transactions, écrans et navigation, droits, hors-ligne, section 6 (modèle de données), tests.
- `PROGRESS.md` : ajouter les lots R0 à R6 et leur état. Les jalons M0 à M9 existent déjà, d'où le préfixe R.
- `README.md` : seulement si une commande ou une variable change.
- `docs\guide-ui.md` : créé en R0, contient les jetons de design et les règles d'interface.

### 0.3 Environnement

Windows 10, Node v22.14.0, projet dans `C:\Users\Laro\dev\budget-app`. Vite, React, TypeScript strict (`~6.0.3`), Tailwind 4, shadcn/ui, Supabase (plan gratuit, région Europe), Dexie, Zod, Vitest, Playwright, vite-plugin-pwa. Fins de ligne LF, Prettier et ESLint : la CI GitHub Actions doit rester verte. Déploiement sur Cloudflare Pages. La connexion internet de Laro est limitée : installer un paquet à la fois, aucune dépendance inutile. Les utilisateurs cibles sont sur Android.

## 1. Pourquoi cette réforme

Situation actuelle :

- Il n'y a pas de budget global indépendant. Le « budget total » est la somme des plafonds définis par catégorie.
- Toutes les dépenses du mois sont soustraites de cette somme, y compris celles des catégories sans plafond. Le résultat est déroutant.
- La carte « Solde total » indique « Argent disponible sur mes comptes » alors que l'application n'a pas de comptes.
- Les mots « plafond » et « plafonner » sont utilisés dans l'interface.

Après la réforme :

- Un budget du mois fixé à la main, indépendant des catégories.
- Des seuils par catégorie, qui sont de simples repères.
- Un solde réel (l'argent possédé), distinct du reste du budget.
- Un historique des revenus, des forfaits (dépenses fixes), des statistiques en barres et en courbes.
- Un compte utilisateur avec photo, et deux niveaux de réglages (application, espace).
- Une interface réorganisée : en-tête avec espace et avatar, sélecteur de mois, navigation par fréquence d'usage.

## 2. Vocabulaire

| Terme                | Définition                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Espace               | Ensemble de données (catégories, transactions, budgets, forfaits) qui appartient à un propriétaire et peut avoir des membres invités. L'espace « Perso » n'a qu'un membre. |
| Propriétaire, membre | Le propriétaire a tous les droits sur l'espace. Un membre invité a des droits limités (section 6).                                                                         |
| Mois                 | Clé texte `YYYY-MM`, déduite de la date locale de la transaction.                                                                                                          |
| Budget du mois       | Montant que l'utilisateur s'autorise à dépenser dans le mois. Fixé à la main, par espace et par mois. C'est une décision, pas de l'argent possédé.                         |
| Dépenses nettes      | Somme des dépenses du mois moins les remboursements du mois.                                                                                                               |
| Reste du budget      | Budget du mois moins dépenses nettes. Affiché en barre de progression.                                                                                                     |
| Solde                | L'argent réellement possédé : report + revenus + ajustements - dépenses nettes. Chiffre principal de l'accueil.                                                            |
| Report               | Montant positif du solde du mois précédent, ajouté au solde si l'utilisateur l'a accepté.                                                                                  |
| Déficit              | Solde négatif d'un mois. Affiché en rouge, jamais reporté.                                                                                                                 |
| Seuil                | Montant mensuel de repère pour une catégorie. Remplace le mot « plafond ».                                                                                                 |
| Forfait              | Dépense fixe qui revient chaque mois (abonnement, forfait internet).                                                                                                       |
| Responsable          | Le membre qui a réellement payé (`paid_by`). Différent de l'auteur de la saisie (`created_by`).                                                                            |
| Ajustement           | Correction signée du solde, pour aligner le solde calculé sur l'argent réel.                                                                                               |
| Ar                   | Unité affichée à l'utilisateur. Le code ISO MGA reste interne.                                                                                                             |

## 3. Types de transactions et règles de calcul

### 3.1 Types

| Type         | Montant stocké               | Effet                                                                                                                                          |
| ------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `expense`    | entier > 0                   | Ajoute aux dépenses nettes. Catégorie facultative.                                                                                             |
| `refund`     | entier > 0                   | Retire des dépenses nettes (remboursement reçu, achat annulé). Catégorie facultative.                                                          |
| `income`     | entier > 0                   | Ajoute aux revenus.                                                                                                                            |
| `adjustment` | entier signé, différent de 0 | Modifie le solde uniquement. Pas de catégorie. N'entre ni dans les dépenses, ni dans les revenus, ni dans le budget, ni dans les statistiques. |

Il n'y a pas de comptes dans l'application, donc pas de transfert entre comptes. Argent envoyé à quelqu'un : `expense`. Virement entre deux espaces (par exemple de Perso vers un espace partagé) : saisir une `expense` dans l'un et un `income` dans l'autre. Aucune liaison automatique en v1.

### 3.2 Formules

```
depenses_nettes(M) = somme(expense de M) - somme(refund de M)
revenus(M)         = somme(income de M)
ajustements(M)     = somme(adjustment de M)      (signé)

reste_budget(M)    = budget(M) - depenses_nettes(M)     (seulement si budget(M) existe)
solde(M)           = report(M) + revenus(M) + ajustements(M) - depenses_nettes(M)
report(M)          = decision(M) == oui ? max(0, solde(M-1)) : 0
usage_seuil(c, M)  = (expense de c dans M - refund de c dans M) / seuil(c, M)
```

### 3.3 Règles

- **B1.** Une transaction supprimée (suppression logique) ne compte nulle part.
- **B2.** Le mois d'une transaction est `YYYY-MM` de son champ `date`, une date locale sans fuseau. Interdit de le déduire d'un horodatage UTC : une dépense du 31 octobre à 23h30 à Antananarivo (UTC+3) reste en octobre.
- **B3.** Budget absent et budget à 0 sont deux états différents. Absent : pas de ligne en base, l'interface affiche l'invitation à le créer. À 0 : le budget existe et vaut 0.
- **B4.** Toute dépense du mois réduit le reste du budget exactement une fois, qu'elle ait une catégorie ou non, que la catégorie ait un seuil ou non. Le calcul part de l'ensemble des transactions du mois, jamais d'une somme par catégorie, pour exclure tout double comptage.
- **B5.** Le reste du budget peut être négatif. Ne pas le borner à 0.
- **B6.** Les revenus n'agissent ni sur le budget ni sur le reste du budget.
- **B7.** Aucune valeur dérivée (reste, solde, pourcentages, statistiques) n'est stockée. Tout est calculé côté client à partir des données locales (Dexie), donc disponible hors ligne.
- **B8.** Montants entiers en ariary, aucune décimale, aucun flottant. En base : `bigint`. En TypeScript : `number` entier, validé par Zod (`z.number().int().safe()`).
- **B9.** Le calcul vit dans des fonctions pures, sans accès à la base ni à l'interface, dans le dossier de la fonctionnalité budget (par exemple `src\features\budget\calc.ts`), pour être testées seules.

## 4. Report du solde

- **C1.** Le report est décidé par le propriétaire, mois par mois. Seule la décision (oui ou non) est stockée, jamais le montant. Le montant reporté est recalculé : `max(0, solde(M-1))`.
- **C2.** À l'affichage d'un mois M, proposer le report quand les quatre conditions sont réunies : aucune décision n'existe pour M ; le mois M-1 contient au moins une transaction ; `solde(M-1) > 0` ; l'utilisateur est propriétaire. Un membre voit l'information sans les boutons.
- **C3.** La proposition est une carte sur l'accueil, avec deux boutons (« Reporter » et « Ne pas reporter »). Pas de fenêtre bloquante.
- **C4.** Tant qu'il n'y a pas de décision, le report vaut 0.
- **C5.** Un solde négatif n'est jamais reporté. Il reste dans son mois, affiché en rouge avec le libellé « Déficit ». Le mois suivant repart de 0 avant ses propres revenus et dépenses.
- **C6.** Chaîne : le solde de M-1 contient son propre report s'il a été accepté. Calculer de proche en proche vers l'arrière, en s'arrêtant à la première décision « non » ou absente. Borne de sécurité : 120 mois.
- **C7.** Corriger une dépense d'un ancien mois change les soldes des mois suivants quand la chaîne de reports est acceptée. C'est voulu.
- **C8.** Premier mois d'un espace : pas de report. Un solde de départ s'entre par un revenu (libellé « Solde initial ») ou par un ajustement positif.

## 5. Seuils par catégorie

- **S1.** Remplacer « plafond » par « seuil » dans toute l'interface et dans les nouveaux identifiants de code (`threshold`). En base, renommer seulement si la migration est simple et sûre, sinon garder le nom actuel et le documenter. **[à vérifier dans le dépôt]**
- **S2.** Le seuil est un montant mensuel ≥ 0 attaché à une catégorie. Le modèle actuel des plafonds mensuels est conservé. **[à vérifier dans le dépôt]**
- **S3.** Aucun lien avec le budget du mois. La somme des seuils peut être inférieure, égale ou supérieure au budget. Aucune validation croisée, aucun message d'erreur à ce sujet.
- **S4.** Trois états, chacun avec une couleur et un libellé : normal (moins de 80 %), alerte (de 80 % à 100 %), dépassé (plus de 100 %). Le 80 % est une constante du code.
- **S5.** Catégorie sans seuil : pas de barre. Ses dépenses comptent dans le budget comme toutes les autres.
- **S6.** Dépense sans catégorie : comptée dans le budget, regroupée sous « Non classé » dans les statistiques.

## 6. Espaces partagés : droits et responsable

### 6.1 Matrice des droits

| Action                                                   | Propriétaire   | Membre invité                                        |
| -------------------------------------------------------- | -------------- | ---------------------------------------------------- |
| Lire toutes les données de l'espace                      | oui            | oui                                                  |
| Ajouter une transaction                                  | oui            | oui                                                  |
| Modifier ou supprimer une transaction                    | toutes         | seulement celles dont il est l'auteur (`created_by`) |
| Changer le responsable (`paid_by`)                       | toutes         | seulement ses transactions                           |
| Budget du mois, seuils, catégories                       | oui            | lecture seule                                        |
| Forfaits : créer, modifier, arrêter                      | oui            | lecture seule                                        |
| Décision de report                                       | oui            | lecture seule                                        |
| Invitations, retrait de membres, suppression de l'espace | oui            | non                                                  |
| Quitter l'espace                                         | non applicable | oui                                                  |
| Déclencher la génération des forfaits (fonction serveur) | oui            | oui                                                  |

### 6.2 Règles

- **D1.** Ces droits sont appliqués par les politiques RLS de Supabase. Cacher un bouton dans l'interface ne suffit pas : toute règle doit aussi être refusée côté base.
- **D2.** Chaque transaction a deux champs : `created_by` (auteur de la saisie, automatique, jamais modifiable, sert aux droits) et `paid_by` (responsable, par défaut égal à `created_by`, modifiable, doit être membre de l'espace).
- **D3.** Une transaction générée par un forfait a `created_by` et `paid_by` égaux au créateur du forfait.
- **D4.** L'espace « Perso » suit les mêmes règles : son seul membre est le propriétaire.

## 7. Forfaits

- **F1.** Un forfait appartient à un espace. Seul le propriétaire le crée, le modifie ou l'arrête.
- **F2.** Champs : libellé, montant (entier > 0), catégorie facultative, jour du mois (1 à 28), mois de début obligatoire, mois de fin facultatif.
- **F3.** Chaque mois couvert par un forfait devient une vraie transaction `expense`, avec `recurring_id` et `recurring_month`. Elle compte comme toute dépense. Dans les statistiques, une transaction avec `recurring_id` est « fixe », les autres sont « variables ».
- **F4.** Génération par une fonction SQL `generate_recurring_for_month(space_id, month)` : `SECURITY DEFINER`, idempotente (insertion avec `ON CONFLICT DO NOTHING` sur `(recurring_id, recurring_month)`), qui vérifie que l'appelant est membre de l'espace. Tout membre peut l'appeler, à l'ouverture d'un mois. Elle génère aussi les mois manquants depuis le début du forfait jusqu'au mois courant, et jamais un mois futur.
- **F5.** Hors ligne, les transactions de forfait d'un nouveau mois apparaissent après la première synchronisation en ligne de ce mois. C'est accepté.
- **F6.** Modifier un forfait propose deux actions :
  - « Ce mois seulement » : modifier la transaction générée de ce mois. C'est une modification ordinaire de transaction. Le forfait reste intact.
  - « Ce mois et les suivants » : fixer le mois de fin du forfait actuel à M-1, créer un nouveau forfait qui commence en M avec les nouvelles valeurs, avec le même `series_id`. Les mois passés ne changent pas.
- **F7.** Si l'utilisateur supprime la transaction d'un forfait pour un mois, elle n'est jamais régénérée. Utiliser la suppression logique déjà employée par la synchronisation (la ligne reste, la contrainte d'unicité empêche la régénération) **[à vérifier dans le dépôt]** ; à défaut, une table `recurring_skips(recurring_id, recurring_month)`.
- **F8.** Supprimer un forfait revient à l'arrêter : les transactions passées sont conservées, plus rien n'est généré ensuite.
- **F9.** Créer ou modifier un forfait exige d'être en ligne. La lecture reste possible hors ligne.
- **F10.** Contrôle de version : colonne `version`. Une modification est acceptée seulement si la version envoyée est celle de la base, sinon message « Ce forfait a été modifié, recharge la page ».
- **F11.** Créer un forfait dont le début est dans le passé : afficher d'abord le nombre de transactions qui vont être créées, puis demander confirmation.

## 8. Modèle de données

Les noms ci-dessous sont des propositions cohérentes avec le reste du dépôt. Vérifier les conventions existantes (casse, nom des clés, colonnes d'horodatage) avant d'écrire les migrations. **[à vérifier dans le dépôt]**

### 8.1 `monthly_budgets` (nouvelle)

| Colonne      | Type et contraintes                                                 |
| ------------ | ------------------------------------------------------------------- |
| `id`         | uuid, clé primaire                                                  |
| `space_id`   | uuid, clé étrangère vers l'espace                                   |
| `month`      | text, format `YYYY-MM` (contrainte CHECK avec expression régulière) |
| `amount`     | bigint, ≥ 0                                                         |
| `updated_at` | timestamptz, posé par le serveur                                    |
| `updated_by` | uuid, utilisateur                                                   |

Unicité sur `(space_id, month)`.

### 8.2 `month_carry_decisions` (nouvelle)

Colonnes : `id`, `space_id`, `month`, `accepted` (boolean), `decided_by`, `decided_at` (serveur). Unicité sur `(space_id, month)`.

### 8.3 `recurring_expenses` (nouvelle)

Colonnes : `id`, `series_id`, `space_id`, `label`, `amount` (bigint > 0), `category_id` (nullable), `day_of_month` (smallint, 1 à 28), `start_month`, `end_month` (nullable), `created_by`, `version` (integer, départ à 1), `created_at`, `updated_at`.

### 8.4 `transactions` (modifiée)

- Ajouter ou normaliser : `type` (text, CHECK dans `expense`, `refund`, `income`, `adjustment`), `amount` (bigint, CHECK : > 0 sauf pour `adjustment`, où ≠ 0), `date` (type `date`), `category_id` (nullable), `created_by`, `paid_by`, `recurring_id` (nullable), `recurring_month` (nullable).
- Contrainte d'unicité partielle sur `(recurring_id, recurring_month)` quand `recurring_id` n'est pas nul.
- `adjustment` : `category_id` obligatoirement nul.
- Les colonnes actuelles ne sont pas connues du rédacteur de ce document (la section 6 du cahier v1.1 ne détaille pas `transactions`). **[à vérifier dans le dépôt]**

### 8.5 Profils

Ajouter `avatar_path` (text, nullable) et un nom d'affichage si absent. **[à vérifier dans le dépôt]**

### 8.6 Dexie

Pour la coupure R1, les données présentes dans Dexie sont des données de test :
réinitialiser les tables de données concernées et l'ancienne file de synchronisation.
Aucune conversion des soldes initiaux, aucun archivage de transfert, aucune décision
de report historique et aucune migration des anciennes opérations en attente.

Dès la première utilisation réelle avec des données à conserver, toute évolution du
schéma local doit préserver les données et l'outbox, ou faire l'objet d'une décision
explicite et documentée. Le schéma R1 comprend les tables `monthlyBudgets`,
`carryDecisions` et `recurringExpenses`, ainsi que les index utiles aux
`transactions` (`occurred_on`, `kind`, `category_id`, `recurring_id`). La file R1
inclut les mutations de budget mensuel et de décision de report.

### 8.7 Règles SQL générales

Migrations versionnées dans le dépôt (dossier existant), RLS activée sur chaque nouvelle table, contraintes CHECK pour tout ce qui peut l'être, une migration par sujet.

## 9. Hors ligne et synchronisation

- **H1.** Toutes les données nouvelles sont lues depuis Dexie. L'écran ne dépend jamais directement du réseau.
- **H2.** Budget du mois et décision de report : écriture locale immédiate, puis envoi par la file de synchronisation. Conflit : la dernière écriture gagne, selon l'horodatage posé par le serveur. L'horloge du téléphone n'arbitre jamais un conflit.
- **H3.** Afficher un indicateur de synchronisation discret dans l'en-tête quand des éléments sont en attente, et marquer ces éléments dans les listes.
- **H4.** Les droits (section 6) valent aussi pour les écritures qui arrivent par la synchronisation : un refus du serveur doit remonter à l'utilisateur et retirer la modification locale.

## 10. Interface

### 10.1 Principes

- Organiser par fréquence d'usage. Plusieurs fois par jour : ajouter une transaction, voir le solde, à un geste. Quelques fois par mois : budget, revenus, statistiques. Rarement : forfaits, catégories, membres, réglages, rangés dans « Plus ».
- Une seule action principale par écran. Aucun doublon (logo, sélecteur d'espace, bouton « Ajouter »).
- Chaque écran définit ses états : chargement, vide, erreur, hors ligne.
- Avant de coder un écran, rédiger sa fiche (but, action principale, contenu dans l'ordre, états) et la faire valider par Laro.

### 10.2 En-tête (toutes tailles d'écran)

- Gauche : puce de l'espace actif (`Perso ▾`). Un appui ouvre un panneau pour changer d'espace.
- Droite : avatar de l'utilisateur (photo, sinon initiales), et l'indicateur de synchronisation quand il y a quelque chose en attente.
- Pas de salutation. Le nom de l'application n'apparaît que dans la barre latérale sur grand écran.

### 10.3 Menu de l'avatar

En tête : photo, nom, e-mail. Puis : Mon profil, Réglages de l'application, Se déconnecter. Les réglages de l'espace n'y figurent pas.

### 10.4 Sélecteur de mois

Flèches précédent et suivant avec le libellé « Octobre 2026 ». Un seul état partagé par tous les écrans, aussi reflété dans l'adresse (`?mois=2026-10`) pour que le rechargement garde le mois. Budget, solde, listes et statistiques dépendent de ce mois.

### 10.5 Navigation

- **Mobile** (barre du bas, cinq emplacements) : Accueil, Transactions, « + » au centre (ouvre le panneau d'ajout, pas une page), Budgets, Plus.
- **Grand écran** (barre latérale) : Accueil, Transactions, Budgets, Forfaits. Puis une section « Espace » : Catégories, Membres. L'avatar se trouve dans l'en-tête, plus en bas de la barre latérale.
- **Budgets** a deux volets : « Mois » (enveloppe et seuils) et « Analyses ».
- **Plus** (mobile) : Forfaits, Catégories, Membres et invitations, Réglages de l'espace.

### 10.6 Écrans

**Accueil**, dans cet ordre :

1. Solde, en grand, avec une pastille de l'espace (Perso, ou rôle dans un espace partagé). Déficit en rouge s'il y en a un.
2. Budget du mois : barre de progression, « Reste X Ar sur Y Ar ». Sans budget : invitation à le créer.
3. Carte de report (seulement si les conditions de C2 sont réunies).
4. Ce mois : revenus et dépenses côte à côte.
5. Les trois dernières transactions.
6. Les trois catégories les plus consommées, avec un lien vers Analyses.

**Transactions** : liste du mois, avec un sélecteur « Dépenses / Revenus / Tout ». L'historique des revenus est ce filtre, pas un écran séparé. Filtres par catégorie et par responsable dans un espace partagé.

**Budgets, volet Mois** : deux sections distinctes, « Enveloppe globale du mois » (montant, modifier ; action explicite « Reprendre le montant du mois précédent ») et « Seuils par catégorie » (liste avec barre d'usage et état).

**Budgets, volet Analyses** : voir section 11.

**Réglages de l'application** (menu avatar) : profil et photo, mot de passe, thème (clair, sombre, système), langue (français seulement en v1), à propos.

**Réglages de l'espace** (Plus) : catégories, forfaits, membres et invitations, renommer ou supprimer l'espace. Réservé au propriétaire, sauf la lecture.

Les deux réglages portent des noms différents et sont rangés à des endroits différents.

### 10.7 Ajout d'une transaction

Panneau du bas (composant Drawer de shadcn). Ordre des champs : montant avec grand pavé numérique, type (dépense par défaut), catégorie en puces, date (aujourd'hui par défaut). Derrière « Plus d'options » : responsable, note. Après l'enregistrement, un message avec « Annuler ».

### 10.8 États et textes

- Pendant le chargement, afficher des squelettes. Supprimer le bandeau « Chargement initial des données depuis ton espace… » tant qu'il cohabite avec des états vides : un écran vide pendant le chargement laisse croire que les données ont disparu.
- Un état vide propose de créer (« Ajoute ta première transaction »), il ne renvoie pas vers une liste vide.
- Supprimer les textes techniques (« calculées sur cet appareil »).
- Remplacer « MGA » par « Ar ». Format : `800 000 Ar`, avec espace insécable entre les milliers. Une seule fonction de formatage pour toute l'application.
- Remplacer « Argent disponible sur mes comptes » par « Argent disponible ». Remplacer « Reste à dépenser » par « Budget de [mois] ».
- Le solde négatif utilise le libellé « Déficit » en plus de la couleur rouge.

### 10.9 Accessibilité et mobile

- Zones tactiles d'au moins 44 px, texte des onglets d'au moins 11 px.
- Marge basse tenant compte de la zone de sécurité Android (`viewport-fit=cover` et `env(safe-area-inset-bottom)`), pour que la dernière carte ne soit pas masquée par la barre du bas.
- Aucune information portée par la couleur seule.
- Respecter `prefers-reduced-motion`. Transitions de 150 à 250 ms.

### 10.10 Système de design

Créer `docs\guide-ui.md` : une couleur d'accent (le vert actuel), échelle d'espacement en multiples de 4, rayons, une police, deux graisses, mode sombre par variables CSS, composants shadcn réutilisés. Aucun style improvisé page par page.

## 11. Statistiques (niveau 1)

Barres et courbes uniquement, pas de camemberts. Composant Chart de shadcn/ui (basé sur Recharts), chargé à la demande sur le volet Analyses seulement. Chaque graphique affiche aussi ses valeurs en texte (info-bulle ou liste).

Graphiques :

1. **Où va l'argent ?** Barres horizontales par catégorie, triées de la plus grande à la plus petite, avec un repère à la position du seuil.
2. **Mieux ou pire que le mois dernier ?** Barres groupées par catégorie, mois affiché contre mois précédent.
3. **Suis-je dans le budget ?** Courbe des dépenses nettes cumulées jour par jour, avec une ligne horizontale pour le budget du mois.
4. **Sur la durée.** Barres revenus et dépenses sur les 6 derniers mois.

Indicateurs en chiffres : part des dépenses fixes (forfaits) et variables, part « Non classé », seuils en alerte ou dépassés. Dans un espace partagé, barres des dépenses par responsable (`paid_by`).

Les projections (« à ce rythme, fin de mois non atteinte ») sont hors périmètre de cette réforme (section 16).

## 12. Photo de profil

- Redimensionner dans le navigateur avant l'envoi : 256 × 256, WebP, quelques dizaines de ko.
- Stockage : bucket Supabase Storage `avatars`, fichier `{user_id}/avatar.webp`. Écriture : un utilisateur ne peut écrire que dans son propre dossier. Lecture : voir la proposition P7.
- Le changement de photo exige d'être en ligne. Hors ligne ou sans photo : initiales.
- Les membres d'un même espace voient les photos des autres (affichage du responsable).

## 13. Lots

Chaque lot est validé par Laro avant le suivant. À la fin de chaque lot : tests au vert, CI verte, `PROGRESS.md` et cahier des charges à jour.

### R0. Documents et état des lieux

- [x] Inspecter les migrations SQL, règles RLS, modèles Zod, Dexie, repositories,
      bootstrap, synchronisation, calculs et écrans concernés.
- [x] Conserver ce document à la racine du dépôt.
- [x] Mettre à jour `docs/cahier-des-charges.md` en v1.2.
- [x] Créer `docs/guide-ui.md` et suivre les lots R0 à R6 dans `PROGRESS.md`.
- [x] Faire valider le cahier v1.2 et le guide UI.
- [x] Confirmer P8 (montants entiers sûrs validés avec Zod) et P9 (conventions de
      nommage existantes).
- Validation : documents contrôlés et propositions nécessaires à R1 confirmées le
  2026-10-24.
- Décision R1 : aucune version antérieure n’ayant été déployée, aucun pont de
  compatibilité n’est requis. Les données Supabase et Dexie actuelles sont des données
  de test supprimables ; la migration R1 ne convertit pas les soldes initiaux,
  n’archive pas les transferts, ne crée pas de reports historiques et ne migre pas
  l’ancienne outbox. La migration distante nécessite l’accord explicite de Laro.
  Après le début de l’utilisation réelle avec des données à conserver, toute migration
  doit être conservatrice.

### R1. Données et calculs

- [ ] Simplifier la migration Supabase/RLS selon la coupure destructive des données de
      test ; ne pas convertir les soldes initiaux, archiver les transferts ni créer de
      reports historiques. Ajouter les tests SQL correspondants.
- [ ] Réinitialiser les données locales R1 et l’ancienne outbox dans Dexie ; ajouter
      les nouvelles tables et index, sans migration des opérations en attente.
- [ ] Adapter repositories, bootstrap et synchronisation aux nouvelles tables et
      supprimer les chemins des comptes/transferts.
- [ ] Adapter minimalement l’écran Transactions en retirant les contrôles et données
      liés aux comptes/transferts ; garder le parcours complet pour R4.
- [ ] Fonctions pures de calcul (B9) et tests unitaires.
- [ ] Remplacer l'ancien calcul du « budget total » et connecter les nouveaux calculs.
- [ ] Exécuter tests unitaires, tests SQL, lint, typecheck, build et format ; mettre à
      jour `PROGRESS.md`.
- Validation : aucun écran R1 n'utilise la somme des seuils comme budget ; aucun
  compte/transfert n'est requis pour saisir et consulter une dépense/revenu. Aucune
  migration Supabase distante sans accord explicite de Laro.

### R2. Budget, solde et seuils à l'écran

- [ ] Sélecteur de mois partagé.
- [ ] Accueil : solde, barre du budget, carte de report, « Ce mois ».
- [ ] Budgets, volet Mois : enveloppe globale et seuils.
- [ ] Renommer « plafond » en « seuil », corriger tous les textes de 10.8, format `Ar`.
- [ ] États de chargement, vide, erreur, hors ligne.
- Validation : parcours complet à la main sur téléphone, hors ligne puis en ligne.

### R3. Navigation, compte et réglages

- [ ] En-tête (puce d'espace, avatar, indicateur de synchronisation), suppression de la salutation et des doublons.
- [ ] Barre du bas, barre latérale, onglet Plus.
- [ ] Menu de l'avatar, Mon profil, Réglages de l'application, Réglages de l'espace.
- [ ] Photo de profil (section 12).
- [ ] Interface conforme à la matrice des droits (boutons absents ou désactivés pour un membre).
- Validation : navigation testée sur téléphone, un membre invité ne peut rien modifier qu'il n'a pas le droit de modifier, y compris par requête directe.

### R4. Revenus, remboursements, ajustements, responsable

- [ ] Panneau d'ajout complet (types, responsable).
- [ ] Filtre Dépenses / Revenus / Tout, historique des revenus.
- [ ] Remboursement et ajustement de solde.
- Validation : chaque type modifie les chiffres comme décrit en 3.1.

### R5. Forfaits

- [ ] Migration `recurring_expenses`, fonction `generate_recurring_for_month`, RLS.
- [ ] Écran Forfaits : création, modification (deux actions), arrêt, contrôle de version.
- [ ] Génération à l'ouverture d'un mois, suppression d'occurrence mémorisée.
- Validation : tests de génération (section 14) verts ; deux appareils ne créent jamais de doublon.

### R6. Analyses

- [ ] Volet Analyses, quatre graphiques et indicateurs de la section 11.
- [ ] Chargement à la demande du composant de graphiques.
- Validation : chiffres des graphiques identiques à ceux des listes ; poids du premier chargement non alourdi.

## 14. Tests

### 14.1 Unitaires (Vitest, fonctions pures)

1. Dépense dans une catégorie avec seuil : réduit le reste du budget et augmente l'usage du seuil, une seule fois.
2. Dépense dans une catégorie sans seuil : réduit le reste du budget seulement.
3. Dépense sans catégorie : réduit le reste du budget seulement.
4. Revenu : aucun effet sur le reste du budget, augmente le solde.
5. Remboursement : réduit les dépenses nettes et l'usage du seuil de sa catégorie.
6. Ajustement positif et négatif : solde seulement.
7. Budget absent et budget à 0 : deux états distincts.
8. Somme des seuils supérieure au budget : aucun effet sur le calcul du reste.
9. Frontière de mois : 31 à 23h30 (UTC+3) compté dans le bon mois ; le 1er du mois suivant dans le suivant.
10. Transaction supprimée ignorée ; modification d'un montant répercutée.
11. Report : oui, non, solde négatif, chaîne de trois mois, mois précédent sans transaction, décision absente.
12. Statistiques : tri des catégories, part fixe et variable, part « Non classé ».

### 14.2 Base de données (tests SQL ou d'intégration)

13. Un membre ne peut écrire ni `monthly_budgets`, ni `month_carry_decisions`, ni `recurring_expenses`. Le propriétaire le peut. Un non-membre ne lit rien.
14. Un membre ne modifie que ses propres transactions.
15. `generate_recurring_for_month` appelée deux fois crée une seule ligne par forfait et par mois ; ne crée pas de mois futur ; refuse un non-membre ; ne régénère pas une occurrence supprimée.
16. Une modification de forfait avec une mauvaise version est refusée.

### 14.3 De bout en bout (Playwright)

17. Hors ligne : définir le budget du mois, recharger, la valeur est là ; elle est synchronisée au retour du réseau.
18. Ajouter une dépense depuis l'accueil sur écran de téléphone : le solde et le reste du budget changent.
19. Changer de mois puis de page : le mois affiché est conservé.

## 15. Propositions à confirmer par Laro

Ces choix sont proposés par le rédacteur de ce document et n'ont pas encore été validés. Les présenter à Laro avant le lot indiqué.

| N°  | Proposition                                                                                                                           | Lot |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | --- |
| P1  | Jour du mois d'un forfait limité à 1 à 28                                                                                             | R5  |
| P2  | « Le mois précédent existe » veut dire : il contient au moins une transaction                                                         | R2  |
| P3  | Seuil d'alerte fixé à 80 %, non configurable                                                                                          | R2  |
| P4  | La génération rattrape les mois manqués jusqu'au mois courant, jamais de mois futur                                                   | R5  |
| P5  | Création et modification des forfaits seulement en ligne                                                                              | R5  |
| P6  | Décision de report réservée au propriétaire                                                                                           | R2  |
| P7  | Bucket `avatars` en lecture publique, chemins non devinables (compromis : pas strictement privé) ; sinon liens signés, plus complexes | R3  |
| P8  | Montants en `number` entier côté TypeScript, validé par Zod                                                                           | R1  |
| P9  | Noms des nouvelles tables et colonnes tels qu'écrits en section 8, adaptés aux conventions du dépôt                                   | R1  |
| P10 | Analyses comme volet de Budgets, pas comme onglet séparé                                                                              | R3  |

## 16. Hors périmètre (v2 ou plus tard)

- Export CSV des données.
- Projections de fin de mois, date d'épuisement du budget, détection d'anomalies.
- Report d'un solde négatif, report du reste du budget (« rollover »).
- Comptes multiples (Mvola, espèces) et transferts entre comptes.
- Notifications et rappels.
- Forfaits créés ou modifiés hors ligne.
- Liens signés pour les photos de profil.
- Seuil d'alerte configurable.
- Lien avec les SMS de mobile money (exclu par Laro pour l'instant).
