# V31.33 — fiabilisation des sauvegardes

- Déconnexion bloquée si la sauvegarde n’est pas confirmée, si le réseau est absent ou si un conflit existe.
- Synchronisation détecte les modifications réalisées pendant un envoi.
- Copies de récupération locales avant une restauration cloud ou le remplacement volontaire de données distantes (12 dernières copies, localStorage).
- Connexion Google uniquement ; conservation des données historiques sans suppression SQL.
- Import initial des données sans compte marqué uniquement après création de l’espace local.

## Limites et précautions

- Ne pas vider le stockage du navigateur : les copies locales de récupération seraient supprimées. Exporter un JSON avant migration.
- La synchronisation cloud n’est pas transactionnelle sur les écritures simultanées de deux appareils ; résoudre manuellement les conflits si proposés.
- Le SDK Supabase reste chargé depuis un CDN : l’espace sans compte fonctionne hors ligne, mais une restauration complète de la connexion peut nécessiter Internet.
- Les règles RLS existantes vérifient le user_id, pas le fournisseur ; Google est désormais l’unique méthode exposée.
- Tests réels OAuth et réseau nécessaires avant déploiement général.
