# Test sur téléphone de cashFlow+ (aperçu)

Avant de commencer

- Ouvre l'aperçu dans Chrome sur le téléphone et connecte-toi.
- Il te faut un budget défini pour le mois en cours, une catégorie sans seuil et une catégorie avec seuil.
- Après chaque test, écris OK ou PROBLÈME, puis une ligne sur ce que tu as vu. Si c'est un problème, ajoute une capture d'écran.
- Les montants sont des exemples. Prends ceux que tu veux, mais note-les.

---

## 1. Connexion et déconnexion

Faire : connecte-toi, puis déconnecte-toi, puis essaie de rouvrir une page de l'application.
Attendu : la connexion marche. Après la déconnexion, tu n'as plus accès aux écrans et tu reviens à la connexion.
Résultat :OK

## 2. Rechargement sur une sous-page

Faire : ouvre directement l'adresse de l'aperçu suivie de /budgets, puis recharge la page.
Attendu : l'écran Budgets s'affiche. Pas d'erreur 404.
Résultat :OK

## 3. Revenu (règle B6)

Faire : note le disponible et le budget du mois, puis ajoute un revenu de 200 000 Ar.
Attendu : le disponible monte de 200 000 Ar. Le budget saisi ne change pas.
Résultat : À refaire (modèle A)

## 4. Dépense dans une catégorie sans seuil (règle B4)

Faire : ajoute une dépense de 5 000 Ar dans une catégorie sans seuil.
Attendu : le disponible baisse de 5 000 Ar, une seule fois. La dépense apparaît une seule fois dans la liste.
Résultat : À refaire (modèle A)

## 5. Dépense dans une catégorie avec seuil (règle B4)

Faire : ajoute une dépense de 3 000 Ar dans une catégorie qui a un seuil.
Attendu : le disponible baisse de 3 000 Ar, une seule fois (pas 6 000). L'usage du seuil de cette catégorie augmente de 3 000 Ar.
Résultat : À refaire (modèle A)

## 6. Remboursement, puis ajustement négatif (section 3.1)

Faire : ajoute un remboursement de 2 000 Ar dans une catégorie. Note les chiffres. Ajoute ensuite un ajustement de moins 1 000 Ar.
Attendu : le remboursement fait monter le disponible de 2 000 Ar. L'ajustement négatif fait ensuite baisser le disponible de 1 000 Ar. Les dépenses nettes, les revenus, le budget saisi et les statistiques ne changent pas avec l'ajustement.
Résultat : À refaire (modèle A)

## 7. Déficit (règle C5)

Faire : ajoute des dépenses nettes supérieures aux ressources du mois.
Attendu : le disponible négatif s'affiche en rouge avec le mot « Déficit ». Passe au mois suivant et accepte le report s'il est proposé : aucun montant négatif n'est reporté. Le disponible suivant est calculé avec le budget, les revenus, les ajustements et dépenses de ce nouveau mois.
Résultat : À refaire (modèle A)

## 8. Dépense du 31 (règle B2)

Faire : ajoute une dépense datée du 31 du mois (si l'écran propose une heure, mets 23:30).
Attendu : elle est comptée dans ce mois, pas dans le suivant.
Résultat : OK

## 9. Forfait (règles F4 et F6)

Faire :

1. Crée un forfait « Internet » de 10 000 Ar, qui commence ce mois-ci.
2. Regarde les transactions de ce mois. Quitte l'écran, reviens, recharge.
3. Ouvre le mois suivant.
4. Dans le mois suivant, modifie le forfait avec « Ce mois et les suivants » et mets 15 000 Ar.
5. Reviens au mois précédent.
6. Modifie ensuite le forfait avec « Ce mois seulement » dans l'un des mois.

Attendu : une seule transaction « Internet » par mois, même après rechargement. Le mois précédent garde 10 000 Ar. Le mois modifié passe à 15 000 Ar et les suivants aussi. « Ce mois seulement » ne change que le mois choisi.
Résultat : OK

## 10. Mise en page (section 10.9)

Faire : fais défiler plusieurs écrans jusqu'en bas (Accueil, Transactions, Budgets). Touche les boutons et les onglets.
Attendu : la barre du bas ne cache pas le dernier contenu. Les boutons se touchent facilement, sans viser.
Résultat : OK

## 11. Hors ligne (règles H1 et H2)

Faire :

1. Ouvre l'application avec du réseau et attends qu'elle soit chargée.
2. Active le mode avion.
3. Définis ou change le budget du mois suivant, et ajoute une dépense.
4. Recharge la page.
5. Remets le réseau et attends un peu.
6. Sur le PC, recharge l'application avec le même compte.

Attendu : après le rechargement hors ligne, le budget et la dépense sont toujours là, avec un signe « en attente » ou un indicateur de synchronisation. Quand le réseau revient, l'indicateur disparaît. Sur le PC, les mêmes données apparaissent.
Résultat : OK

## 12. Membre invité (section 6)

À faire seulement avec un deuxième compte, invité dans un espace partagé.

Faire : avec le compte invité, essaie de modifier le budget, un seuil, un forfait, puis une transaction créée par l'autre personne.
Attendu : rien de cela n'est possible (bouton absent ou refus). Après rechargement, rien n'a changé.
Résultat :OK
---
