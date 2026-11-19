# Pilote de récupération des prix au kilo Courses U — Inventaires U

Ce module est **expérimental**. Il ne modifie aucune pesée et n'écrit jamais dans la base de données.

## Étape 1 : diagnostic d'accès réel

Sur GitHub → Actions → **Courses U - diagnostic prix au kilo (pilote)** → **Run workflow**.
Le diagnostic essaie de sélectionner le drive Saint-Germain, vérifie un cookie `storeId` et le statut du magasin, puis recherche explicitement un prix **€/kg** sur la fiche Courses U de la carotte (`1892766`). Si le site refuse les connexions automatisées (403, 429), si le magasin n'est pas confirmé ou si aucun prix €/kg n'est visible, l'essai **échoue sans tenter de contourner la protection du site**.

Équivalent en local avec Python 3.11+ :

```sh
python -m unittest discover -s tools -p 'test_coursesu_bridge.py' -v
python tools/coursesu_bridge.py --probe 1892766
```

## Étape 2 : associer les références

Copier `tools/coursesu-matches.example.json` dans un **fichier local non publié** `matches.json` et remplacer les valeurs `REMPLACER...` par les vrais ID de fiche et titres vérifiés sur Courses U. L'EAN interne DIGI ne correspond pas forcément à l'EAN marchand de Courses U ; les correspondances ne sont jamais devinées.

Générer le flux :

```sh
python tools/coursesu_bridge.py --build matches.json --output coursesu-feed-test.json
```

Le fichier n'est produit que si **toutes** les correspondances et les valeurs €/kg des 1 à 10 articles sont confirmées. Aucun prix ne vient du prix à la pièce. La source de données est le HTML public, qui peut changer ; ce n'est pas une API officielle. La récupération n'est pas garantie et doit respecter les conditions du site.

## Étape 3 : compatibilité Inventaires U

Le flux JSON comporte exactement les champs déjà attendus par `coursesu-feed.js` : `type`, `schemaVersion`, `storeId`, `updatedAt`, `articles` et, pour chaque article, `plu`, `eanPrefix`, `pricePerKg`, `pricePerKgUnit`.

Il ne faut **pas activer l'actualisation automatique** dans l'application tant que l'accès, les identifiants et les prix n'ont pas été comparés à des étiquettes réelles. Un flux validé devra être hébergé sur une source HTTPS autorisée avec CORS, puis configuré dans le panneau de test existant. Le code présent ne déploie pas un serveur et n'exécute pas de tâches programmées.

Évolution possible si le test fonctionne : automatiser les relevés avec un hébergement adapté, un cache, et une cadence faible, tout en mettant en quarantaine les écarts importants et les produits non appariés.
