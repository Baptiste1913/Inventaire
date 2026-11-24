# DIGI Advanced — v42.51

Gemini 3.5 Flash-Lite reste le lecteur principal. Le nouveau CNN/CTC local produit des indices, et non des valeurs enregistrables. Nano (970 coefficients), ZXing, LiteRT/Paddle expérimental, Tesseract et contrôles DIGI restent disponibles. Advanced s'exécute dans un Worker dédié, lancé après l'envoi de la requête Gemini. La lecture peut être désactivée dans les réglages du scanner. Aucun transfert de photo supplémentaire, pas de sauvegarde des images ni de modification de leur qualité.

## Modèle réellement entraîné

Entrée monochrome 224 × 24, convolution 1→6→12→16→20→12, réduction verticale à 1, séquence CTC de 112 positions (10 chiffres, virgule, blank). 3 696 paramètres (3 630 poids int8, 66 biais flottants), environ 4 Ko de données numériques. Exécution CPU JavaScript, pas de WebGPU ou de conversion TFLite pour ce modèle à ce stade. Le moteur LiteRT existant reste inchangé.

Entraînement PyTorch CPU : 6 000 lignes initiales, puis 24 000 lignes supplémentaires et davantage de polices. Total 30 000 lignes / 220 654 caractères. 33 époques initiales, reprise du meilleur checkpoint de validation, puis 13 époques avec AdamW et taux réduit. CTC, graine 4251. Les lignes combinent EAN de 13 chiffres (avec ou sans espaces), poids à trois décimales, prix à deux décimales. Composition de glyphes, variation de police/taille/espacement, rotation, dilatation/érosion, flou et bruit. Aucune image réelle n'a été utilisée.

## Évaluation

Validation utilisée pour sélectionner le checkpoint : 721/800 lignes exactes, avant quantification. Évaluation finale du modèle quantifié sur 1 200 lignes synthétiques de trois polices réservées, différentes de celles d'entraînement et de validation :

| Champ | Exactes / total | Exactitude séquence entière |
|---|---:|---:|
| EAN | 167/307 | 54,4 % |
| Poids | 239/284 | 84,2 % |
| Prix/montant | 526/609 | 86,4 % |
| Total | 932/1200 | 77,7 % |

Ce résultat mesure des lignes synthétiques déjà isolées, pas le recadrage réel, pas les photographies DIGI et pas la vitesse sur iPhone. Le modèle n'est pas suffisamment fiable pour se substituer à Gemini. Les scores de marge ne sont pas des probabilités calibrées. Les indices numériques sont comparés aux contraintes sans remplacer les valeurs lues.

Les tests JavaScript vérifient les poids exportés (FNV), six logits de référence PyTorch et le décodage CTC, les formats et la séparation des indices. Pour augmenter la capacité, conserver une évaluation indépendante sur des photos réelles et comparer avec Nano. Le générateur d'étiquettes synthétiques accepte maintenant 50 000 images d'entraînement (+ test séparé) ; ces étiquettes complètes n'ont pas été générées ni utilisées dans ce premier entraînement. Le modèle de 1–5 Mo reste une piste, non un composant déjà livré.
