# Cahier des charges — cashFlow+

Version 1.2 — validée par Laro (24 octobre 2026).

Cette version intègre la réforme décrite dans `reforme-budget-global.md`. Elle définit
la cible fonctionnelle ; elle ne signifie pas que les fonctions décrites sont déjà
implémentées.

Les faits sur l’implémentation actuelle ont été vérifiés dans le dépôt. Les décisions
marquées **À confirmer** restent en attente ; elles ne doivent pas être codées avant
validation par Laro.

---

## 0. Règles de travail

1. **Accès au dépôt** : l’IA peut inspecter les fichiers du dépôt lorsque Laro l’y
   autorise. Si un fichier ou une information n’est pas disponible, elle le signale
   explicitement et n’en invente pas le contenu.
2. **Une étape à la fois** : pour les lots R0 à R6, l’IA s’arrête à la fin de l’étape
   et attend la validation de Laro avant de poursuivre.
3. **Pour chaque étape** : expliquer ce qui sera fait et pourquoi, préciser les chemins
   Windows depuis la racine du dépôt et donner les commandes de vérification avec leur
   résultat attendu.
4. **Fichiers complets** : avant de remplacer un document ou un fichier, lire son
   contenu existant. Lorsqu’un fichier complet est demandé, ne pas fournir un extrait
   accompagné de « le reste inchangé ».
5. **Décisions** : ne pas modifier une décision verrouillée sans accord. Présenter les
   décisions signalées **À confirmer** avant le lot concerné.
6. **Dépendances** : ne pas ajouter de paquet sans expliquer son rôle, l’alternative
   écartée et son impact sur l’installation.
7. **Sécurité** : aucune clé secrète dans le dépôt ou le code client. Supabase RLS
   protège les données côté serveur ; masquer un bouton ne constitue pas un contrôle
   d’accès suffisant.
8. **Fin d’un lot** : donner la liste des livrables, les contrôles exécutés et leurs
   résultats, les éléments non terminés, et attendre la validation de Laro.
9. **Migrations** : la coupure R1 peut supprimer les données de test Supabase et
   Dexie. Dès la première utilisation réelle avec des données à conserver, toute
   migration doit être conservatrice et son traitement expliqué avant exécution sur
   Supabase hébergé.

### 0.1 Environnement constaté

- Windows, VS Code, Node.js 22, npm.
- Vite, React, TypeScript strict, Tailwind CSS 4, shadcn/ui, Supabase, Dexie, Zod,
  Vitest et vite-plugin-pwa.
- Déploiement prévu sur Cloudflare Pages.
- Les utilisateurs ciblés utilisent principalement des téléphones Android et une
  connexion parfois instable.
- Le dépôt utilise les noms `workspace_id`, `occurred_on` et `kind` dans son modèle
  courant. Les nouveaux noms doivent suivre ces conventions sauf décision contraire.

---

## 1. Contexte et objectif

cashFlow+ aide une personne ou un groupe à suivre ses dépenses et revenus, à fixer
une enveloppe mensuelle et à consulter l’évolution de son solde. L’application est
une PWA mobile-first, utilisable hors ligne après le premier chargement des données.

Promesse : **comprendre rapidement ce qui a été dépensé, ce qu’il reste dans
l’enveloppe du mois et quel est le solde réel.**

La réforme distingue explicitement :

- **Budget du mois** : enveloppe globale définie manuellement pour un espace et un
  mois. C’est une limite de dépenses décidée, pas de l’argent possédé.
- **Seuil par catégorie** : montant de référence pour observer les dépenses d’une
  catégorie. Les seuils sont indépendants du budget du mois.
- **Reste du budget** : enveloppe globale du mois moins les dépenses nettes du mois.
- **Solde** : estimation de l’argent possédé, calculée avec les reports, revenus,
  ajustements et dépenses nettes.

### 1.1 Écart important avec l’application actuelle

Le dépôt contient aujourd’hui des comptes/portefeuilles avec soldes initiaux, des
transferts entre comptes et des catégories obligatoires pour les dépenses et revenus.
Le solde affiché est calculé à partir de ces comptes. La cible de la réforme retire
les comptes et transferts et rend la catégorie facultative pour les dépenses et
remboursements. Ces enregistrements sont des données de test : la coupure R1 peut
supprimer les lignes et tables concernées, sans conversion des soldes initiaux,
d’archivage des transferts ni création de reports historiques.

