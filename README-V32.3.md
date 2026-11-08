# Inventaires U V32.3 — sécurité et finitions

- Copies de récupération : 12 par espace, horodatage, motif et résumé ; autres espaces masqués.
- Conflits cloud : copies des deux versions, bouton de fusion des inventaires compatibles ; divergences d’identifiants non fusionnées automatiquement.
- Import JSON : refuse de fusionner silencieusement deux inventaires divergents.
- Affichage séparé du stockage local et du cloud ; sync sur changement et contrôle périodique.
- Service worker : nouvelle version et mise à jour différée jusqu’à fermeture des anciennes pages ; avertissement si une session est active.
- Aucun nouveau SQL requis (script V32 toujours nécessaire).

## Limites
La fusion ne résout pas automatiquement les modifications concurrentes du même inventaire. Le module Supabase est encore chargé depuis un CDN : une première connexion hors ligne peut échouer. Le fonctionnement iOS/Supabase multi-appareils doit être validé avant usage en production.
