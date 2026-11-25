# Inventaires U v43.07 — essais adaptatifs

Le Worker est à redéployer sur inventaires-u-prix. Conserver le même modèle Gemini 3.5 Flash-Lite, les secrets, CORS et la configuration de placement. Priority reste désactivé. Les nouveaux comportements payants ou susceptibles de modifier la reconnaissance restent désactivés par défaut.

## Variables Cloudflare à tester séparément

| Variable | Valeur | Effet |
|---|---|---|
| GEMINI_OUTPUT_FORMAT | delimited | Six champs séparés par point-virgule, ? pour inconnu. Parsing strict sans réparation. |
| GEMINI_ADAPTIVE_THINKING | true | LOW si score >=75/100 ; MINIMAL sinon. |
| GEMINI_SPECULATIVE_EAN | true | Relecture EAN anticipée de la même photo, si score >=55 et absence de preuve optique. Incompatible avec GEMINI_ROUTE=hedge. |
| GEMINI_DIGI_CACHE | cachedContents/ID | Cache explicite Developer uniquement en JSON historique. Création séparée. |

Le score est calculé à partir des trois qualités régionales déjà disponibles (EAN, poids, tarif) et de l'état de lecture optique. Les données absentes sont neutres, pas inventées. Aucune attente nouvelle avant l'appel principal, aucune décision d'identité fondée sur le score.

La relecture anticipée n'est réutilisée que lorsqu'une relecture EAN seule est effectivement requise, que le code existant est valide et exactement confirmé, sans conflit ni position DIGI ciblée. Pas de fusion avec une ancienne photographie. Si elle n'est pas prête ou ne concorde pas, annulation et relecture habituelle. Une spéculation annulée peut être facturée ; le chemin de secours habituel reste disponible. Un appel supplémentaire au maximum est anticipé ; le nombre total peut être supérieur si la relecture normale est nécessaire.

## Cache explicite

Créer hors de l'application, uniquement avec un contexte statique approuvé, sans photos ni EAN réels. Le script tools/gemini-digi-cache.mjs reprend automatiquement le prompt fixe du Worker et accepte un fichier texte supplémentaire facultatif (exemples synthétiques, règles). Il affiche le nombre de tokens via countTokens et demande une confirmation explicite via --create avant la création (TTL 1 h). Le minimum du fournisseur peut empêcher la création ; ne pas gonfler artificiellement le contexte. Les crédits/stockage peuvent être facturés. Configurer ensuite le nom de cache retourné dans GEMINI_DIGI_CACHE. Un refus explicite de cache déclenche une requête sans cache. Supprimer la variable pour désactiver le test. Ne pas utiliser un contexte incompatible avec les instructions actuelles.

## Benchmark hors ligne

tools/gemini-digi-benchmark.mjs prépare un JSONL Batch à partir d'un manifeste local de JPEG de référence et des valeurs attendues (les valeurs attendues ne sont pas envoyées à Gemini). Il crée les trois formats de réponse et deux niveaux de réflexion, soit six requêtes par image. Aucun appel Google ni upload automatique. Le JSONL contient les photos : ne pas le committer. Les résultats peuvent ensuite être comparés avec les valeurs attendues via la commande score. Le batch mesure la fiabilité et les tokens, pas la latence interactive. Tester celle-ci sur iPhone avec le diagnostic réseau.

Ne pas cumuler les modes avant d'avoir validé chacun. Toute confusion d'article = désactiver le mode concerné. Pas de fine-tuning : pas de jeu d'entraînement validé ni changement de modèle.