---

## 2. Utilisateurs, espaces et vocabulaire

- Usage privé, individuel ou partagé par invitation.
- Interface en français ; devise interne `MGA`, montant affiché en ariary (`Ar`), sans
  décimales.
- Un **espace** contient les transactions, catégories, budgets, seuils et forfaits de
  ses membres.
- Un **propriétaire** administre l’espace et ses réglages. Un **membre invité** peut
  ajouter des transactions et modifier celles dont il est l’auteur, selon les droits
  décrits en section 7. Un **viewer** consulte les données en lecture seule.
- Un **mois** est identifié par `YYYY-MM`. Le mois d’une transaction vient de sa date
  locale, et non d’un horodatage UTC.
- Un **remboursement** réduit les dépenses nettes du mois où il est reçu.
- Un **ajustement** est une correction signée qui ne touche qu’au solde.
- Un **report** est le solde positif du mois précédent, uniquement si le propriétaire
  choisit de le reprendre.
- Un **forfait** est une dépense fixe qui revient à une fréquence mensuelle.
- Le **responsable** (`paid_by`) est la personne qui a réellement payé. Il peut être
  différent de l’auteur de la saisie (`created_by`).

---

## 3. Transactions et calculs

### 3.1 Types de transactions

| Type         |                  Montant stocké | Effet                                                        |
| ------------ | ------------------------------: | ------------------------------------------------------------ |
| `expense`    |      Entier strictement positif | Augmente les dépenses nettes ; catégorie facultative.        |
| `refund`     |      Entier strictement positif | Réduit les dépenses nettes ; catégorie facultative.          |
| `income`     |      Entier strictement positif | Augmente les revenus et le solde ; n’augmente pas le budget. |
| `adjustment` | Entier signé, différent de zéro | Modifie le solde seulement ; aucune catégorie.               |

Il n’y a pas de comptes ni de transferts entre comptes dans la cible. Un transfert
d’argent à une personne est enregistré comme une dépense. Un passage d’argent entre
deux espaces se saisit comme dépense dans un espace et revenu dans l’autre ; il n’y a
pas de liaison automatique entre les deux écritures.

### 3.2 Formules

```text
dépenses_nettes(M) = dépenses(M) - remboursements(M)
revenus(M)         = somme des revenus de M
ajustements(M)     = somme signée des ajustements de M

reste_budget(M)    = budget(M) - dépenses_nettes(M), si un budget existe
solde(M)           = report(M) + revenus(M) + ajustements(M) - dépenses_nettes(M)
report(M)          = décision(M) acceptée ? max(0, solde(M-1)) : 0
usage_seuil(c, M)  = dépenses_nettes de la catégorie c / seuil(c, M)
```

### 3.3 Règles de calcul

- Toute transaction supprimée logiquement est ignorée.
- Une transaction appartient au mois de son champ date locale. Le 31 octobre à 23 h 30
  à Antananarivo reste une transaction d’octobre.
- Un budget absent et un budget présent égal à zéro sont distincts. Un budget à zéro
  signifie que le propriétaire a défini explicitement une enveloppe nulle.
- Chaque dépense réduit le budget global exactement une fois, qu’elle ait une
  catégorie ou un seuil ou non. Un remboursement réduit les dépenses nettes. Les
  revenus et ajustements ne modifient pas le budget.
- Le reste peut être négatif ; il n’est jamais ramené artificiellement à zéro.
- Le solde et les agrégats sont calculés côté client à partir des données locales ; ils
  ne sont pas persistés comme valeurs dérivées.
- Montants en unités entières d’ariary. Pas de calcul métier en nombres flottants.
- Les calculs sont des fonctions pures et disposent de tests unitaires.

---

## 4. Budget du mois et report de solde

### 4.1 Budget du mois

- Un montant global est défini manuellement pour chaque espace et chaque mois.
- Il n’est associé à aucune catégorie.
- Il est indépendant des seuils par catégorie : leur somme peut être inférieure,
  égale ou supérieure à l’enveloppe. Il n’existe aucune validation croisée.
- Le reste est calculé à partir de toutes les dépenses nettes du mois, sans double
  comptage des dépenses également suivies par seuil.
- Un budget non défini déclenche une invitation à le créer. Un budget défini à zéro
  reste un budget existant.
- Reprendre le montant du mois précédent est une action explicite ; aucun report
  automatique de l’enveloppe n’a lieu.

