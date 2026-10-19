# PROGRESS

## État actuel

- Jalon en cours : M0 (cadrage et dépôt), à valider
- Dernier jalon validé : aucun
- Prochaine action : pousser le dépôt sur GitHub quand la connexion le permet, vérifier que la CI passe au vert, puis valider M0 et préparer M1

## Jalons

| Jalon | Statut | Date |
| -------- |
------------------------------------------------------------------------------------------------- | ---------- |
| M0 | à valider (étapes 1 à 9 faites, push GitHub reporté, CI jamais exécutée donc pas encore vérifiée) | 2026-10-19 |
| M1 à M10 | à faire | |

## Décisions prises

- 2026-10-19 : Vite + React + TypeScript (SPA) à la place de Next.js, car l'app est pilotée par la base locale et n'a pas besoin de rendu serveur.
- 2026-10-19 : vite-plugin-pwa à la place de Serwist (conséquence du choix de Vite).
- 2026-10-19 : Tailwind CSS 4 via le plugin Vite. shadcn/ui sera ajouté en M3.
- 2026-10-19 : authentification par email et mot de passe uniquement en v1 (pas de Google).
- 2026-10-19 : moteur de synchronisation écrit à la main.
- 2026-10-19 : environnement de dev Windows 10, Node 22.14, npm, VS Code.
- 2026-10-19 : options TypeScript strictes activées (strict, noUncheckedIndexedAccess, noImplicitReturns, noImplicitOverride). exactOptionalPropertyTypes volontairement désactivé.

## Problèmes connus / dettes techniques

- TypeScript est fixé à ~6.0.3 dans package.json. Le modèle Vite proposait 7.0.2, mais typescript-eslint 8.71.2 n'accepte que les versions inférieures à 6.1.0. À réexaminer quand typescript-eslint supportera TypeScript 7.
- Les versions des actions GitHub dans la CI (checkout v4, setup-node v4) n'ont pas été vérifiées comme les plus récentes. À contrôler au premier passage de la CI.
- Risque pour M1 : `supabase test db` demande vraisemblablement la pile Supabase locale, donc Docker (à confirmer dans la documentation de Supabase). Sur Windows 10 avec une connexion limitée, à anticiper avant de commencer M1.
- Le plan gratuit de Supabase peut mettre en pause les projets inactifs. À vérifier sur la page de tarifs avant M1.

## Ce qui n'est PAS encore fait

- Push sur GitHub et première exécution de la CI (connexion limitée pour l'instant).
- Compte Supabase (nécessaire à partir de M1).
- shadcn/ui, PWA, Dexie, Zod, Playwright.
- Nettoyage des fichiers de démonstration inutilisés : src/assets (hero.png, react.svg, vite.svg) et public/icons.svg. À faire en M3, avec les vraies icônes de la PWA.
- Suppression de src/sanity.test.ts quand le premier vrai test existera.
