# V31.27 — Séparation Google / e-mail / sans compte

**OBLIGATOIRE avant publication :** dans Supabase > SQL Editor, exécuter `schema-provider-backups.sql`. Le script crée `provider_backups` avec une ligne par `(user_id, provider)` et copie les sauvegardes historiques `user_backups` vers le fournisseur `google`, sans supprimer la table originale.

- Google et e-mail ont des sauvegardes cloud indépendantes, même quand Supabase leur attribue le même identifiant utilisateur.
- L’espace sans compte reste local, séparé.
- Les anciennes sauvegardes cloud sont préservées.
- L’import des données invité est unique par navigateur (lorsque possible). Les données invité originales ne sont pas effacées.
- Les changements simultanés entre plusieurs appareils restent soumis au mécanisme de conflit existant.

**Avant mise à jour :** exporter une sauvegarde JSON de chaque espace utilisé. Après mise à jour, tester Google puis e-mail avec des données fictives.

**Attention :** cette version sépare les *données*, pas nécessairement les identités Supabase. Les comptes Google et e-mail peuvent partager le même `auth.users.id` tout en ayant des espaces distincts dans `provider_backups`. La détection du fournisseur repose sur `user.app_metadata.provider`.