### 4.2 Report du solde

- Le propriétaire décide chaque mois d’accepter ou non le report du solde positif du
  mois précédent. Seule la décision est stockée ; le montant est recalculé.
- Proposer cette décision seulement si aucune décision n’existe pour le mois, si le
  mois précédent contient au moins une transaction et si son solde est positif.
- Le propriétaire voit les boutons « Reporter » et « Ne pas reporter ». Un membre
  voit l’information sans pouvoir décider.
- Tant qu’aucune décision n’existe, le report vaut zéro.
- Un solde négatif est affiché comme un déficit et n’est jamais reporté. Le mois
  suivant repart de zéro avant ses revenus et dépenses.
- Le calcul en chaîne remonte de mois en mois, inclut les reports acceptés antérieurs
  et s’arrête à une décision négative ou absente. Limite de sécurité : 120 mois.
- Modifier une transaction ancienne peut donc modifier les soldes des mois suivants.
- Premier mois : pas de report. Un solde initial peut être saisi comme revenu libellé
  « Solde initial » ou comme ajustement positif.

---

## 5. Seuils par catégorie

- Remplacer « plafond » et « plafonner » par « seuil » dans l’interface.
- Un seuil mensuel est un montant entier supérieur ou égal à zéro, associé à un
  espace, une catégorie et un mois.
- Les seuils sont des repères distincts de l’enveloppe globale ; ils ne la modifient
  pas et ne s’y additionnent pas pour calculer le reste.
- États de suivi : normal en dessous de 80 %, alerte de 80 % à 100 % inclus, dépassé
  au-dessus de 100 %. Le seuil d’alerte est une constante en v1.
- Une catégorie sans seuil n’affiche pas de barre ; ses dépenses comptent toujours
  dans le budget global.
- Une dépense sans catégorie compte dans le budget global et apparaît comme « Non
  classé » dans les statistiques.

La réforme autorise un seuil égal à zéro. Le dépôt actuel impose un montant strictement
positif ; Zod, Dexie, Postgres, le formulaire et les tests devront être alignés au lot
R1.

---

## 6. Droits dans les espaces partagés

| Action                                             | Propriétaire | Membre invité                         |
| -------------------------------------------------- | ------------ | ------------------------------------- |
| Lire les données de l’espace                       | Oui          | Oui                                   |
| Ajouter une transaction                            | Oui          | Oui                                   |
| Modifier/supprimer une transaction                 | Toutes       | Seulement celles dont il est l’auteur |
| Modifier le responsable d’une transaction          | Toutes       | Ses propres transactions              |
| Modifier budget du mois, seuils ou catégories      | Oui          | Non                                   |
| Créer, modifier ou arrêter un forfait              | Oui          | Non                                   |
| Décider du report                                  | Oui          | Non                                   |
| Gérer invitations, membres et suppression d’espace | Oui          | Non                                   |
| Quitter l’espace                                   | —            | Oui                                   |
| Déclencher la génération des forfaits              | Oui          | Oui                                   |

Le rôle `viewer` reste en lecture seule. Les droits sont appliqués par RLS et par les
fonctions serveur, pas uniquement dans l’interface.

Chaque transaction contient `created_by`, attribué automatiquement et immuable, ainsi
que `paid_by`, égal par défaut à `created_by` et modifiable par un utilisateur autorisé.
`paid_by` doit être membre de l’espace. Une dépense générée par un forfait a son
créateur comme auteur et responsable.

### Écart avec la RLS actuelle

Les politiques actuelles autorisent les rôles `owner` et `member` à mettre à jour
n’importe quelle transaction de leur espace. Elles ne limitent pas la modification
aux transactions dont `created_by` correspond au membre. La migration devra resserrer
ces politiques et être couverte par des tests RLS.

---

## 7. Forfaits

- Un forfait appartient à un espace. Seul le propriétaire peut le créer, le modifier
  ou l’arrêter.
- Champs requis : libellé, montant entier positif, catégorie facultative, jour du mois
  (1 à 28), mois de début. Le mois de fin est facultatif.
- Chaque mois couvert génère une vraie transaction `expense`, liée au forfait et au
  mois généré. Elle compte dans les dépenses, le budget et les statistiques.
- En statistiques, les dépenses avec forfait sont « fixes », les autres « variables ».
- La génération serveur est idempotente, autorisée aux membres de l’espace et ne
  génère jamais de mois futur. Elle rattrape les mois manquants jusqu’au mois courant.
