# Inventaires U — V29 : performances et stabilité

## Installation
1. **Avant de publier**, ouvrir la V28 et utiliser **Sauvegarde → Télécharger ma sauvegarde**. Conserver le fichier JSON.
2. Décompresser l’archive V29 et transférer tous les fichiers à la racine du dépôt GitHub Pages.
3. Valider les modifications, puis ouvrir le site **en ligne** et le recharger pour installer le nouveau cache.
4. Tester à nouveau l’application depuis l’écran d’accueil en mode avion (Wi-Fi désactivé).

## Changements
- Enregistrement des pesées plus robuste : aucune confirmation de réussite si le stockage local refuse l’écriture.
- Limitation des reconstructions du DOM pendant une session : le compteur et le total se mettent à jour sans redessiner les anciens bilans à chaque pesée.
- Sauvegarde immédiate d’une pesée valide en attente quand l’application passe en arrière-plan ou que l’écran se verrouille, dans les limites imposées par iOS.
- Démarrage, pause, reprise et clôture d’une session restaurés à leur état précédent si l’écriture locale échoue.
- Nettoyage de l’historique sécurisé si son enregistrement local échoue.
- Sauvegardes JSON V29, restauration toujours compatible avec les formats complets V22–V29.
- Titre **UTILITAIRE D’INVENTAIRE** légèrement plus sombre et lettres légèrement plus espacées.
- Cache hors ligne V29 : les ressources HTML/CSS/JS, images, icônes et manifeste sont préchargés.

## Important
- Les données restent locales : elles peuvent disparaître si Safari supprime son stockage ; faire régulièrement une copie JSON.
- Sans réseau, les calculs, les paniers, les sessions, les bilans et les exports locaux restent fonctionnels *si l’installation hors ligne a été faite en ligne auparavant et que les fichiers sont encore dans le cache*.
- Le test sur Safari iOS réel reste nécessaire, même si les tests automatiques passent sur Chromium.
