# Inventaires U v42.28 — Gemini, lecture renforcée

Objectif : une photo et 3–4 secondes en conditions favorables, de la capture
au code-barres. Ces performances sont des **cibles à mesurer**, pas une garantie
de temps ou d'absence d'erreurs.

La PWA peut fournir à Gemini la photo entière et, si prêt en moins de 180 ms,
un agrandissement central issu du **même cliché**, en une requête structurée.
Un décodage EAN local s'exécute en parallèle. Tous les champs manquants ou
contradictoires font l'objet d'une unique relecture ciblée sur cette même
photo. Sans confirmation EAN indépendante, une deuxième lecture Gemini
contrôle les 13 chiffres.

Ne jamais inventer une valeur, écraser silencieusement un chiffre contradictoire
ou enregistrer sans validation. Le prix imprimé est confronté à l'encodage
EAN pour les étiquettes DIGI 02 compatibles et au produit prix/kg × poids.
L'encodage Super U est encore expérimental : confirmer les codes-barres
générés sur le matériel de magasin avant usage réel.

Déploiement : GitHub Pages met à jour la PWA, mais **pas Cloudflare**.
Dans Cloudflare, déployer `workers/coursesu-live-worker.js` sur
`inventaires-u-prix` sans changer `GEMINI_API_KEY` ni
`COURSESU_TEST_TOKEN`. Le champ `pipelineVersion: 2` signale la
nouvelle passerelle ; en son absence la PWA indique « Worker Cloudflare
à actualiser ».

Tests locaux hors réseau (sans frais API) :
`node tools/test_gemini_worker_v2.mjs`
`node tools/test_gemini_single_photo.cjs`

Test réel recommandé : 50–100 étiquettes aux distances variées, contrôler
le poids, le prix, le produit, le code-barres, les doublons, la tare, et le
temps du clic jusqu'à la génération. Aucun test simulé ne prouve la rapidité
ou la précision de Gemini dans le magasin.