- Après une première synchronisation en ligne du mois, les occurrences de forfait
  deviennent disponibles hors ligne.
- Modifier « ce mois seulement » modifie la transaction du mois, sans toucher au
  forfait.
- Modifier « ce mois et les suivants » termine l’ancien forfait au mois précédent et
  crée une nouvelle version à partir du mois courant ; les occurrences passées ne
  changent pas.
- Une occurrence supprimée ne doit pas être régénérée.
- Arrêter un forfait conserve ses occurrences passées et empêche les suivantes.
- Créer ou modifier un forfait nécessite Internet ; sa lecture reste disponible hors
  ligne.
- Les modifications vérifient la version serveur. Une version obsolète est refusée
  avec un message explicite.
- Pour un forfait commencé dans le passé, indiquer le nombre d’occurrences à créer et
  demander confirmation.

---

## 8. Données et migration

Les noms exacts des nouvelles tables et colonnes restent à confirmer selon les
conventions du dépôt. Les éléments ci-dessous expriment les données et contraintes
nécessaires, pas une migration déjà réalisée.

### 8.1 Nouvelles données

- **Budget du mois** : identifiant, `workspace_id`, mois `YYYY-MM`, montant entier
  `bigint >= 0`, date de mise à jour serveur, utilisateur ayant effectué la mise à
  jour. Unicité sur espace + mois.
- **Décision de report** : identifiant, `workspace_id`, mois, booléen accepté/refusé,
  auteur et horodatage serveur. Une décision par espace + mois.
- **Forfait** : identifiant, identifiant de série, `workspace_id`, libellé, montant
  positif, catégorie facultative, jour 1–28, mois de début/fin, créateur, version,
  dates de création/mise à jour.
- **Transactions** : types `expense|refund|income|adjustment`, montant entier positif
  sauf ajustement signé non nul, date locale, catégorie nullable, `created_by`,
  `paid_by`, référence de forfait et mois d’occurrence facultatifs.
- Les occurrences de forfait sont uniques par identifiant de forfait et mois.
- Profil : ajouter un chemin d’avatar facultatif si ce champ n’existe pas déjà.

Le projet utilise actuellement `workspaces` et `workspace_id`, non `spaces` et
`space_id`. Les noms de colonnes définitifs seront validés avant les migrations.

### 8.2 Migration des données

- Aucun budget global n’est créé automatiquement. Les mois existants sans budget
  montrent l’invitation à le définir.
- Le calcul du budget ne lit plus la somme des seuils.
- Les transactions existantes doivent être converties sans perte silencieuse et le
  solde calculé avant/après migration doit être vérifié.
- Les transferts entre comptes et soldes initiaux existants nécessitent une règle de
  migration compatible avec la cible sans comptes. Cette règle doit être explicitée,
  testée et validée avant exécution sur la base hébergée.
- Les données de compte actuelles ne doivent pas être supprimées avant validation de
  la migration et vérification des montants conservés.

### 8.3 Dexie et synchronisation

- Ajouter les tables locales des budgets mensuels, décisions de report et forfaits ;
  migrer la version Dexie en conservant les données déjà installées.
- Mettre à jour les schémas Zod, repositories, hooks réactifs, import initial et
  opérations d’outbox pour couvrir toutes les nouvelles données.
- Les écritures hors ligne du budget et du report sont locales et mises en file, puis
  synchronisées. Les horodatages serveur arbitrent les conflits ; l’horloge mobile
  n’arbitre jamais.
- Toute erreur d’autorisation serveur est présentée à l’utilisateur et la donnée locale
  refusée est traitée conformément à la politique de synchronisation.
- RLS est activée sur chaque nouvelle table et des contraintes SQL valident les
  données possibles.

---

## 9. Sécurité et confidentialité

- Toutes les tables métier sont protégées par RLS. Un utilisateur ne lit que les
  espaces auxquels il appartient.
- Les invitations demeurent à jeton fort, stocké sous forme hachée, révocable et
  acceptées atomiquement côté serveur.
- Le serveur valide les rôles, l’auteur de la transaction, le responsable et la
  cohérence d’appartenance du responsable.
- Tests obligatoires : propriétaire, membre, viewer, non-membre, membre retiré et
  tentative de modification d’une transaction écrite par quelqu’un d’autre.
- IndexedDB n’est pas chiffrée ; ce risque est connu. La déconnexion efface les données
  locales.
