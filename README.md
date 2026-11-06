# Mise à jour — Inventaires U

1. Ouvrir le dépôt GitHub du site.
2. Remplacer les fichiers existants à la racine du dépôt par ceux de cette archive (ne pas les placer dans un sous-dossier).
3. Valider avec **Commit changes**.
4. Attendre la fin du déploiement dans **Actions** ou **Settings → Pages**.
5. Recharger `https://inventaires-u.com`. Si l'ancienne version s'affiche toujours, fermer puis rouvrir l'application ; pour une icône modifiée, retirer puis réajouter le raccourci à l'écran d'accueil.

**Important :** conserver le même domaine et ne pas effacer les données de Safari pour garder les paniers et l'historique enregistrés localement. Par précaution, exporter les paniers avant la mise à jour.

## Test hors ligne (V15)

1. Avec Internet, ouvrir le site et attendre son chargement complet.
2. Fermer l'application, puis la rouvrir en ligne une fois pour laisser le nouveau service worker prendre le contrôle.
3. Activer le mode avion et désactiver le Wi-Fi. Fermer et rouvrir l'application depuis l'écran d'accueil.
4. Vérifier la mise en page, l'indicateur « Mode hors ligne » et le calcul d'un poids net.
5. Réactiver Internet : l'indicateur disparaît.

Si la mise à jour n'apparaît pas immédiatement, ouvrir le site en ligne et relancer l'application. Ne pas supprimer les données Safari : elles contiennent les paniers et l'historique.


V16 : notification flottante Liquid Glass du mode hors ligne, refermable, sans modification des données.

## V19 — Correction de mise à jour
Les références CSS et JS de index.html sont désormais alignées avec le précache du service worker (v19). Notification plus translucide, icône redessinée, animation plus marquée. Après déploiement, ouvrir le site avec Internet puis le relancer pour permettre la prise de contrôle du nouveau service worker.
