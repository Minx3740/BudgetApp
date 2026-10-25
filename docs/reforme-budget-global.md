# Réforme du budget de cashFlow+

Version 1.0, rédigée le 24 octobre 2026.

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

Le modèle A définit le budget mensuel comme de l'argent disponible pour le mois,
indépendamment des seuils. Le disponible inclut le report accepté, le budget, les revenus
et ajustements, puis soustrait les dépenses nettes. Il remplace l'ancienne distinction
entre solde réel et reste du budget.

La réforme conserve les seuils par catégorie comme de simples repères, l'historique des
revenus, les forfaits, les analyses, les espaces partagés et une interface mobile-first.

## 2. Vocabulaire

| Terme                | Définition                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Espace               | Ensemble de données (catégories, transactions, budgets, forfaits) qui appartient à un propriétaire et peut avoir des membres invités. L'espace « Perso » n'a qu'un membre. |
| Propriétaire, membre | Le propriétaire a tous les droits sur l'espace. Un membre invité a des droits limités (section 6).                                                                         |
| Mois                 | Clé texte `YYYY-MM`, déduite de la date locale de la transaction.                                                                                                          |
| Budget du mois       | Montant d'argent dont l'utilisateur dispose pour le mois. Fixé à la main, par espace et par mois ; il s'ajoute au report accepté, aux revenus et aux ajustements.          |
| Dépenses nettes      | Somme des dépenses du mois moins les remboursements du mois.                                                                                                               |
| Ressources           | Report accepté + budget du mois (0 s'il n'est pas défini) + revenus + ajustements.                                                                                         |
| Disponible           | Ressources du mois moins dépenses nettes. Chiffre principal de l'accueil ; peut être négatif.                                                                              |
| Report               | Partie positive du disponible du mois précédent, ajoutée aux ressources si l'utilisateur l'a acceptée.                                                                     |
| Déficit              | Disponible négatif. Affiché en rouge, jamais reporté.                                                                                                                      |
| Seuil                | Montant mensuel de repère pour une catégorie. Remplace le mot « plafond ».                                                                                                 |
| Forfait              | Dépense fixe qui revient chaque mois (abonnement, forfait internet).                                                                                                       |
| Responsable          | Le membre qui a réellement payé (`paid_by`). Différent de l'auteur de la saisie (`created_by`).                                                                            |
| Ajustement           | Correction signée ajoutée aux ressources pour rapprocher le disponible de la situation observée.                                                                           |
| Ar                   | Unité affichée à l'utilisateur. Le code ISO MGA reste interne.                                                                                                             |

## 3. Types de transactions et règles de calcul

### 3.1 Types

| Type         | Montant stocké               | Effet                                                                                                                                     |
| ------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `expense`    | entier > 0                   | Ajoute aux dépenses nettes. Catégorie facultative.                                                                                        |
| `refund`     | entier > 0                   | Retire des dépenses nettes (remboursement reçu, achat annulé). Catégorie facultative.                                                     |
| `income`     | entier > 0                   | Ajoute aux ressources du mois et augmente le disponible.                                                                                  |
| `adjustment` | entier signé, différent de 0 | Ajoute aux ressources du mois et modifie le disponible uniquement. Pas de catégorie ni d'effet sur les dépenses, revenus ou statistiques. |

Il n'y a pas de comptes dans l'application, donc pas de transfert entre comptes. Argent envoyé à quelqu'un : `expense`. Virement entre deux espaces (par exemple de Perso vers un espace partagé) : saisir une `expense` dans l'un et un `income` dans l'autre. Aucune liaison automatique en v1.

### 3.2 Formules

```
depenses_nettes(M) = somme(expense de M) - somme(refund de M)
revenus(M)         = somme(income de M)
ajustements(M)     = somme(adjustment de M)      (signé)

ressources(M)      = report(M) + budget(M) + revenus(M) + ajustements(M)
disponible(M)      = ressources(M) - depenses_nettes(M)
budget(M)          = 0 si le budget mensuel n'est pas défini
report(M)          = decision(M) == oui ? max(0, disponible(M-1)) : 0
usage_seuil(c, M)  = (expense de c dans M - refund de c dans M) / seuil(c, M)
```

La valeur du budget absent est 0 dans les calculs, mais l'interface le distingue d'un
budget défini à 0 et invite toujours à le créer. La barre d'usage montre
`depenses_nettes(M) / ressources(M)` ; elle n'est pas affichée si `ressources(M) <= 0`.

### 3.3 Règles

