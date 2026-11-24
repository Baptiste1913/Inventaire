# Inventaires U v43.05 — réseau

1. Déployer workers/coursesu-live-worker.js sur inventaires-u-prix en conservant paramètres, secrets et date de compatibilité. Ne pas afficher les secrets.
2. Priority est demandé par défaut. Pour désactiver le surcoût ou comparer, GEMINI_SERVICE_TIER=standard. Tier 2/3 requis. Un refus explicite déclenche un repli Standard pendant cinq minutes par isolate, dans le budget et la limite de trois tentatives. Un en-tête absent reste non confirmé. Pas de réessai de requête réussie.
3. Activer Smart Placement dans les paramètres du Worker (placement.mode=smart). Comparer au placement actuel. Le fichier exemple ne doit pas être déployé seul. Le placement hostname=generativelanguage.googleapis.com est une alternative expérimentale.
4. La préparation authentifiée de la connexion ne transmet aucune image et ne contacte pas Google. Les anciens Workers la refusent sans interrompre la capture.
5. Dans Accès Cloudflare, Diagnostic réseau AI contient les 100 dernières requêtes réussies en RAM, sans image, clé ni identité. Médiane/P95, volume, niveau confirmé et durées Google (réseau + calcul). Les erreurs restent dans les diagnostics existants.
6. Gzip de l'enveloppe seulement si négocié, économie >=8% et >=8192 octets, préparation <=35ms. Retour au binaire normal sinon ; JPEG intact, limites avant/après décompression. Aucun stockage de photo.
7. Tester les mêmes étiquettes et le même réseau en Standard puis Priority. Tester Smart Placement séparément. Référence v43.04 : 17/17, moyenne estimée 3,68 s. Pas de changement CORS, capture, prompt, schéma, modèle, fusion, résolution ou qualité.
