# Premier essai Apify — tarif au kilogramme ciblé

Cet Actor est indépendant du scraper tiers. Il vérifie un seul produit et le magasin actif puis cherche un prix explicitement affiché en €/kg dans une zone de prix « unit-info ». Il refuse le prix à la pièce et la conversion depuis une contenance supposée.

**Non installé dans Apify, non testé sur le réseau du magasin.** Un test hors réseau ne prouve pas l'accès effectif au site.

Sur https://console.apify.com/ : Development > My Actors > Develop new > Web scraper > JavaScript > template simple > Host on Apify. Dans Source > Code, remplacer src/main.js par le contenu du fichier actors/coursesu-prix-direct/main.js. Construire (Build) puis saisir dans Input > JSON :

    {
      "productUrl": "https://www.coursesu.com/p/carotte/1892766.html",
      "expectedName": "Carotte",
      "storeName": "Saint-Germain",
      "storePostcode": "10120"
    }

Lancer une seule exécution, éventuellement avec un plafond de coût. Ouvrir Output > JSON. Relever ok, error, pricePerKg et elapsedMs. Une sortie ok:false est un diagnostic normal lorsque Courses U ne fournit pas de cookie magasin, de statut fiable ou de tarif €/kg dans son HTML côté serveur.

Magasin 68539 : c'est l'identifiant du premier scraper Apify, pas nécessairement le cookie interne du site. Ce pilote n'assimile pas ces identifiants.

Si le test réussit et renvoie 1.99 pour la carotte montrée, nous adapterons ensuite le Worker Cloudflare pour appeler cet Actor privé, avec son ID et le token Apify en secrets. Aucun mot de passe ni token ne doit être envoyé dans ce dépôt public. L'Actor ne sauvegarde aucune pesée.

Exécuter les tests sans réseau : node tools/test_coursesu_direct.mjs. Respecter les règles d'accès du site : ne pas contourner un code 403 ou 429.