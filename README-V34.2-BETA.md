# V34.2 bêta — correction Safari et IndexedDB

- Connexion : restauration de la session locale via getSession(), sans attendre une validation réseau getUser() avant affichage.
- Événements auth : ignore INITIAL_SESSION et TOKEN_REFRESHED, évite les traitements répétés.
- Déconnexion : flush IndexedDB puis signOut local, sans attendre un appel cloud bloquant. Attention : les changements non synchronisés restent locaux et seront synchronisés lors de la prochaine connexion.
- Réconciliation cloud en arrière-plan après activation du compte.
- Gestion explicite des erreurs d'écriture asynchrones.

Tests à réaliser sur Safari : connexion Google, déconnexion, fermeture/reprise, 200 pesées, offline, récupération cloud. Version bêta non certifiée.
