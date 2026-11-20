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

## Contrôle renforcé EAN et calcul sur contenance vérifiée

# Passerelle de catalogue stricte — identité de l'article et tarif €/kg

## Principe

**Une étiquette de balance EAN-13 à prix variable n'a pas toujours le même code complet que le catalogue.**
Ses 7 premiers chiffres identifient une référence locale; les 5 suivants représentent un montant
selon le format DIGI et le dernier est une clé de contrôle. Les 13 chiffres du catalogue
(`0203476000004`) sont comparés **exactement** à l'EAN approuvé dans la
correspondance du serveur, et les 7 premiers à ceux de l'étiquette scannée.

Il faut tous ces contrôles, jamais une recherche par nom approximatif :
- EAN de l'étiquette et EAN du catalogue à 13 chiffres avec bonne clé de contrôle
- préfixe de 7 chiffres identique et unique pour un seul PLU DIGI
- nom de la référence DIGI égal à celui de la correspondance contrôlée
- EAN du catalogue identique à celui approuvé pour ce PLU (13 chiffres exacts)
- identifiant de fiche Courses U identique (`extId`)
- magasin Système U `68539` et adresse comprenant `10120`
- nom officiel du catalogue identique au nom officiel approuvé

## Prix au kilo

1. Priorité : une valeur **explicitement libellée** en `EUR/kg` dans le catalogue, si elle est présente et cohérente.
2. Sinon : calcul depuis `row.price` (prix de vente en EUR), uniquement si le **conditionnement
   exact en grammes a été vérifié séparément sur la fiche du même produit**, avec date
   et URL identique, et vérification datant de moins de 30 jours.
3. Sinon : refus. Ne jamais utiliser `capacityVolume` comme preuve, puisque l'Actor a renvoyé
   1 kg pour une carotte présentée comme 750 g dans le test du 20 novembre 2026.

## Secret de correspondances

Exemple **de structure**, à remplacer par les véritables PLU et préfixe
relevés sur une étiquette. Ne pas copier tel quel en production :

    {
      "<PLU_DIGI>|<PREFIXE_EAN7>": {
        "productId": "1892766",
        "catalogEan": "0203476000004",
        "digiName": "<LIBELLE_DIGI>",
        "expectedName": "Carotte",
        "expectedStoreName": "St germain",
        "expectedStorePostcode": "10120",
        "productUrl": "https://www.coursesu.com/p/carotte/1892766.html",
        "verifiedPackGrams": 750,
        "packVerifiedSource": "https://www.coursesu.com/p/carotte/1892766.html",
        "packVerifiedAt": "2026-11-20"
      }
    }

La correspondance PLU/préfixe **reste à confirmer**. L'EAN du produit ne prouve
pas à lui seul l'identité d'un article DIGI ou un format de tarif identique à Ulis.

## Activation

Ce fichier GitHub ne modifie **pas** automatiquement le Worker déjà déployé
dans le compte Cloudflare, ni les secrets. Il n'est pas activé sur l'application.
Configurer `APIFY_TOKEN` en secret, `COURSESU_STORE_ID=68539` comme variable
et `COURSESU_MATCHES_JSON` en secret; ne pas transmettre les valeurs privées à ChatGPT.

Utiliser ensuite un authentificateur réel et des limites de débit/dépenses :
CORS n'empêche pas des appels abusifs. Apify facture l'utilisation.
L'Actor peut dépasser le délai de 10 secondes configuré dans cet exemple.
La compatibilité en direct n'est pas démontrée.

Tester hors réseau : `node tools/test_coursesu_catalog_worker.mjs`.

