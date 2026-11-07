# Inventaires U — V28 : sauvegardes simplifiées

## Installation
1. Dans l'ancienne version, ouvrir « Réglages et données » et exporter une sauvegarde complète, avant toute mise à jour.
2. Décompresser le ZIP. Copier les 15 fichiers à la racine du dépôt GitHub Pages, sans supprimer le contenu.
3. Commit changes. Ouvrir le site une première fois avec Internet et relancer l'application installée sur iPhone.

## Changements
- « Réglages et données » devient « Sauvegarde ».
- Deux actions principales : télécharger une sauvegarde **complète** et restaurer un fichier JSON.
- Résumé du nombre de paniers, inventaires et pesées archivées.
- Date du dernier **export généré** sur cet appareil (ne prouve pas que le fichier a été conservé).
- Exports CSV et panier uniquement rangés dans « Autres options d'export ».
- Sauvegarde JSON v28 incluant les préférences (mode de saisie, seuil de poids, confirmation des doublons).
- Restauration compatible avec les sauvegardes complètes des versions V22 à V28. Contrôle du contenu, confirmation explicite, écritures avec tentative de retour arrière en cas d'échec.
- L'application fonctionne toujours sans serveur et hors ligne ; les fichiers téléchargés doivent être conservés dans l'application Fichiers ou ailleurs par l'utilisateur.

**Important :** l'import de paniers uniquement est distinct d'une restauration complète. Une restauration complète remplace les paniers, l'historique rapide et les sessions. Les données existantes ne sont pas modifiées par la simple mise à jour.