- Aucun secret Supabase dans le navigateur, dans le dépôt ou dans les journaux. La clé
  `service_role` n’est jamais utilisée côté client.

---

## 10. Offline-first et synchronisation

- L’interface métier lit et écrit dans Dexie ; elle ne dépend pas du réseau pour
  afficher les données déjà disponibles localement.
- L’import initial récupère par pages les espaces et données autorisés sans ajouter
  d’opérations à l’outbox.
- Toute écriture locale ajoute sa mutation à l’outbox dans une transaction locale.
- Le push est séquentiel, idempotent et retenté après une interruption. Les suppressions
  logiques ne peuvent pas être ressuscitées par une modification ultérieure.
- Le pull est paginé, par espace et table, à partir d’un curseur d’heure serveur avec
  chevauchement.
- La synchronisation s’exécute au démarrage, au retour réseau, au retour au premier
  plan et périodiquement.
- Les droits sont revérifiés à chaque cycle. Si un membre perd son accès, ses données
  et opérations locales de cet espace sont purgées. Un refus d’écriture pour un membre
  toujours autorisé reste signalé.
- Le budget et le solde sont calculés localement ; leur état peut temporairement différer
  d’un autre appareil jusqu’à synchronisation.
- Les forfaits du nouveau mois ne sont créés qu’après connexion ; c’est une limite
  hors ligne acceptée.

---

## 11. Fonctionnalités et critères d’acceptation

**F-01 — Authentification** : inscription, connexion, réinitialisation et changement de
mot de passe par email ; première connexion en ligne, puis ouverture hors ligne avec
session et données déjà présentes.

**F-02 — Espaces** : espace personnel créé à l’inscription ; espaces partagés par
invitation, avec sélection et gestion des membres conformément aux droits.

**F-03 — Catégories** : catégories de dépenses et revenus, modifiables et archivables.
La dépense et le remboursement peuvent ne pas avoir de catégorie.

**F-04 — Transactions** : dépenses, remboursements, revenus et ajustements. Saisie
rapide hors ligne ; la date est locale ; auteur et responsable sont distincts dans les
espaces partagés. Aucune entité compte/portefeuille ni transfert entre comptes dans la
cible.

**F-05 — Budget du mois** : enveloppe manuelle, unique par espace/mois, y compris zéro ;
reste et progression calculés sur les dépenses nettes, une fois chacune.

**F-06 — Seuils** : seuil indépendant par catégorie/mois, états normal/alerte/dépassé,
catégories non suivies sans barre.

**F-07 — Solde et report** : solde calculé sur report accepté, revenus, ajustements et
dépenses nettes ; déficit non reporté ; décisions réservées au propriétaire.

**F-08 — Forfaits** : gestion propriétaire, génération d’occurrences idempotente,
occurrence supprimée non recréée et contrôle de version.

**F-09 — Accueil** : solde principal ; budget du mois et reste ; proposition de report
si applicable ; revenus/dépenses du mois ; trois transactions récentes ; catégories les
plus consommées et lien vers les analyses.

**F-10 — Transactions et historique** : vues Dépenses/Revenus/Tout, liste du mois,
filtres adaptés à l’espace, recherche texte et pagination adaptée aux grands historiques.

**F-11 — Analyses** : graphiques et indicateurs définis en section 13, avec valeurs
accessibles sous forme textuelle.

**F-12 — Profil et réglages** : avatar, profil, réglages d’application distincts des
réglages de l’espace.

**F-13 — PWA et synchronisation** : application installable, shell accessible hors
ligne, opérations en attente conservées et état de synchronisation explicite.

---

## 12. Interface et expérience utilisateur

### 12.1 Principes

- Prioriser les actions fréquentes : ajouter une transaction, consulter le solde et le
  budget. Ranger les outils moins fréquents dans « Plus » ou les réglages appropriés.
- Une action principale par écran ; aucun doublon de logo, sélecteur d’espace ou action.
- Chaque écran possède des états chargement, vide, erreur et hors ligne.
- Les fiches d’écran (but, action principale, contenu et états) sont validées avant
  leur implémentation.

### 12.2 En-tête et profil

- À gauche : sélecteur compact de l’espace actif.
- À droite : avatar (photo ou initiales) et indicateur de synchronisation seulement
  quand utile.
