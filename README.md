# Mise à jour — Inventaires U V23

1. **Avant la mise à jour**, exporte tes paniers depuis la version actuelle et conserve le fichier JSON par sécurité.
2. Sur GitHub, ouvre le dépôt qui héberge `inventaires-u.com`.
3. Décompresse cette archive, puis **remplace tous les fichiers à la racine du dépôt**, sans créer de sous-dossier. Le nom et l'emplacement du fichier `CNAME` doivent rester inchangés.
4. Valide les fichiers avec **Commit changes** et vérifie que le déploiement GitHub Pages s'est terminé dans **Actions** ou **Settings → Pages**.
5. Avec une connexion Internet, ouvre `https://inventaires-u.com`, actualise la page, puis ferme et rouvre l'application depuis l'écran d'accueil afin que le nouveau service worker active son cache.
6. Teste une pesée, le bouton **+ Même produit**, le mode **Grammes · rapide**, le bouton **Annuler**, puis une petite session d'inventaire. Termine la session pour consulter ses statistiques dans **Mes inventaires**.
7. Teste le mode avion après avoir chargé la V23 en ligne : l'interface et les calculs doivent rester accessibles, avec le même pop-up Liquid Glass que dans la V21.

## Conservation des données

- La V22 **conserve les anciennes clés de stockage** des paniers et de l'historique récent : leurs données ne sont pas effacées à l'installation.
- Les **sessions** et le **totaliseur en cours** utilisent de nouvelles clés locales sur le même appareil et domaine. Aucune base de données distante ni compte utilisateur n'est nécessaire.
- Les 15 dernières pesées restent visibles dans l'historique rapide. Les pesées de chaque session sont stockées séparément pour ne pas être perdues du seul fait de cette limite.
- Dans la V23, utilise **Exporter toutes mes données (JSON)** pour sauvegarder paniers, historique et sessions. La fonction **Restaurer une sauvegarde complète** remplace les données actuelles après confirmation. L'ancien import/export des paniers reste disponible.
- Les sessions terminées peuvent être exportées en CSV. Le bilan d'une session peut aussi être exporté en JSON.
- **Ne supprime pas les données Safari** pour forcer une mise à jour : cela pourrait supprimer tes paniers et tes sessions. Le stockage local dépend de l'espace disponible sur l'iPhone ; conserve des sauvegardes JSON régulières.

Icône hors ligne : [Icon Mart — Flaticon](https://www.flaticon.com/free-icons/no-wifi).

## V23 — Capsule de suivi permanente

- En session active ou en pause, la capsule flottante présente les pesées, la durée active et la cadence moyenne (pesées/heure). Elle disparaît une fois la session terminée.
- Toucher la capsule ramène à « Ma session ». Les valeurs sont calculées à partir des sessions V22 enregistrées localement, sans nouveau stockage.
- Capsule anthracite translucide, reflets faibles et halo très discret (environ 85 % de moins que le concept lumineux).
- La notification hors ligne passe au-dessus de la capsule et celle-ci se déplace temporairement sous la notification.
- Les versions CSS, JS et cache hors ligne ont été synchronisées sur V23. Les données existantes et le format de sauvegarde restent inchangés.
