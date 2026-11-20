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
    "productId": "<ID_DU_PRODUIT_COURSESU>",
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