- Pas de salutation dans l’en-tête ni de nom d’application répété sur mobile.
- Le menu de profil contient identité, « Mon profil », réglages de l’application et
  déconnexion. Les réglages de l’espace restent dans « Plus ».

### 12.3 Navigation

- Mobile : barre du bas, cinq emplacements — Accueil, Transactions, action centrale
  « + » ouvrant le panneau d’ajout, Budgets, Plus.
- Grand écran : barre latérale — Accueil, Transactions, Budgets, Forfaits, puis
  Catégories et Membres dans la partie Espace.
- « Plus » sur mobile : Forfaits, Catégories, Membres/invitations, Réglages de l’espace.
- Budget : volets « Mois » et « Analyses ».
- Un mois sélectionné est partagé par les écrans et reflété dans l’adresse, sous la
  forme `?mois=YYYY-MM`.

### 12.4 Écrans

**Accueil**, dans l’ordre :

1. Solde réel, en grand, avec espace/rôle ; déficit indiqué par un libellé et une
   couleur.
2. Enveloppe et reste du budget du mois, ou invitation à définir l’enveloppe.
3. Carte de décision de report si les conditions de la section 4 sont réunies.
4. Revenus et dépenses du mois côte à côte.
5. Trois dernières transactions.
6. Trois catégories les plus consommées, avec lien vers les analyses.

**Transactions** : liste du mois et filtres Dépenses/Revenus/Tout ; catégorie et
responsable en espace partagé.

**Budgets — Mois** : deux sections distinctes : « Enveloppe globale du mois » avec
action explicite pour reprendre le montant précédent ; « Seuils par catégorie ».

**Budgets — Analyses** : graphiques de la section 13.

**Réglages de l’application** : profil/photo, mot de passe, thème clair/sombre/système,
langue française en v1, à propos.

**Réglages de l’espace** : catégories, forfaits, membres/invitations, nom ou suppression
de l’espace. Modifications réservées au propriétaire ; lecture selon les droits.

### 12.5 Ajout d’une transaction

- Panneau inférieur (Drawer) plutôt qu’une page dédiée.
- Ordre : montant avec pavé numérique, type (dépense par défaut), catégorie si
  applicable, date locale (aujourd’hui par défaut).
- « Plus d’options » : responsable et note.
- Après enregistrement, confirmation avec possibilité d’annuler.

### 12.6 Textes, montants et états

- Afficher les montants comme `800 000 Ar`, sans décimales, avec espaces françaises
  insécables pour les milliers. Utiliser une seule fonction de formatage.
- Ne pas afficher « MGA » dans les libellés utilisateurs.
- Remplacer « Reste à dépenser » par « Budget de [mois] » dans les titres adaptés.
- Ne pas afficher de détails techniques comme « calculé sur cet appareil ».
- Les états vides proposent l’action de démarrage appropriée.
- Utiliser des squelettes pendant les chargements ; éviter qu’un écran vide ressemble à
  une perte de données.

### 12.7 Accessibilité et mobile

- Cibles tactiles d’au moins 44 px ; onglets d’au moins 11 px.
- Respect des zones sûres Android (`viewport-fit=cover` et `env(safe-area-inset-bottom)`).
- La barre fixe ne masque pas le contenu ; contraste AA, libellés et focus visibles.
- La couleur seule ne porte jamais une information.
- Respect de `prefers-reduced-motion` ; transitions de 150 à 250 ms.

### 12.8 Système de design

Créer `docs/guide-ui.md` avec les couleurs (accent vert), espacements en multiples de
4, rayons, police et graisses, variables de thème clair/sombre et règles de réutilisation
des composants shadcn/ui.

---

## 13. Analyses

Graphiques en barres et courbes uniquement ; pas de camemberts. Charger le composant
de graphiques à la demande depuis le volet Analyses. Chaque représentation graphique
doit aussi rendre ses valeurs accessibles en texte.

1. **Où va l’argent ?** Dépenses nettes par catégorie, triées décroissantes, avec
   repère du seuil ; inclure « Non classé ».
2. **Mieux ou pire que le mois dernier ?** Comparaison par catégorie entre le mois
   sélectionné et le précédent.
3. **Suis-je dans le budget ?** Dépenses nettes cumulées par jour, avec ligne du budget
   mensuel lorsqu’il existe.
4. **Sur la durée.** Revenus et dépenses des six derniers mois.

Indicateurs : parts fixe/variable, part « Non classé », seuils en alerte/dépassés et,
en espace partagé, dépenses par responsable.

