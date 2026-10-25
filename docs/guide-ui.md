# Guide UI — cashFlow+

Version 1.1 — conventions de conception de la réforme (25 octobre 2026).

Ce guide définit les règles visuelles et d’interaction à appliquer aux nouveaux écrans
et aux écrans remaniés des lots R1 à R7. Il s’appuie sur les styles présents dans
`src/index.css` et sur les exigences validées dans `docs/cahier-des-charges.md` v1.2.
Il ne signifie pas que tous les écrans respectent déjà ces règles.

## 1. Principes

- Concevoir d’abord pour un téléphone Android ; adapter ensuite aux écrans larges.
- Une action principale clairement identifiable par écran.
- Montrer en premier le solde réel et l’état de l’enveloppe mensuelle ; séparer les
  repères par catégorie des montants globaux.
- Réduire les éléments permanents en haut de l’écran. Les actions fréquentes sont
  accessibles à un geste ; les réglages et fonctions rares sont regroupés.
- Employer des libellés simples et explicites. Éviter les termes financiers non
  expliqués et les détails techniques de stockage ou de synchronisation.
- Utiliser des cartes pour regrouper les informations connexes, pas pour transformer
  chaque valeur en panneau indépendant.
- Les références visuelles partagées par Laro servent d’inspiration pour la hiérarchie,
  la compacité et la navigation mobile ; ne pas recopier un écran ou une identité
  graphique externe.

## 2. Couleurs et états

Les couleurs sont définies par variables CSS sémantiques dans `src/index.css`. Utiliser
les rôles existants plutôt que des couleurs codées localement :

| Rôle                                 | Usage                                  |
| ------------------------------------ | -------------------------------------- |
| `background` / `foreground`          | Fond général et texte principal        |
| `card` / `card-foreground`           | Surface et texte des cartes            |
| `primary` / `primary-foreground`     | Action principale et son libellé       |
| `secondary` / `secondary-foreground` | Action ou surface secondaire           |
| `muted` / `muted-foreground`         | Information moins prioritaire          |
| `accent` / `accent-foreground`       | Mise en évidence discrète              |
| `border`, `input`, `ring`            | Limites de composants, champs et focus |
| `destructive`                        | Erreurs et actions destructrices       |

L’accent de l’application est le vert déjà défini par `--primary` et ses variantes.
Ne pas introduire une deuxième couleur d’accent pour une page ou une fonctionnalité.

### Couleurs des catégories

Les couleurs de catégorie sont des jetons sémantiques, et non des valeurs hexadécimales
choisies librement. Les jetons gardent leur identité tandis que leur valeur est adaptée
au thème. Les contrastes ci-dessous sont calculés contre les surfaces carte de
l’application : `#ffffff` en clair et `#18221e` en sombre ; chaque valeur atteint au
moins 3:1, requis pour les éléments graphiques non textuels.

| Jeton CSS       | Valeur claire | Contraste clair | Valeur sombre | Contraste sombre |
| --------------- | ------------- | --------------: | ------------- | ---------------: |
| `--category-1`  | `#B91C1C`     |          6.47:1 | `#F87171`     |           5.90:1 |
| `--category-2`  | `#C2410C`     |          5.18:1 | `#FB923C`     |           7.21:1 |
| `--category-3`  | `#A16207`     |          4.92:1 | `#FBBF24`     |           9.78:1 |
| `--category-4`  | `#4D7C0F`     |          4.99:1 | `#A3E635`     |          10.83:1 |
| `--category-5`  | `#15803D`     |          5.02:1 | `#4ADE80`     |           9.37:1 |
| `--category-6`  | `#0F766E`     |          5.47:1 | `#2DD4BF`     |           8.77:1 |
| `--category-7`  | `#0E7490`     |          5.36:1 | `#22D3EE`     |           9.03:1 |
| `--category-8`  | `#1D4ED8`     |          6.70:1 | `#60A5FA`     |           6.42:1 |
| `--category-9`  | `#4338CA`     |          7.90:1 | `#818CF8`     |           5.47:1 |
| `--category-10` | `#6D28D9`     |          7.10:1 | `#A78BFA`     |           6.00:1 |
| `--category-11` | `#A21CAF`     |          6.32:1 | `#E879F9`     |           6.63:1 |
| `--category-12` | `#BE185D`     |          6.04:1 | `#FB7185`     |           6.07:1 |

Enregistrer le jeton (`var(--category-1)` à `var(--category-12)`) avec la catégorie.
Les nouvelles catégories prennent la première couleur de palette non utilisée ; si
les douze sont déjà affectées, la première est réutilisée. Une couleur historique
enregistrée hors palette est conservée et affichée telle quelle jusqu'à ce que
l'utilisateur choisisse explicitement un jeton.

Appliquer la couleur à la pastille de transaction, aux puces dans le panneau d'ajout,
aux barres « Où va l'argent ? » et à la progression du seuil par catégorie. La catégorie
« Non classé » reste gris neutre. Toujours montrer le nom ; ne jamais transmettre une
information par la couleur seule.

Les états de budget ne dépendent jamais de la seule couleur :

- **Normal** : moins de 80 % du seuil utilisé ; libellé de progression explicite.
- **À surveiller** : de 80 % à 100 % inclus ; libellé « À surveiller ».
- **Dépassé** : plus de 100 % ; texte « Seuil dépassé » et indicateur visuel distinct.
- **Déficit** : solde négatif ; afficher le mot « Déficit » en plus de la couleur.
- **Hors ligne / en attente / erreur** : texte ou icône avec nom accessible, jamais une
  pastille colorée sans explication.

Les valeurs d’état doivent satisfaire les exigences de contraste AA. Le thème sombre
dispose de variables `.dark` dans la feuille CSS ; son activation par préférence
utilisateur est une fonctionnalité distincte à implémenter au lot prévu.

