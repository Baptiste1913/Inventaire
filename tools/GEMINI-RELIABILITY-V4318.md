# v43.18 — Fiabilité

La comparaison du code de la v42.95 (63dce1a670328eb752665a225caf00a315cf33a1) confirme que le parseur strict et la géométrie de capture étaient déjà présents. La configuration historique utilisait GenerateContent v1beta, température 0, 1024 tokens, sans thinkingConfig ni résolution explicite. Le contrôle de contradiction nom/EAN ajouté depuis est conservé.

Mode normal : Interactions et secours GenerateContent renforcé comme v43.09. Le parseur accepte les décimales exactes en chaînes (1 à 3 décimales pour kg, 1 à 2 pour euros), les nombres JSON finis aux unités du schéma, et les grammes explicitement marqués. Il ne complète aucun chiffre incertain, ne fait aucun arrondi, refuse séparateurs ambigus, unités erronées, signes, EAN numériques et valeurs hors limites. Le schéma et les contrôles de validation restent inchangés. L'instruction d'isolation vise les étiquettes voisines sans changer les pixels.

Le diagnostic comptait la disponibilité de validation avant la fin du verrou actif. Il est désormais mesuré après active=false ; présence réelle des champs et motif de blocage distingués du rendu de l'étiquette corrigée. Aucun contenu brut ni donnée personnelle dans les compteurs RAM.

Redéployer le Worker, garder les variables existantes. Tester toutes les références avec une seule étiquette dans le viseur, en Wi-Fi. Comparer aussi le mode historique via GEMINI_BASELINE_4295=true (désactive expériences Interactions, média, streaming, réflexion explicite et cache pour le routage Developer, conserve normalisation, protections actuelles et transport). Retirer cette variable pour rétablir le mode normal. Ce n'est pas un retour complet de l'application en 42.95.

Aucune preuve que le format numérique explique les échecs réels sans diagnostic. Pas de validation automatique ni d'assouplissement des contrôles d'identité, de cohérence prix/poids/EAN, de tare, de contradiction ou de checksum. L'isolation est une instruction modèle, pas une nouvelle segmentation visuelle. Mesurer taux au premier essai, récupération, temps et exactitude de chaque champ.
