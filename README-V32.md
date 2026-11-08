# Inventaires U V32.0 — fiabilité

Avant déploiement : exécuter `schema-v32-safe-sync.sql` dans Supabase. Ne pas supprimer les tables existantes. Exporter une sauvegarde JSON avant mise à jour.

- Écriture cloud atomique avec contrôle de version côté serveur (RPC SQL). Une modification depuis un autre appareil bloque l’écrasement et affiche le choix de conflit.
- Confirmation de la version cloud avant restauration ou écrasement manuel.
- Copies de récupération consultables depuis « Mon espace », uniquement pour l’espace courant.
- Indicateur de dernière synchronisation, textes adaptés, mise en cache version 32, respect de la réduction des animations.
- Le calcul et les données locales restent utilisables hors ligne ; la connexion Google nécessite le réseau et le SDK externe.

Limites : les conflits sont résolus par choix explicite de l’utilisateur et non fusion automatique des inventaires divergents. Les tests OAuth et multi-appareils réels restent indispensables.