## 3. Typographie et montants

- Police : `Geist Variable`, déjà importée et exposée par `--font-sans`.
- Police de titre : `--font-heading`, actuellement liée à `--font-sans`.
- Graisses usuelles : normale pour les descriptions, moyenne pour les libellés,
  semi-grasse ou grasse pour les titres et les montants principaux.
- Limiter les tailles et graisses concurrentes dans une même vue ; assurer une
  hiérarchie lisible sans dépendre de petites capitales ou de longues phrases.
- Afficher les montants en ariary : `800 000 Ar`, sans décimales, avec espace
  insécable pour séparer les milliers. Réutiliser une seule fonction de formatage
  dans toute l’application.
- Ne pas afficher le code interne `MGA` dans le texte destiné à l’utilisateur.

## 4. Espacement, largeur et rayons

- Échelle d’espacement : multiples de 4 px, correspondant à l’échelle Tailwind
  (par exemple `1`, `2`, `3`, `4`, `6`, `8`). Garder une distance cohérente entre
  sections, cartes, champs et commandes.
- Utiliser des marges latérales compactes sur téléphone ; éviter le débordement
  horizontal et les colonnes qui obligent à dézoomer.
- Les éléments répétés doivent s’aligner sur une même grille. Les listes longues
  privilégient la densité et la scannabilité plutôt que des cartes trop hautes.
- Rayon de base : `--radius: 0.625rem` ; ses variantes sont dérivées dans `@theme`.
  Réutiliser les rayons Tailwind/shadcn plutôt que définir des valeurs arbitraires.
- Les surfaces de premier niveau peuvent utiliser un rayon plus ample ; ne pas
  empiler des cartes arrondies à l’intérieur d’autres cartes sans raison.
- Les ombres sont légères et réservées à la séparation des surfaces ; privilégier
  bordures et fonds sémantiques pour structurer l’écran.

## 5. Composants et interactions

- Réutiliser les composants `Button`, `Card`, champs et autres composants de
  `src/components/ui/`. Étendre leurs variantes seulement lorsqu’un besoin récurrent
  le justifie.
- Cible tactile minimale : 44 px, avec priorité à 48 px pour les actions principales.
- Focus clavier visible, libellés accessibles, icônes décoratives masquées aux lecteurs
  d’écran et noms accessibles pour les commandes iconiques.
- Une action destructive doit être identifiable et confirmée si elle ne peut pas être
  annulée.
- Afficher une confirmation ou une erreur près de l’action concernée ; ne pas masquer
  un échec derrière un état de réussite.
- Respecter `prefers-reduced-motion`. Les transitions courtes utilisent surtout
  `transform` et `opacity`.
- Utiliser les états vides pour indiquer la prochaine action concrète.
- Les chargements longs utilisent des squelettes cohérents avec la mise en page cible,
  sans présenter un vide comme une absence de données.

## 6. Navigation et structure

### Mobile

- En-tête compact : espace actif à gauche ; avatar et indicateur de synchronisation
  utile à droite.
- Barre fixe du bas sur une seule rangée de cinq emplacements : Accueil, Transactions,
  « + » au centre, Budgets, Plus.
- « + » ouvre le panneau d’ajout de transaction ; ce n’est pas une page de navigation.
- Garder les contrôles visibles et distincts. Les réglages de l’application sont dans
  le menu avatar ; les réglages de l’espace sont dans Plus.
- Respecter `viewport-fit=cover` et `env(safe-area-inset-bottom)`. Le contenu défilant
  conserve une marge basse suffisante pour ne pas être masqué par la navigation.

### Grand écran

- Utiliser la barre latérale pour les destinations principales et les fonctions
  d’espace.
- Éviter de répéter dans l’en-tête les mêmes destinations ou actions déjà présentes
  dans la barre latérale.
- Garder la largeur de lecture confortable ; ne pas étirer les formulaires ou les
  listes au-delà de leur besoin.

## 7. Écrans de la réforme

- **Accueil** : solde réel en premier, enveloppe et reste du mois ensuite, report si
  requis, résumé revenus/dépenses, transactions récentes, catégories principales.
- **Budgets / Mois** : deux groupes visuellement indépendants : enveloppe globale du
  mois, puis seuils par catégorie. Ne jamais suggérer que la somme des seuils constitue
  l’enveloppe.
- **Budgets / Analyses** : quatre graphiques en barres ou en courbes, chargés à la
  demande ; chaque graphique propose ses valeurs en texte et n’utilise pas de camembert.
- **Transactions** : filtres Dépenses/Revenus/Tout, dates locales, responsable visible
  dans les espaces partagés, catégorie « Non classé » lorsque pertinente.
- **Ajout rapide** : panneau inférieur, montant immédiatement accessible, dépense
  sélectionnée par défaut, catégorie/date ensuite, champs secondaires sous « Plus
  d’options ».
- **Réglages** : distinguer sans ambiguïté le profil et les préférences de l’application
  des réglages propres à un espace.

## 8. Validation visuelle

Avant de valider un écran modifié :

- le tester dans le navigateur en mode responsive, notamment sur une largeur de
  téléphone Android ;
- vérifier qu’aucun zoom n’est requis, qu’aucun contenu ne déborde et que la navigation
  basse ne masque pas la dernière action ou carte ;
- parcourir les états chargement, vide, erreur et hors ligne ;
- vérifier les libellés accessibles, la taille des cibles tactiles, le contraste et
  l’usage sans couleur seule ;
- parcourir au moins les largeurs mobile et ordinateur pour éviter une régression
  responsive.

Le contrôle visuel complète les tests automatisés ; il ne les remplace pas.