- **B1.** Une transaction supprimée (suppression logique) ne compte nulle part.
- **B2.** Le mois d'une transaction est `YYYY-MM` de son champ `date`, une date locale sans fuseau. Interdit de le déduire d'un horodatage UTC : une dépense du 31 octobre à 23h30 à Antananarivo (UTC+3) reste en octobre.
- **B3.** Budget absent et budget à 0 sont deux états différents. Absent : pas de ligne en base, l'interface affiche l'invitation à le créer. À 0 : le budget existe et vaut 0.
- **B4.** Toute dépense nette réduit le disponible exactement une fois, qu'elle ait une catégorie ou non, que la catégorie ait un seuil ou non. Le calcul part de l'ensemble des transactions du mois, jamais d'une somme par catégorie, pour exclure tout double comptage.
- **B5.** Le disponible peut être négatif. Il s'affiche en rouge avec « Déficit » et n'est jamais borné à 0.
- **B6.** Les revenus s'ajoutent aux ressources et augmentent le disponible ; ils ne modifient pas le budget saisi. Les remboursements diminuent les dépenses nettes ; les ajustements signés s'ajoutent aux ressources.
- **B7.** Aucune valeur dérivée (ressources, disponible, pourcentages, statistiques) n'est stockée. Tout est calculé côté client à partir des données locales (Dexie), donc disponible hors ligne.
- **B8.** Montants entiers en ariary, aucune décimale, aucun flottant. En base : `bigint`. En TypeScript : `number` entier, validé par Zod (`z.number().int().safe()`).
- **B9.** Le calcul vit dans des fonctions pures, sans accès à la base ni à l'interface, dans le dossier de la fonctionnalité budget (par exemple `src\features\budget\calc.ts`), pour être testées seules.

## 4. Report du disponible

- **C1.** Le report est décidé par le propriétaire, mois par mois. Seule la décision (oui ou non) est stockée, jamais le montant. Le montant reporté est recalculé : `max(0, disponible(M-1))`.
- **C2.** À l'affichage d'un mois M, proposer le report quand les quatre conditions sont réunies : aucune décision n'existe pour M ; le mois M-1 contient au moins une transaction ; `disponible(M-1) > 0` ; l'utilisateur est propriétaire. Un membre voit l'information sans les boutons.
- **C3.** La proposition est une carte sur l'accueil, avec deux boutons (« Reporter » et « Ne pas reporter »). Pas de fenêtre bloquante.
- **C4.** Tant qu'il n'y a pas de décision, le report vaut 0.
- **C5.** Un disponible négatif n'est jamais reporté. Il reste dans son mois, affiché en rouge avec le libellé « Déficit ». Le mois suivant repart d'un report de 0 avant son budget, ses revenus et ses dépenses.
- **C6.** Chaîne : le disponible de M-1 inclut son propre report s'il a été accepté. Calculer de proche en proche vers l'arrière, en s'arrêtant à la première décision « non » ou absente. Borne de sécurité : 120 mois.
- **C7.** Corriger une dépense d'un ancien mois change les disponibles des mois suivants quand la chaîne de reports est acceptée. C'est voulu.
- **C8.** Premier mois d'un espace : pas de report. De l'argent de départ s'entre par un revenu ou par un ajustement positif.

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

1. Disponible, en grand, avec une pastille de l'espace (Perso, ou rôle dans un espace partagé). Déficit en rouge s'il y en a un.
2. Ligne « Budget X Ar · dépensé Y Ar » et barre `dépenses nettes / ressources` (pas de barre si les ressources sont ≤ 0). Sans budget défini : afficher tout de même le disponible calculé et l'invitation à créer le budget.
3. Carte de report (seulement si les conditions de C2 sont réunies).
4. Ce mois : revenus et dépenses côte à côte.
5. Les trois dernières transactions.
6. Les trois catégories les plus consommées, avec un lien vers Analyses.

**Transactions** : liste du mois, avec un sélecteur « Dépenses / Revenus / Tout ». L'historique des revenus est ce filtre, pas un écran séparé. Filtres par catégorie et par responsable dans un espace partagé.