Les projections de fin de mois sont hors périmètre.

---

## 14. Photo de profil

- Redimensionner dans le navigateur à 256 × 256 en WebP avant envoi.
- Stocker dans le bucket Supabase Storage `avatars`, chemin `{user_id}/avatar.webp`.
- Un utilisateur ne peut écrire que dans son propre dossier.
- En ligne seulement pour modifier la photo ; initiales hors ligne ou sans photo.
- Les membres d’un espace voient les avatars des responsables de transaction.

**À confirmer avant R3 :** accès public au bucket avec chemins non devinables ou URLs
signées. Le compromis de lecture publique de la proposition P7 n’est pas validé.

---

## 15. Tests et critères de validation

### 15.1 Unitaires

Tester au minimum :

1. Une dépense avec seuil réduit le budget global une seule fois et augmente l’usage du
   seuil.
2. Une dépense sans seuil ou sans catégorie réduit uniquement le budget global.
3. Un revenu n’affecte pas le budget et augmente le solde.
4. Un remboursement réduit les dépenses nettes et l’usage du seuil concerné.
5. Un ajustement positif/négatif ne modifie que le solde.
6. Budget absent et budget égal à zéro restent distincts.
7. Une somme de seuils supérieure au budget ne change pas le calcul du reste.
8. Les frontières de mois utilisent la date locale.
9. Transactions supprimées ignorées ; corrections historiques répercutées.
10. Report accepté/refusé/absent, déficit, mois sans transactions et chaîne de
    plusieurs mois.
11. Statistiques : catégories triées, « Non classé », part fixe/variable.

### 15.2 Base et synchronisation

12. RLS : membre ne modifie ni budget du mois, ni seuil, ni forfait, ni décision de
    report ; propriétaire autorisé ; non-membre sans lecture.
13. Membre ne modifie que ses transactions ; `paid_by` doit être membre de l’espace.
14. Forfait appelé deux fois sans doublon, aucun mois futur, refus du non-membre,
    occurrence supprimée non recréée.
15. Mauvaise version de forfait refusée.
16. Pour la coupure R1, Dexie peut vider les tables concernées et l’ancienne outbox.
    Après le début de l’utilisation réelle, les mises à niveau doivent préserver les
    données et l’outbox ; le push/pull inclut les nouvelles tables.

### 15.3 Parcours de bout en bout

17. Hors ligne, enregistrer le budget, recharger, conserver la valeur et la synchroniser
    au retour du réseau.
18. Ajouter une dépense sur écran de téléphone et vérifier l’évolution du solde et du
    reste, sans double comptage.
19. Changer de mois et de section ; conserver le mois sélectionné.
20. Vérifier les parcours sur téléphone Android et l’interface responsive.

Les tests existants incluent Vitest, tests Dexie avec IndexedDB simulée, tests du moteur
de synchronisation et tests SQL pgTAP. Le test RLS actuellement présent est
`supabase/tests/database/001_rls_and_invitations.test.sql`. Playwright est prévu par
les objectifs de validation, mais n’est pas déclaré dans le `package.json` inspecté ;
son installation et son exécution en CI restent à décider au lot de validation
concerné.

---

## 16. Décisions proposées à confirmer

Ces éléments sont des propositions du texte de réforme et doivent être validés avant
le lot correspondant.

| ID  | Proposition                                                                 | Lot |
| --- | --------------------------------------------------------------------------- | --- |
| P1  | Jour de forfait limité à 1–28                                               | R5  |
| P2  | Le mois précédent « existe » s’il contient au moins une transaction         | R2  |
| P3  | Alerte de seuil à 80 %, non configurable                                    | R2  |
| P4  | Rattraper les occurrences manquantes jusqu’au mois courant, sans mois futur | R5  |
| P5  | Création/modification de forfait uniquement en ligne                        | R5  |
| P6  | Décision de report réservée au propriétaire                                 | R2  |
| P7  | Lecture publique du bucket avatar plutôt que liens signés                   | R3  |
| P8  | Confirmée : montants TypeScript `number` entier validé avec Zod             | R1  |
| P9  | Confirmée : noms alignés sur les conventions existantes du dépôt            | R1  |
| P10 | Analyses comme volet de Budgets                                             | R3  |

### Décision de migration R1

