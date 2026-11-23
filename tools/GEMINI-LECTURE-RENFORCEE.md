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

## v42.29 — nom et PLU uniquement du catalogue DIGI

Le scanner doit lire les **13 chiffres EAN sur la photo** (clé de contrôle
obligatoire), puis résoudre localement leurs 7 premiers chiffres dans
l'export DIGI importé. Seul un préfixe unique fournit le nom et le PLU
officiels. Aucune association apprise ou exemple n'est prise en compte.

Le poids et le prix/kg sont lus sur l'étiquette par Gemini. Le total
imprimé reste un contrôle indépendant avec le calcul poids × prix/kg
et la valeur EAN compatible ; le catalogue n'invente aucun chiffre.

Sans catalogue sur l'iPhone, en présence d'un préfixe inconnu/ambigu,
d'une lecture contradictoire ou d'un prix impossible, aucune étiquette
« prête » n'est proposée. Le nom/PLU du catalogue est recontrôlé juste
avant la sauvegarde, le PLU est imprimé verticalement sur l'étiquette
virtuelle et conservé dans l'historique.

Importer le catalogue DIGI directement sur **l'appareil utilisé
pour scanner** (le stockage DIGI actuel est local). Le Worker Cloudflare
doit être déployé séparément ; la recherche locale DIGI n'a aucun coût
réseau additionnel.

Tests sans appel facturé :
`node tools/test_digi_catalog_lookup.cjs`,
`node tools/test_digi_catalog_integration.cjs`.

## v42.30 — photo optimisée contre les tremblements

Le scanner inspecte à basse résolution (maximum 360 px) les trois zones
critiques de la maquette réelle : barres EAN, poids et prix au kilogramme.
La netteté et les contours sont mesurés localement, sans moteur OCR ni
API supplémentaire. Les anciennes zones de netteté du scanner automatique
restent disponibles sans influencer cette nouvelle sélection manuelle.

Une seule image pleine résolution est conservée temporairement en RAM,
renouvelée au plus toutes les 360 ms et invalidée si la scène change.
Au clic, le viseur compare sa photo instantanée à ce tampon, puis, si
les trois zones ne semblent pas assez nettes, prend une image 85 ms plus
tard au maximum. La sélection empêche l'utilisation d'une image
d'une autre session caméra, trop ancienne ou visuellement différente.

Une seule photo JPEG finale (max. 1920 px comme avant) est transmise à
Gemini. Aucune confirmation ni nouveau bouton, aucune pause native
de la vidéo Safari, et aucune sauvegarde de photo sur l'appareil.
En cas de capteur ou API non compatible, retour à la capture classique.
Le calcul de netteté n'est pas un score de confiance OCR ; il ne
prouve pas que tous les chiffres sont corrects. La validation DIGI
continue de bloquer les pesées incohérentes.

Tests automatiques :
`node tools/test_gemini_frame_quality.cjs`,
`node tools/test_gemini_capture_selection.cjs`.

Mesurer sur l'iPhone le taux de scans réussis sans nouvelle photo,
le temps de la capture au code-barres et l'échauffement sur
50 à 100 étiquettes à différentes distances.
