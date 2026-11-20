# Inventaires U — contrôle de correspondance catalogue / balance

La sécurité est **prioritaire** : un EAN complet de catalogue est un identifiant de référence. Un EAN de balance à montant variable contient un **préfixe fixe de 7 chiffres**, puis des informations variables, et n'est donc pas nécessairement égal aux 13 chiffres du catalogue.

La vérification se fait en 2 étapes :

- Préfixe DIGI scanné = préfixe d'une seule entrée du catalogue DIGI importé ; PLU et nom DIGI concordants
- EAN 13 chiffres du catalogue Courses U = EAN exact approuvé côté serveur pour le même PLU/préfixe, clé de contrôle vérifiée

Puis vérification **magasin 68539 / Saint-Germain / 10120**, identifiant du produit Courses U, nom officiel, devise, et prix.

Si le site renvoie un prix explicite « EUR/kg », il est prioritaire. Sinon, la contenance vérifiée (par exemple 750 g) ne peut servir au calcul **que si la présentation commerciale a elle-même été contrôlée**, champ `sameRetailOfferVerified: true`. Un produit vendu en sachet ne peut pas automatiquement fournir le tarif d'un article de balance en vrac.

La sortie du pilote renvoie `priceSource`, `catalogEan` et éventuellement `packGrams` pour vérification dans l'application. **Aucune pesée n'est enregistrée automatiquement.**

## Correspondances privées

Le fichier secret Cloudflare `COURSESU_MATCHES_JSON` contient un objet indexé par `<PLU>|<PREFIXE_EAN7>` avec :

```json
{
  "<PLU>|<PREFIXE_EAN7>": {
    "productId": "<ID_FICHE_COURSESU>",
    "actorExtId": "<ID_CATALOGUE_APIFY>",
    "catalogEan": "<EAN13_COURSESU_VERIFIE>",
    "digiName": "<LIBELLE_DIGI>",
    "expectedName": "<NOM_CATALOGUE_EXACT>",
    "expectedStoreName": "St germain",
    "expectedStorePostcode": "10120",
    "productUrl": "https://www.coursesu.com/p/<produit>/<id>.html",
    "verifiedPackGrams": 750,
    "packVerifiedSource": "https://www.coursesu.com/p/<produit>/<id>.html",
    "packVerifiedAt": "2026-11-20",
    "sameRetailOfferVerified": false
  }
}
```

Les valeurs illustratives ne doivent pas être déployées telles quelles. `verifiedPackGrams` et `sameRetailOfferVerified` sont facultatifs, mais sans preuve équivalente vérifiée ils n'autorisent **aucun** prix déduit. Ne pas publier les correspondances réelles et les secrets d'Apify dans un dépôt public.

Le Worker est un **pilote** ; il faut encore déployer le code dans Cloudflare, configurer les secrets, vérifier les noms exacts renvoyés par Apify et tester le temps de réponse. L'ID magasin 68539 est celui du scraper, vérifié précédemment par `storeSearch`, pas un identifiant obtenu de la page web. Les limitations de débit et de coût restent nécessaires pour éviter des utilisations imprévues.

Pour les tests locaux sans réseau : `node tools/test_coursesu_catalog_worker.mjs`.

## Identifiants distincts

`productId` : fiche Courses U (carotte 1892766) ; `actorExtId` : identifiant catalogue Apify (carotte 193975), utilisé dans le filtre `productIds`. Les deux ne doivent pas être confondus.

## Activation explicite (novembre 2026)

Le Worker exige désormais `COURSESU_LIVE_ENABLED=true` pour déclencher un appel Apify. Sans cette variable, ou avec la valeur `false`, il répond HTTP 503 avant toute requête réseau. Les tests de configuration sont donc possibles sans dépenses involontaires.

**Ne pas activer le switch pour le public avant d'avoir mis en place une limitation réelle des appels** (quotas côté compte Apify et contrôles Cloudflare). Un contrôle CORS n'est pas une authentification et n'empêche pas les requêtes HTTP directes. Un prix inexact demeure bloqué malgré l'activation.

## Sécurité temporaire d'un test Apify réel

Pour le pilote de diagnostic uniquement, la connexion nécessite maintenant **deux conditions** : `COURSESU_LIVE_ENABLED=true` et l'en-tête `X-IU-Pilot-Key` identique au secret Cloudflare `COURSESU_TEST_TOKEN` (chaîne aléatoire longue et inconnue du navigateur public). Ne mettre ce secret ni dans GitHub ni dans le JavaScript client.

Chaque démarrage Apify contient les paramètres API documentés `maxTotalChargeUsd=0.02`, `maxItems=1` et `restartOnError=false`. Le premier plafonne le **coût d'une exécution**, pas la somme des exécutions ; le second ne limite les éléments facturés que dans les Actors pay-per-result. Ce n'est pas un plafond mensuel : ne jamais annoncer qu'il l'est. Ne pas laisser le mode live ouvert après le test et ne pas donner de clé au navigateur public.

Pour un service production, remplacer cette porte de test par une authentification serveur fiable et une limite globale stricte (par exemple Durable Object), ainsi qu'un cache et des contrôles budgétaires Apify. CORS seul ne protège pas des requêtes externes.
