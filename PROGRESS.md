# PROGRESS

## État actuel

- Jalon en cours : aucun (M0 validé, M1 à démarrer)
- Dernier jalon validé : M0 (2026-10-19)
- Prochaine action : démarrer M1. D'abord relire et valider le schéma de la section 6 du cahier des charges, avant d'écrire la moindre migration SQL.

## Jalons

| Jalon    | Statut            | Date       |
| -------- | ----------------- | ---------- |
| M0       | validé (CI verte) | 2026-10-19 |
| M1 à M10 | à faire           |            |

## Décisions prises

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
- Risque pour M1 : `supabase test db` demande vraisemblablement la pile Supabase locale, donc Docker (à confirmer dans la documentation de Supabase). Sur Windows 10 avec une connexion limitée, à anticiper avant de commencer M1.
- Le plan gratuit de Supabase peut mettre en pause les projets inactifs. À vérifier sur la page de tarifs avant M1.

## Ce qui n'est PAS encore fait

- Compte Supabase (nécessaire à partir de M1).
- shadcn/ui, PWA, Dexie, Zod, Playwright.
- Nettoyage des fichiers de démonstration inutilisés : src/assets (hero.png, react.svg, vite.svg) et public/icons.svg. À faire en M3, avec les vraies icônes de la PWA.
- Suppression de src/sanity.test.ts quand le premier vrai test existera.
