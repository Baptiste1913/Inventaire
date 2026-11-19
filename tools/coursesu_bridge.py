#!/usr/bin/env python3
"""Prototype de lecture des prix €/kg Courses U pour Inventaires U.

Aucune API officielle n'est présumée. Ne contourne pas les contrôles d'accès :
403 / 429 / absence de magasin validé = arrêt, sans publication de tarif.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import html
from http.cookiejar import CookieJar
import json
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE = "https://www.coursesu.com"
SITE = "/on/demandware.store/Sites-DigitalU-Site/fr_FR"
STORE = "superu-saintgermain"
PAUSE_SECONDS = 2.0


class PriceError(Exception):
    pass


def _plain(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", " ", text))).strip()


def parse_product_page(page: str) -> tuple[str, int]:
    """Extrait uniquement un prix explicitement libellé €/kg (pas le prix à la pièce)."""
    title_match = (re.search(r'<h1\b[^>]*\bdata-name-link=["\']([^"\']+)', page, re.I)
                   or re.search(r'<h1\b[^>]*>(.*?)</h1>', page, re.I | re.S))
    name = _plain(title_match.group(1)) if title_match else ""
    if not name:
        raise PriceError("Nom du produit absent de la réponse")
    # Le bloc unit-info est celui identifié dans les pages produit Demandware.
    unit_blocks = re.findall(
        r'<(?:span|div|p)\b[^>]*\bclass=["\'][^"\']*\bunit-info\b[^"\']*["\'][^>]*>(.*?)</(?:span|div|p)>',
        page, re.I | re.S,
    )
    values = set()
    for fragment in unit_blocks:
        label = _plain(fragment).replace("\u202f", " ").replace("\xa0", " ")
        for raw in re.findall(r'(?<!\d)(\d{1,3}(?:[,.]\d{1,2})?)\s*(?:€|EUR)\s*(?:/|par\s+|le\s+)\s*(?:kg|kilo(?:gramme)?)\b', label, re.I):
            value = round(float(raw.replace(",", ".")) * 100)
            if 1 <= value <= 99999:
                values.add(value)
    if len(values) != 1:
        raise PriceError("Prix €/kg absent ou ambigu sur la fiche du produit")
    return name, next(iter(values))


class CourseUReader:
    def __init__(self) -> None:
        self.cookies = CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.cookies))
        self.last_request = 0.0

    def get(self, path: str) -> str:
        url = BASE + path
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.netloc != "www.coursesu.com":
            raise PriceError("Adresse Courses U non autorisée")
        if self.last_request:
            time.sleep(max(0, PAUSE_SECONDS - (time.monotonic() - self.last_request)))
        self.last_request = time.monotonic()
        req = Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; InventairesUPricePilot/0.1)",
            "Accept": "text/html,application/json;q=0.8",
        })
        try:
            with self.opener.open(req, timeout=20) as response:
                if urlparse(response.url).hostname != "www.coursesu.com":
                    raise PriceError("Redirection en dehors de Courses U")
                payload = response.read(2_000_001)
                if len(payload) > 2_000_000:
                    raise PriceError("Réponse trop volumineuse")
                return payload.decode("utf-8", errors="replace")
        except HTTPError as error:
            if error.code in (403, 429):
                raise PriceError(f"Accès refusé ou limité par Courses U (HTTP {error.code}). Arrêt sans contournement.") from error
            raise PriceError(f"Courses U répond HTTP {error.code}") from error
        except (URLError, TimeoutError) as error:
            raise PriceError(f"Connexion à Courses U impossible : {error}") from error

    def select_store(self) -> str:
        self.get("/drive/home")
        self.get("/drive-superu-saintgermain")
        store_cookie = next((c.value for c in self.cookies if c.name == "storeId" and c.domain.endswith("coursesu.com")), None)
        if not store_cookie:
            raise PriceError("Magasin non confirmé : aucun cookie storeId. Aucun tarif ne sera retenu.")
        try:
            status = json.loads(self.get(f"{SITE}/Stores-GetStatus"))
        except (ValueError, PriceError) as error:
            raise PriceError("Impossible de vérifier le statut du magasin sélectionné") from error
        if not isinstance(status, dict) or status.get("storeNotActive") is True:
            raise PriceError("Le magasin sélectionné n'est pas confirmé actif")
        return store_cookie

    def product(self, product_id: str) -> tuple[str, int]:
        if not re.fullmatch(r"\d{1,12}", str(product_id)):
            raise PriceError("Identifiant produit Courses U invalide")
        return parse_product_page(self.get(f"{SITE}/Product-Show?{urlencode({'pid': product_id})}"))


def build_feed(reader: CourseUReader, path: Path) -> dict:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("storeId") != STORE or not isinstance(raw.get("articles"), list):
        raise PriceError("Fichier de correspondances invalide ou mauvais magasin")
    if not 1 <= len(raw["articles"]) <= 10:
        raise PriceError("Pilote limité à 1–10 articles confirmés")
    used = set()
    entries = []
    for row in raw["articles"]:
        plu = str(row.get("plu", ""))
        prefix = str(row.get("eanPrefix", ""))
        pid = str(row.get("coursesuProductId", ""))
        expected = str(row.get("coursesuName", "")).strip()
        if not re.fullmatch(r"\d{1,8}", plu) or not re.fullmatch(r"(?:02|2\d)\d{5}", prefix) or not re.fullmatch(r"\d{1,12}", pid) or not expected:
            raise PriceError("Une correspondance produit est incomplète")
        identity = plu, prefix
        if identity in used:
            raise PriceError("Même produit DIGI présent plusieurs fois")
        used.add(identity)
        name, cents = reader.product(pid)
        # Empêche qu'une fiche ait été remplacée par un autre article.
        if re.sub(r"\W+", "", name.casefold()) != re.sub(r"\W+", "", expected.casefold()):
            raise PriceError(f"Nom Courses U inattendu pour PLU {plu} : {name}")
        entries.append({
            "plu": plu, "eanPrefix": prefix,
            "salesUnit": "weight", "pricePerKg": cents / 100,
            "pricePerKgUnit": "EUR/kg",
        })
    return {
        "type": "inventaires-u-authorized-prices", "schemaVersion": 1,
        "storeId": STORE,
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "articles": entries,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Pilote Courses U Saint-Germain (tarifs au kilo uniquement)")
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument("--probe", metavar="PRODUCT_ID", help="Tester une fiche Courses U sans sauvegarder de tarif")
    actions.add_argument("--build", metavar="MATCHES_JSON", type=Path, help="Créer un flux à partir de correspondances confirmées")
    parser.add_argument("--output", type=Path, default=Path("coursesu-feed-test.json"))
    args = parser.parse_args()
    try:
        reader = CourseUReader()
        store_id = reader.select_store()
        print(f"Magasin sélectionné : {STORE} (identifiant de session reçu : {bool(store_id)})")
        if args.probe:
            name, cents = reader.product(args.probe)
            print(json.dumps({"productId": args.probe, "name": name, "pricePerKg": cents / 100, "unit": "EUR/kg"}, ensure_ascii=False))
            return 0
        feed = build_feed(reader, args.build)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        # Écriture atomique : ne remplace jamais un relevé valide par un résultat incomplet.
        pending = args.output.with_suffix(args.output.suffix + ".pending")
        pending.write_text(json.dumps(feed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        pending.replace(args.output)
        print(f"Flux produit : {args.output} ({len(feed['articles'])} références confirmées)")
        return 0
    except (PriceError, OSError, ValueError, KeyError, TypeError) as error:
        print(f"ÉCHEC CONTRÔLÉ : {error}. Aucun tarif nouveau n'a été publié.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
