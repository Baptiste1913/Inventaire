# Passerelle de scraping de test (non deployée)

La version 41.23 du site comprend une interface de scan en ligne, mais aucune API de scraping n'est activée tant que cette passerelle n'est pas installée.

## Pré-requis

- Créer un compte Cloudflare Workers et Apify. Fixer un budget et un rate limit.
- Vérifier les conditions d'utilisation Courses U et les autorisations d'extraction.
- Identifier le magasin réel avec l'option storeSearch de l'acteur ratatoskr/systeme-u-scraper. Confirmer le magasin et son code postal, ne jamais supposer un identifiant.
- Vérifier, pour chaque produit, le mapping PLU DIGI / préfixe EAN interne / productId Courses U, le nom et le magasin.

## Installation

Déployer workers/coursesu-live-worker.js sur Cloudflare Workers avec route POST /lookup.
Ajouter comme secrets APIFY_TOKEN et COURSESU_MATCHES_JSON et comme variables COURSESU_STORE_ID (ID Apify du magasin vérifié) et ALLOWED_ORIGINS (origine autorisée du PWA). Ne jamais publier les données DIGI, les associations réelles ni les tokens dans GitHub.

Le secret COURSESU_MATCHES_JSON est un objet JSON indexé par PLU|EANprefix, chacun contenant productId, expectedName, expectedStoreName, expectedStorePostcode et productUrl (URL officielle de la fiche). Les clés doivent correspondre à des produits **réellement vérifiés**, pas des approximations.

Dans l'app, ouvrir Administrateur > Essai Prix Courses U en direct. Coller uniquement l'URL HTTPS sans identifiant du Worker (/lookup), puis scanner une étiquette EAN-13.

## Contrat

Requête : {type:inventaires-u-price-lookup,storeId:superu-saintgermain,code:EAN13,eanPrefix:EAN7,plu:PLU,name:Libelle DIGI}.
Réponse acceptée : {type:inventaires-u-live-price,verified:true,storeId:superu-saintgermain,eanPrefix:EAN7,plu:PLU,name:Nom officiel,pricePerKg:2.69,pricePerKgUnit:EUR/kg,checkedAt:ISO,sourceUrl:URL Courses U}.

**Limitation :** la documentation publique de cet acteur annonce le prix de vente et l'unité/volume du produit, mais ne confirme pas un champ €/kg explicite. En absence d'une telle information, le Worker renvoie un refus et l'application n'invente pas de poids. Une autre source tarifaire ou un acteur offrant une valeur explicite €/kg pourra être nécessaire. Les appels du scraper peuvent être plus longs que 1–2 s. Le dispositif n'est pas opérationnel sans déploiement et confirmation des correspondances.

CORS ne suffit pas à protéger une API payante : prévoir authentification, limitations de débit et plafond de dépenses. Les pesées de la PWA restent distinctes : ce pilote ne les enregistre pas automatiquement.