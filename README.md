# Mise à jour de l’application — V26.1

1. Exporter une sauvegarde complète depuis Inventaires U par précaution.
2. Décompresser l’archive et remplacer les fichiers à la racine du dépôt GitHub Pages.
3. Valider les modifications avec **Commit changes**.
4. Ouvrir le site en ligne pour laisser le service worker actualiser le cache.
5. Tester les boutons d’inventaire, les catégories et la pesée, puis vérifier le mode hors ligne.

## Modifications V26.1
- Espacements légèrement optimisés, sans modifier l’en-tête.
- Boutons de session de même hauteur et alignés ; « Démarrer » utilise toute la largeur.
- Bouton « Terminer » plus discret, pour le distinguer de « Reprendre » sans créer de contraste excessif.
- Catégories repliables moins hautes ; animation préservée.
- Correction des références de cache CSS et JavaScript : elles sont cohérentes avec V26.1.
- Aucune migration de données ni modification des calculs, sessions, ou du stockage.