Les données actuellement présentes dans Supabase et Dexie sont des données de test et
peuvent être supprimées. R1 ne convertit pas les soldes initiaux, n’archive pas les
transferts, ne crée pas de décisions de report pour les anciens mois et ne migre pas
l’ancienne file d’attente. La migration distante ne sera pas appliquée sans accord
explicite de Laro.

Dès la première utilisation réelle avec des données à conserver, toute migration devra
être conservatrice : préserver les données, l’outbox et l’historique ou documenter et
faire valider explicitement toute transformation avant application.

---

## 17. Lots de la réforme

Chaque lot s’arrête pour validation par Laro avant de commencer le suivant. Les
jalons M0–M10 historiques de `PROGRESS.md` restent le relevé de l’état antérieur ;
R0–R6 suivent l’implémentation de la réforme.

### R0 — Documents et état des lieux

- [x] Lire la réforme et inspecter les migrations, règles RLS, modèles Zod, Dexie,
      repositories, bootstrap, synchronisation, calculs et écrans concernés.
- [x] Faire valider le présent brouillon v1.2.
- [x] Mettre à jour `docs/cahier-des-charges.md` en v1.2 après validation.
- [x] Créer `docs/guide-ui.md` et ajouter R0–R6 à `PROGRESS.md`.
- [x] Confirmer P8 et P9 ; remplacer P11 par la règle destructive R1.
- **État vérifié** : migrations présentes ; tests SQL présents dans
  `supabase/tests/database/`; `PROGRESS.md` présent ; `docs/guide-ui.md` créé.
- Validation : documents relus, contrôles de documentation disponibles passés et
  décisions nécessaires à R1 confirmées le 2026-10-24.

### R1 — Données et calculs

- Migration Supabase/RLS du modèle R1 ; données de test concernées supprimables.
- Dexie : vider les tables concernées et l’ancienne outbox pour la coupure R1.
- Repositories, bootstrap et synchronisation avec le nouveau modèle et les nouvelles
  tables.
- Adaptation minimale de l’écran transactions : retirer les comptes et transferts ;
  le parcours complet reste en R4.
- Fonctions pures de calcul et tests.
- Supprimer le calcul du budget global basé sur la somme des seuils.
- Validation : tests unitaires et RLS verts ; aucune lecture du budget global à partir
  des seuils. Aucune migration Supabase distante sans accord explicite de Laro.

### R2 — Budget, solde et seuils

- Sélecteur de mois partagé et persisté dans l’URL.
- Accueil : solde, budget global, reste, report et résumés mensuels.
- Écran Budgets : enveloppe globale et seuils séparés.
- Remplacer le vocabulaire plafond par seuil ; format `Ar`.
- États de chargement, vide, erreur et hors ligne.
- Validation : parcours complet sur téléphone, hors ligne puis synchronisé.

### R3 — Navigation, profil et réglages

- En-tête avec sélecteur d’espace, avatar et indicateur de synchronisation.
- Navigation mobile et barre latérale conformes à la section 12.
- Plus, menu avatar, réglages d’application et d’espace.
- Photo de profil et droits UI cohérents avec RLS.
- Validation : parcours sur téléphone et tentatives d’accès interdites refusées par le
  serveur.

### R4 — Transactions

- Panneau d’ajout : dépenses, remboursements, revenus, ajustements et responsable.
- Historique Dépenses/Revenus/Tout.
- Mise à jour des calculs de budget, solde et catégories.
- Validation : chaque type de transaction modifie uniquement les agrégats prévus.

### R5 — Forfaits

- Migration, génération SQL idempotente et règles RLS.
- Écran de création, modification/arrêt, versionnement et suppression d’occurrence.
- Validation : pas de doublon même sur deux appareils ; tests SQL et synchronisation
  au vert.

### R6 — Analyses

- Volet Analyses, graphiques et indicateurs de la section 13.
- Chargement à la demande.
- Validation : valeurs des graphiques cohérentes avec les listes et premier chargement
  non alourdi.

---

## 18. Hors périmètre

- Import ou lecture des SMS Mobile Money.
- Connexion bancaire automatique.
- Export CSV.
- Projections de fin de mois ou détection d’anomalies.
- Report d’un solde négatif ou report du reste du budget.
- Lien automatique entre écritures de deux espaces.
- Notifications push.
- Liens signés pour les avatars, sauf si la proposition P7 est refusée et une stratégie
  alternative est retenue.
- Seuil d’alerte configurable.
- Monétisation et connexion Google.
