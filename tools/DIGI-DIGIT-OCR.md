# OCR DIGI expérimental — v42.50

Le scanner exécute un petit classificateur de chiffres de 970 coefficients int8 et une comparaison de glyphes (formes bitmap + polices du navigateur), dans le Worker image, uniquement en secours du code-barres. Les sorties restent des indices pour le moteur de contraintes et la relecture Gemini 3.5. Elles ne sont jamais fusionnées directement dans le masque de preuve ni validées seules.

Le modèle a été préentraîné sur le jeu de chiffres `sklearn.datasets.load_digits` puis adapté à 4 000 caractères imprimés synthétiques. Évaluation du classificateur quantifié seul sur 1 200 caractères de deux polices exclues de l'adaptation : 94,67 %. Ce chiffre ne mesure ni l'OCR complet ni les étiquettes DIGI réelles. Le résultat réel dépend notamment de la localisation et de la segmentation des caractères.

La copie locale de la zone EAN peut être interpolée jusqu'à 2× et légèrement accentuée. Il ne s'agit pas d'une super-résolution neuronale et aucun pixel de la photo envoyée à Gemini n'est modifié par cette méthode.

## Générer des étiquettes et reproduire le modèle

Sur un poste de développement Linux avec les polices DejaVu, Lato et Noto Sans :

```sh
python -m pip install numpy pillow scikit-learn
python tools/digi_synthetic.py --out /tmp/digi-synthetic --count 3000
python tools/digi_synthetic.py --train > /tmp/digi-digit-model.json
```

Le premier programme produit des PNG et des annotations JSONL avec poids, prix, montant et EAN cohérents. Les références sont fictives et réservées aux essais. Les polices de test sont distinctes des polices d'entraînement ; les images synthétiques ne constituent pas des étiquettes DIGI officielles. Le second programme reproduit l'adaptation du classificateur ; intégrer les nouveaux coefficients uniquement après évaluation indépendante. Les versions Python et des polices peuvent modifier le résultat.

Aucune image réelle n'est collectée ni conservée automatiquement. Pour calibrer sur la vraie police DIGI, utiliser ultérieurement quelques images nettes vérifiées, avec autorisation. Réserver des étiquettes et conditions de prise de vue distinctes pour les tests réels.
