# Inventaires U V31.19 — Synchronisation cloud (à configurer)

## Configuration nécessaire
1. Créer un projet sur https://supabase.com/dashboard (compte propriétaire requis).
2. Ouvrir **SQL Editor** et exécuter `schema-supabase.sql` : table avec sécurité RLS par utilisateur.
3. Dans **Project Settings / API**, copier **Project URL** et la clé publique **publishable/anon** dans `auth-config.js`. Ne jamais mettre de `service_role` ou secret OAuth dans le site.
4. Dans **Authentication > Providers**, configurer Google OAuth et Apple OAuth avec les identifiants fournis par leurs consoles respectives. Ajouter l'URL de callback Supabase indiquée dans chaque fournisseur. Apple peut nécessiter un abonnement développeur.
5. Dans **Authentication > URL Configuration**, renseigner l'URL HTTPS réelle de l'application et ses URL de redirection autorisées.
6. Publier tous les fichiers sur GitHub Pages. Tester d'abord avec des données non essentielles.

## Fonctionnement
- Sans compte : aucune synchronisation, toutes les données restent locales.
- Connecté : une sauvegarde complète des données de l'application est envoyée à Supabase ; vérification toutes les 12 secondes et au retour de la connexion.
- À la première connexion : si le cloud est vide, les données locales sont envoyées ; si le cloud existe et l'appareil est vide, elles sont récupérées. Si les deux diffèrent, **choix manuel obligatoire** pour éviter l'écrasement silencieux.
- Si les données sont récupérées du cloud, la page se recharge pour réinitialiser correctement l'état interne.
- Les données sont privées via les règles RLS. Les échanges passent par HTTPS. La base de données n'est **pas chiffrée de bout en bout** : l'administrateur du projet peut y accéder.
- Ne pas modifier les mêmes données simultanément sur plusieurs appareils : il s'agit d'une synchronisation par **instantané complet**, pas d'une fusion de pesées. La dernière sauvegarde envoyée peut écraser des modifications concurrentes. Conserver des exports JSON de secours.
- Une connexion Internet est nécessaire pour les authentifications et les échanges cloud ; l'application reste utilisable localement hors ligne.

**Limitations :** aucun compte ni projet Supabase ne peut être créé sans intervention du propriétaire. Google/Apple nécessitent leurs propres paramètres OAuth. Aucun test réel d'authentification n'a été effectué.