**Budgets, volet Mois** : deux sections distinctes, « Budget du mois » (montant, modifier ; action explicite « Reprendre le budget du mois précédent », qui copie seulement le montant) et « Seuils par catégorie » (liste avec barre d'usage et état).

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
- Remplacer « Solde réel » et « Reste à dépenser » par « Disponible ».
- Le disponible négatif utilise le libellé « Déficit » en plus de la couleur rouge.

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
3. **Suis-je dans le budget ?** Courbe des dépenses nettes cumulées jour par jour, avec une ligne horizontale pour les ressources du mois.
4. **Sur la durée.** Barres revenus et dépenses sur les 6 derniers mois.

Indicateurs en chiffres : part des dépenses fixes (forfaits) et variables, part « Non classé », seuils en alerte ou dépassés. Dans un espace partagé, barres des dépenses par responsable (`paid_by`).

Les projections (« à ce rythme, fin de mois non atteinte ») sont hors périmètre de cette réforme (section 16).

## 12. Photo de profil

- Redimensionner dans le navigateur avant l'envoi : 256 × 256, WebP, quelques dizaines de ko.
- Stockage : bucket privé Supabase Storage `avatars`, fichier `{user_id}/avatar.webp`. Écriture : un utilisateur ne peut écrire que dans son propre dossier. Lecture : URLs signées temporaires réservées à l’utilisateur et aux membres de ses espaces, conformément à P7.
- Le changement de photo exige d'être en ligne. Hors ligne ou sans photo : initiales.
- Les membres d'un même espace voient les photos des autres (affichage du responsable).

## 13. Lots

Chaque lot est validé par Laro avant le suivant. À la fin de chaque lot : tests au vert, CI verte, `PROGRESS.md` et cahier des charges à jour.

### R0. Documents et état des lieux

- [x] Inspecter les migrations SQL, règles RLS, modèles Zod, Dexie, repositories,
      bootstrap, synchronisation, calculs et écrans concernés.
- [x] Ranger ce document dans `docs/reforme-budget-global.md`.
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

### R2. Budget, disponible et seuils à l'écran

- [ ] Sélecteur de mois partagé.
- [ ] Accueil : disponible, barre des ressources, carte de report, « Ce mois ».
- [ ] Budgets, volet Mois : budget mensuel et seuils.
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

- [x] Panneau d'ajout complet (types, responsable).
- [x] Filtre Dépenses / Revenus / Tout, historique des revenus.
- [x] Remboursement et ajustement de solde.
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

### R7. Règle du disponible — modèle A

- Le budget mensuel est de l'argent dont l'utilisateur dispose pour ce mois, pas une limite
  de dépenses. Le disponible est `report + budget + revenus + ajustements - dépenses nettes`.
- Un budget absent vaut 0 dans le calcul mais reste distinct d'un budget à 0 dans l'interface,
  qui invite à le créer.
- La dépense nette est comptée une fois dans le disponible, indépendamment des seuils.
  Les revenus augmentent les ressources sans modifier le budget saisi.
- Le report accepté est `max(0, disponible du mois précédent)` ; un déficit n'est pas reporté.
- L'accueil présente « Disponible », la ligne « Budget X Ar · dépensé Y Ar » et une barre
  de dépenses nettes / ressources, masquée si les ressources sont ≤ 0.
- Le graphique « Suis-je dans le budget ? » utilise les ressources du mois comme ligne
  de référence.
- Sous le champ du budget : « Montant dont tu disposes ce mois, en plus du report. »
  Sous le champ d'un revenu : « Argent reçu en plus de ton budget du mois. »
- Validation : tests du calcul, du report, des états absent/0 et du ratio de barre au vert ;
  règles répercutées dans le cahier, le guide UI et le test téléphonique.

### R8. Accueil, profil, Budgets et Analyses

- **Accueil** : afficher dans l'ordre le disponible, revenus/dépenses, le report lorsqu'une
  décision est à prendre, les trois dernières transactions et les trois catégories les plus
  consommées. Retirer le compteur de transactions, le doublon « Ce mois » et les textes
  techniques. Les transactions récentes reprennent la couleur de leur catégorie.
- **Profil** : permettre de modifier le nom affiché en ligne et répercuter ce nom dans les
  espaces et les transactions. Permettre le choix, le déplacement et le zoom de la photo dans
  un cadre rond, puis l'exporter en WebP 256 × 256. La modification du nom et de la photo
  nécessite une connexion. Réutiliser le canevas, sans dépendance supplémentaire.
- **Budgets · Mois** : retirer les textes d'aide permanents et l'introduction technique.
  Remplacer l'aide sur les seuils par un bouton « ? » ouvrant une explication courte qui se
  ferme à l'extérieur. Garder un état vide compact lorsque aucun seuil n'est défini.
- **Répartition des dépenses** : après accord de Laro le 2026-10-25, la carte est déplacée
  du volet Mois vers Analyses, repliable et mémorisée comme les autres cartes. Les indicateurs
  fixes/variables et « Non classé » ne sont pas dupliqués.
- **Analyses** : rendre chaque carte de graphique repliable, avec titre et chiffre résumé.
  Sur téléphone, seul le premier graphique est ouvert par défaut ; un graphique replié n'est
  pas rendu. Mémoriser séparément l'état des cartes dans le stockage local, sans bloquer
  l'écran si ce stockage est indisponible.
- Validation : vérifier l'ordre et l'absence des anciennes cartes d'accueil, le changement
  de nom dans les membres/transactions, le recadrage 256 × 256 WebP, la fermeture extérieure
  de l'aide et la persistance tolérante de l'état des graphiques.

### R9. Filtres, catégories et couleurs de Transactions

Les décisions de Laro s'appliquent à l'écran Transactions, aux formulaires de catégories et
aux visualisations qui utilisent ces catégories.

#### 13.1 Filtres de transactions

- Le sélecteur de mois borne l'historique ; retirer les champs de date « Du » et « Au ».
- La recherche reste visible. À côté, un bouton « Filtres » ouvre un panneau adapté à
  l'écran : Drawer inférieur sur téléphone, Dialog ou panneau latéral sur grand écran.
- Le panneau contient seulement « Catégorie » et « Saisi par » ; ce dernier filtre n'est
  disponible que dans un espace partagé. Les choix sont préparés dans le panneau et ne
  s'appliquent qu'avec « Appliquer ». « Réinitialiser » vide les filtres avancés.
- Le nombre de filtres avancés actifs est indiqué sur le bouton. Les filtres appliqués
  apparaissent en pastilles retirables sous la recherche.
- « Tout / Dépenses / Revenus » reste visible en dehors du panneau.
- Les filtres appliqués survivent au changement de mois tant que l'espace actif ne change
  pas. La sélection du mois continue à restreindre les résultats au mois choisi.

#### 13.2 Gestion des catégories

- Ajouter, modifier et archiver une catégorie se fait dans un panneau : Drawer sur téléphone,
  Dialog sur grand écran. Le formulaire ne doit jamais apparaître après le dernier élément
  d'une liste défilante.
- Le bouton « Ajouter une catégorie » reste visible en haut de l'onglet Catégories.
- Après une sauvegarde réussie, fermer le panneau et afficher une confirmation ; en cas
  d'erreur, conserver le panneau ouvert et montrer l'erreur.
- Archiver conserve la catégorie et tout son historique, mais la retire des choix de
  nouvelles transactions. Une liste « Archivées », repliée par défaut, permet de restaurer
  une catégorie.
- La suppression n'est proposée que si aucune transaction ne référence la catégorie.
- Réutiliser `archived_at` si le schéma l'a déjà. Si un nouveau champ s'avère nécessaire,
  rédiger une migration et la soumettre à Laro ; ne jamais l'appliquer sans son accord.

#### 13.3 Palette de couleurs

- Palette fixe de 10 à 12 couleurs, définies comme jetons CSS dans `docs/guide-ui.md` et
  vérifiées pour le contraste sur les cartes en thème clair et sombre.
- À la création, sélectionner automatiquement la première couleur de palette non utilisée
  par une autre catégorie. Si toutes les couleurs sont utilisées, réutiliser la première.
- La modification propose les couleurs de la palette. Une catégorie existante dont la
  couleur enregistrée est hors palette conserve cette valeur tant qu'une nouvelle couleur
  n'est pas explicitement choisie.
- Réutiliser la couleur de catégorie pour la pastille de chaque ligne de transaction, les
  puces de catégorie du panneau d'ajout, les barres « Où va l'argent ? » et les barres de
  progression des seuils.
- « Non classé » utilise un gris neutre. Le nom de catégorie reste affiché ; la couleur
  n'est jamais l'unique porteuse d'information.

#### 13.4 Vérifications demandées

- Vérifier les filtres appliqués après un changement de mois.
- Vérifier les deux boutons « Ajouter » visibles sur Transactions ; ne pas les supprimer
  sans décision de Laro.
- Vérifier le format des montants ; ne corriger qu'un défaut reproduit dans le formateur
  commun, dans un commit séparé.
- La section 10.5 place Catégories dans Espace. Tout déplacement de l'onglet Catégories
  hors de Transactions nécessite une décision distincte ; ne pas le faire implicitement
  dans R9.

## 14. Tests

### 14.1 Unitaires (Vitest, fonctions pures)

1. Budget de 100 000 Ar sans transaction : disponible de 100 000 Ar.
2. Revenu de 50 000 Ar en plus : disponible de 150 000 Ar, budget saisi toujours à 100 000 Ar.
3. Dépense de 5 000 Ar avec seuil : disponible réduit une seule fois à 145 000 Ar et usage du seuil augmenté de 5 000 Ar.
4. Remboursement de 2 000 Ar : disponible de 147 000 Ar ; ajustement de -1 000 Ar : disponible de 146 000 Ar.
5. Budget absent : disponible = report + revenus + ajustements - dépenses nettes ; l'interface invite à définir le budget.
6. Dépenses supérieures aux ressources : disponible négatif ; au mois suivant, même avec report accepté, le report vaut 0.
7. Chaîne de trois mois avec report accepté : chaque report reprend le disponible positif du mois précédent.
8. Barre d'usage : ratio dépenses nettes / ressources correct ; aucune barre si les ressources sont ≤ 0.
9. Budget absent et budget à 0 : deux états distincts.
10. Somme des seuils supérieure au budget : aucun effet sur le calcul du disponible.
11. Frontière de mois : 31 à 23h30 (UTC+3) compté dans le bon mois ; le 1er du mois suivant dans le suivant.
12. Transaction supprimée ignorée ; modification d'un montant répercutée.
13. Report : oui, non, disponible négatif, chaîne de trois mois, mois précédent sans transaction, décision absente.
14. Statistiques : tri des catégories, part fixe et variable, part « Non classé ».
15. Filtres de l'historique : choix Catégorie/Saisi par appliqués, retirés par pastille,
    réinitialisés dans le panneau et conservés lors du changement de mois.
16. Palette : première couleur disponible choisie, couleur réutilisée après épuisement et
    couleur personnalisée hors palette laissée intacte.
17. Catégorie archivée puis restaurée : l’archivage reste réversible et ses transactions
    historiques conservent leur référence à la catégorie.

### 14.2 Base de données (tests SQL ou d'intégration)

1. Un membre ne peut écrire ni `monthly_budgets`, ni `month_carry_decisions`, ni `recurring_expenses`. Le propriétaire le peut. Un non-membre ne lit rien.
2. Un membre ne modifie que ses propres transactions.
3. `generate_recurring_for_month` appelée deux fois crée une seule ligne par forfait et par mois ; ne crée pas de mois futur ; refuse un non-membre ; ne régénère pas une occurrence supprimée.
4. Une modification de forfait avec une mauvaise version est refusée.

### 14.3 De bout en bout (Playwright)

1. Hors ligne : définir le budget du mois, recharger, la valeur est là ; elle est synchronisée au retour du réseau.
2. Ajouter une dépense depuis l'accueil sur écran de téléphone : le disponible et la barre de ressources changent.
3. Changer de mois puis de page : le mois affiché est conservé.

## 15. Propositions à confirmer par Laro

Ces choix sont proposés par le rédacteur de ce document et n'ont pas encore été validés. Les présenter à Laro avant le lot indiqué.

| N°  | Proposition                                                                                         | Lot |
| --- | --------------------------------------------------------------------------------------------------- | --- |
| P1  | Jour du mois d'un forfait limité à 1 à 28                                                           | R5  |
| P2  | « Le mois précédent existe » veut dire : il contient au moins une transaction                       | R2  |
| P3  | Seuil d'alerte fixé à 80 %, non configurable                                                        | R2  |
| P4  | La génération rattrape les mois manqués jusqu'au mois courant, jamais de mois futur                 | R5  |
| P5  | Création et modification des forfaits seulement en ligne                                            | R5  |
| P6  | Décision de report réservée au propriétaire                                                         | R2  |
| P7  | Confirmée par Laro le 2026-10-25 : bucket `avatars` privé avec URLs signées temporaires             | R3  |
| P8  | Montants en `number` entier côté TypeScript, validé par Zod                                         | R1  |
| P9  | Noms des nouvelles tables et colonnes tels qu'écrits en section 8, adaptés aux conventions du dépôt | R1  |
| P10 | Analyses comme volet de Budgets, pas comme onglet séparé                                            | R3  |

## 16. Hors périmètre (v2 ou plus tard)

- Export CSV des données.
- Projections de fin de mois, date d'épuisement du budget, détection d'anomalies.
- Report d'un disponible négatif.
- Comptes multiples (Mvola, espèces) et transferts entre comptes.
- Notifications et rappels.
- Forfaits créés ou modifiés hors ligne.
- Liens signés pour les photos de profil.
- Seuil d'alerte configurable.
- Lien avec les SMS de mobile money (exclu par Laro pour l'instant).

## Historique des décisions

- 2026-10-25, modèle A : le budget est de l'argent disponible, les revenus s'ajoutent au disponible.
