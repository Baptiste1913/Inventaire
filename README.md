# Mettre à jour Inventaires U — V27.1

1. Avant toute mise à jour, ouvrir **Réglages et données** et **Exporter toutes mes données (JSON)** pour conserver une sauvegarde.
2. Décompresser le ZIP et remplacer **tous les fichiers à la racine** du dépôt GitHub Pages.
3. Faire **Commit changes** et attendre le déploiement.
4. Ouvrir `inventaires-u.com` avec Internet, recharger une fois puis rouvrir l’application depuis l’écran d’accueil.
5. Tester l’ouverture/fermeture des catégories, l’option de détection des doublons, la suppression d’un bilan fictif et le mode hors ligne.

## Changements V27

- Retrait des coches décoratives et des coches dans les messages de confirmation.
- Exemple de saisie plus discret.
- Animation identique à l’ouverture et à la fermeture des catégories principales.
- Suppression individuelle des bilans terminés, avec confirmation. Les pesées de l’historique rapide restent indépendantes.
- Encadré « Alertes de pesée » rose/rouge clair, avec espace supplémentaire au-dessus.
- Case à cocher **Confirmer les doublons potentiels** ; préférence enregistrée localement, activée par défaut. La confirmation des poids inhabituellement élevés reste active.
- Mention « Utilisation non commerciale uniquement » en pied de page.
- Nouveau cache hors ligne V27, sans migration des paniers ni des sessions.

## Changements V27.1

- Mention **Utilisation non commerciale uniquement** déplacée en première ligne du pied de page, en gras avec un espace inférieur.
- Suppression du délai visuel du séparateur lors de la fermeture des catégories : il s’estompe dès le début de la fermeture, sans couper l’animation du contenu.
- Cache hors ligne actualisé pour récupérer les nouveaux fichiers CSS et JavaScript.

## Correction V27.2

- La carte entière se replie immédiatement pendant les 260 ms de l'animation (plus d'attente visuelle).
- La barre de séparation passe uniquement du transparent au gris clair : suppression du flash noir à l'ouverture.
- Les clics rapides ouverture/fermeture sont pris en charge ; animation réduite si préférence d'accessibilité.
- Cache hors ligne mis à jour. Les paniers, pesées et sessions sont inchangés.

## Correction V27.3

- Correction de la hauteur finale des catégories : prise en compte des paddings et des bordures dans l'animation de 260 ms.
- Suppression du rétrécissement excessif juste avant la fermeture et du saut de taille final.
- État fermé synchronisé avant la fin de l'animation pour Safari iOS.
- Design, données et autres fonctionnalités inchangés.

## Installer cette version

Remplacer les fichiers du dépôt GitHub Pages par les fichiers de cette archive. Ouvrir une première fois le site avec Internet pour mettre à jour le cache de l'application hors ligne.
