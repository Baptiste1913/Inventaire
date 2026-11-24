# v43.06 — plan d'essai Gemini Standard

Redéployer workers/coursesu-live-worker.js sur inventaires-u-prix, conserver les secrets, CORS, date de compatibilité et placement. Priority désactivé même si une ancienne variable GEMINI_SERVICE_TIER existe. Aucun secret dans GitHub.

## Modes Cloudflare (un changement à la fois)

- Base : GEMINI_ROUTE=developer (ou absent), GEMINI_COMPACT_JSON=false, GEMINI_STREAM=false, GEMINI_RECOVERY_THINKING=minimal. Même prompt, images, schéma et modèle ; réflexion MINIMAL explicite.
- Vertex : créer une clé Vertex AI/Agent Platform Express dans Google Cloud, l'enregistrer **comme secret** VERTEX_API_KEY, puis GEMINI_ROUTE=vertex. Endpoint Express mondial sans projet dans l'URL. Variante projet global : VERTEX_PROJECT_ID avec une clé autorisée pour ce projet. Vérifier facturation, disponibilité et accès. Sans clé valide configurée, le mode demandé retombe sur Developer si la clé Gemini existe.
- Hedge : seulement après comparaison séparée des deux voies. GEMINI_ROUTE=hedge, GEMINI_HEDGE_DELAY_MS=2200. Première requête Developer, une seconde Vertex uniquement si la première est encore en cours. Une tentative par voie sur ce mode, aucune fusion des réponses, secondaire accepté seulement s'il contient un EAN valide, nom et poids/prix/montant cohérents. Contrôles d'identité client inchangés. Un appel annulé peut être facturé. Limiter ce mode aux tests ; il peut générer deux appels payants et réduit les réessais sur la première lecture.
- GEMINI_RECOVERY_THINKING=low : LOW uniquement en relecture ciblée. À tester séparément.
- GEMINI_COMPACT_JSON=true : six clés courtes, normalisées avant validation ; opt-in.
- GEMINI_STREAM=true : flux SSE borné, mesure premier token ; aucun affichage/validation de fragment incomplet, aucune anticipation de validation client à ce stade.
- Cache : collecte des tokens de cache implicite quand Google les fournit. Aucun cache explicite payant ni ajout artificiel de tokens ; mesurer d'abord.

## Mesures

Dans Accès Cloudflare, 100 dernières requêtes réussies (RAM). Comparer médiane/P95, route, secours gagnants, tokens entrée/sortie/réflexion/cache, premier token en streaming. Les erreurs restent à compter séparément. Rejouer les mêmes étiquettes, réseau identique, vérifier nom et poids, EAN, doublons, tares. Toute confusion article = désactiver l'expérience immédiatement. Pas de changement capture, CORS ou modèle.
