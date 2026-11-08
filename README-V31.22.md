# Inventaires U — V31.22

- Retrait de la connexion Apple (bouton et gestionnaire).
- Nouveau bloc « Connexion » dépliable dans la page, assorti aux autres cartes.
- Indicateur de compte toujours visible, qui ouvre le bloc.
- Informations du compte, statut de synchronisation, connexion Google ou par e-mail, déconnexion et résolution des conflits.
- Déconnexion via Supabase Auth signOut ; données locales conservées.
- Supabase URL et clé publique conservées dans auth-config.js.

## Déploiement
Remplacer tous les fichiers du site GitHub Pages, sans supprimer les données du navigateur. Tester la connexion, la déconnexion et la récupération sur un second appareil.
