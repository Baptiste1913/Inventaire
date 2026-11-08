# Connexion par e-mail — V31.20

La connexion par lien magique utilise Supabase Auth (`signInWithOtp`). Vérifier dans Supabase > Authentication > Providers > Email que le fournisseur est activé et que le modèle d’e-mail permet la connexion par lien. Configurer Authentication > URL Configuration : Site URL = adresse publique exacte du site ; Redirect URLs = adresse du site, y compris son chemin GitHub Pages si nécessaire.

**Important :** Supabase impose des limites d’envoi d’e-mails ; pour une diffusion publique, configurer un SMTP adapté. Ne jamais mettre de clé `service_role` ni de secret OAuth dans `auth-config.js`. Seule la clé publique publishable/anon y est autorisée.

Le projet Supabase doit être configuré dans `auth-config.js`. La table SQL attendue est `public.user_backups` avec les colonnes `user_id`, `data`, `updated_at`. Le code V31.19 utilisait par erreur `inventory_backups` et `payload` ; V31.20 corrige cette incompatibilité avec le SQL fourni dans la conversation.

**Limites :** synchronisation par sauvegarde globale, pas de fusion automatique entre appareils ; ne pas utiliser deux appareils simultanément pour modifier le même inventaire. Tester d’abord avec des données fictives et conserver une sauvegarde JSON avant activation. La connexion Apple reste à configurer séparément.
