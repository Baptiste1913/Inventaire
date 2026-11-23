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

## v42.31 — EAN plus robuste et détail recadré sans régression

1. La table du décodeur EAN local comportait un motif de chiffre manquant
   dans les barres de droite. Le jeu des dix chiffres est désormais complet.
   Des tests parcourent les chiffres 7, 8 et 9 et vérifient les clés EAN.
2. La lecture historique 1 100 px (50 trajectoires) est conservée en
   PREMIÈRE intention. Seulement si elle échoue, une seconde lecture locale
   bornée (1 500 px, 2 seuils et angles un peu plus ouverts) est essayée.
   Un EAN exige au moins deux lignes distinctes, un checksum valide
   et aucune autre lecture contradictoire. Aucun EAN n'est inventé.
3. Le JPEG complet d'origine reste toujours la première image envoyée.
   Pour la vue secondaire optionnelle, le scanner peut détecter une zone
   de papier claire entourée de marges contrastées, ou utiliser une position
   de code-barres optique confirmée. Si la zone est incertaine, trop proche
   des bords ou trop petite, il utilise EXACTEMENT le recadrage central
   de la v42.30. Aucune rectification déformante de perspective
   n'est imposée.
4. Si Gemini et la lecture optique locale confirment le même EAN, aucune
   deuxième requête Gemini de confirmation d'EAN n'est effectuée.
   Lorsque seul l'EAN nécessite une confirmation et que le lecteur
   local tourne encore, 165 ms additionnelles au maximum peuvent éviter
   une demande IA complète. Tous les autres contrôles restent stricts.

Toutes ces améliorations sont dans la PWA : **pas de mise à jour Cloudflare
nécessaire pour cette version**. Le code du Worker doit néanmoins prendre
en charge l'image secondaire (pipeline v2) pour bénéficier de son effet.
Un ancien Worker continue à recevoir la photo principale comme avant.

Tests :
`node tools/test_gemini_ean_rescue.cjs`,
`node tools/test_gemini_label_geometry.cjs`,
`node tools/test_gemini_label_detail.cjs`.

Le gain réel doit être mesuré sur les étiquettes du magasin : taux de
première reconnaissance, temps entre clic et étiquette virtuelle, nombre
de relectures IA et température de l'iPhone. Les tests simulés ne
garantissent pas la performance des photos réelles.

## Nettoyage Worker Cloudflare : Gemini uniquement (23 novembre 2026)

Le fichier de déploiement **`workers/coursesu-live-worker.js`** contient
désormais uniquement la route `POST /gemini-lab`, son contrôle d’origine,
son authentification, ses conversions et les appels Gemini.

**La reconnaissance reste strictement inchangée** : le prompt, les modèles
Gemini acceptés, le schéma JSON, les paramètres de génération, la vue
JPEG secondaire, les limites de taille, les délais et les validations
sont conservés. Le navigateur n’a pas besoin de mise à jour.

La passerelle de prix Courses U / Apify, précédemment accessible via
`/lookup`, `/auth-check` et `/html-check`, a été isolée dans
`workers/coursesu-apify-worker.js`. Ce fichier **n’est pas déployé**
automatiquement. Si une adresse `/lookup` est encore utilisée dans
l’espace Administrateur, déployer ce fichier dans **un Worker séparé**
puis renseigner sa propre adresse pour le service de prix.

Après déploiement du Worker Gemini seul sur `inventaires-u-prix`,
les anciennes routes de prix retourneront HTTP 404. Leurs sources ne
sont pas perdues, mais il ne faut pas utiliser le Worker Gemini pour
ces recherches.

**GitHub ne déploie pas Cloudflare.** Déployer le fichier nettoyé
séparément depuis Cloudflare, sans modifier `GEMINI_API_KEY`,
`COURSESU_TEST_TOKEN`, `GEMINI_LAB_ENABLED=true` ou les origines
autorisées. Les anciens secrets Apify/OpenAI, s’ils existent encore,
peuvent être retirés des réglages uniquement après vérification qu’ils
ne sont plus nécessaires à d’autres Workers.

Tests sans coût fournisseur :
`node tools/test_gemini_worker_only.mjs` et
`node tools/test_gemini_worker_v2.mjs`.

Le gain de rapidité sera probablement très faible, car les branches
Apify/OpenAI n’étaient déjà pas exécutées lors d’une analyse Gemini.
L’objectif de ce changement est un Worker plus simple, plus léger et
moins risqué à maintenir.
