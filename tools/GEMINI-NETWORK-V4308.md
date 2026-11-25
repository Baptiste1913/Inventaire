# v43.08 — essais Gemini Developer

Redéployer workers/coursesu-live-worker.js sur inventaires-u-prix. Conserver GEMINI_ROUTE=developer (ou retirer la variable). Priority reste désactivé. Aucun nouveau secret.

## Variables Cloudflare, tester une par une
- GEMINI_MEDIA_RESOLUTION=adaptive : medium sur photo entière uniquement si score <=54 ET détail joint ; high sinon. Détail high. Sans score ou sans détail, high. Les JPEG ne changent pas.
- GEMINI_MEDIA_RESOLUTION=high ou medium : test explicite de résolution de la photo principale, le détail reste high. Une image unique en medium est un test de précision à surveiller.
- GEMINI_DETAIL_RESOLUTION=ultra_high : détail en relecture ciblée uniquement si un mode média est activé.
- GEMINI_API_MODE=interactions : POST v1beta/interactions avec store:false, stream:false, même modèle/clé/photos/prompt et schéma équivalent. Température laissée à la valeur du fournisseur ; le mode streaming GenerateContent est indépendant. Les sorties ne sont utilisées qu'après statut completed. Pas de précédent identifiant, fichier distant ou outil.
- GEMINI_TEMPERATURE=0.5 ou default : GenerateContent ; absent = 0 (historique). Ne pas combiner avec Interactions pour isoler le test.
- GEMINI_TOKEN_LIMIT=adaptive : 256 JSON, 192 compact, 128 texte en MINIMAL ; LOW conserve 1024. Une réponse tronquée est rejetée.
- GEMINI_STREAM=true : mesure du premier token en GenerateContent, aucun résultat partiel validé.

GenerateContent par image utilise v1alpha, option expérimentale à vérifier avec la clé et le modèle. Interactions utilise la syntaxe resolution officielle. Sur refus explicite 400/404 lié aux options/endpoint, une seule tentative GenerateContent historique sans résolution imposée dans le budget existant. Aucun repli sur 401/403/429, ni sur réponse réussie. Les expériences de résolution/API ne sont pas combinées avec Vertex/hedge ou cache explicite. Les paramètres de température/plafond restent séparés.

Le diagnostic indique l'API et la résolution envoyées, pas une preuve que le fournisseur a appliqué la résolution. Mesurer les tokens réels. Préparation réseau au démarrage, à l'entrée dans la pesée et au retour au premier plan, sans photo, sans attente forcée et sans appel Gemini ; si la première analyse devance la négociation, JSON reste disponible.

Documentation : https://ai.google.dev/gemini-api/docs/media-resolution ; https://ai.google.dev/gemini-api/docs/get-started . Tester sur les mêmes étiquettes, en vérifiant nom, EAN, poids, prix, montant, doublons et tares. Aucun gain réel garanti. Désactiver immédiatement tout mode qui réduit la précision.
