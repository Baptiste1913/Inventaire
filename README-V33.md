# Inventaires U V33.0 — évolutions techniques

- Fusion des pesées de deux appareils par identifiant unique, uniquement lorsque les autres champs d’inventaire et les pesées communes sont identiques. Les conflits restent bloqués et nécessitent un choix manuel. Les suppressions concurrentes ne sont pas fusionnées automatiquement.
- Mise en cache du module Supabase (CDN) par le service worker **après un premier chargement connecté**. L’authentification et la synchronisation Google restent dépendantes du réseau.
- Copie de sécurité asynchrone dans IndexedDB par espace, avec restauration manuelle. **La migration complète du stockage primaire vers IndexedDB n’est pas effectuée : localStorage reste la source active**, pour éviter de casser les fonctions synchrones existantes.
- Dialogue de reprise lorsqu’un autre onglet modifie les données. Une actualisation reste nécessaire pour recharger l’état de l’application.
- Cache PWA v33.

## Avant déploiement
Exporter un JSON de sauvegarde et tester avec des inventaires fictifs. Aucun nouveau SQL par rapport à V32. Ne pas supposer qu’une fusion de suppression ou de modification simultanée de la même pesée est automatique.
