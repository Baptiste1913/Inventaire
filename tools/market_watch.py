#!/usr/bin/env python3
"""Collecte prudente pour la veille du rayon. Aucune alerte sans source vérifiable."""
import datetime as dt
import json
import math
import pathlib
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "market-watch.json"
UTC = dt.timezone.utc
NOW = dt.datetime.now(UTC)
TODAY = NOW.date()
RECALL_DAYS = 10
PRICE_DAYS = 10
RECALL_API = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso-v2-gtin-espaces/records"
PRICE_API = "https://api.tech.ec.europa.eu/agrifood/api/fruitAndVegetable/pricesSupplyChain"
PRICE_SOURCE = "https://agridata.ec.europa.eu/extensions/DataPortal/fruit-and-vegetables.html"
RECALL_SOURCE = "https://rappel.conso.gouv.fr/categorie/58"

def iso_now():
    return NOW.isoformat(timespec="seconds")

def get_json(url, params, maximum=6_000_000):
    address = url + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(address, headers={
        "Accept": "application/json",
        "User-Agent": "InventairesU-MarketWatch/1.0 (+https://github.com/Baptiste1913/Inventaire)"
    })
    with urllib.request.urlopen(request, timeout=12) as response:
        if response.status != 200:
            raise ValueError("HTTP " + str(response.status))
        blob = response.read(maximum + 1)
    if len(blob) > maximum:
        raise ValueError("Réponse supérieure à la limite")
    return json.loads(blob)

def day(value):
    if not value:
        return None
    text = str(value).strip()
    try:
        return dt.date.fromisoformat(text[:10])
    except ValueError:
        try:
            return dt.datetime.strptime(text[:10], "%d/%m/%Y").date()
        except ValueError:
            return None

def clean(value, length=160):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()[:length]

def recent(value, window):
    stamp = day(value)
    return bool(stamp and TODAY - dt.timedelta(days=window) <= stamp <= TODAY)

def valid_url(value, host):
    from urllib.parse import urlsplit
    try:
        item = urlsplit(str(value))
        return item.scheme == "https" and item.hostname == host
    except ValueError:
        return False

def recall_feed():
    payload = get_json(RECALL_API, {
        "where": 'sous_categorie_produit = "fruits et légumes"',
        "order_by": "date_publication DESC",
        "limit": "70"
    })
    rows = payload.get("results")
    if not isinstance(rows, list):
        raise ValueError("Structure API rappels non reconnue")
    seen = set()
    alerts = []
    for row in rows:
        if not isinstance(row, dict) or not recent(row.get("date_publication"), RECALL_DAYS):
            continue
        if clean(row.get("sous_categorie_produit")).casefold() != "fruits et légumes":
            continue
        identity = clean(row.get("numero_fiche") or row.get("rappel_guid") or row.get("id"))
        if not identity or identity in seen:
            continue
        link = clean(row.get("lien_vers_la_fiche_rappel"), 500)
        if not valid_url(link, "rappel.conso.gouv.fr"):
            continue
        title = clean(row.get("libelle") or row.get("modeles_ou_references"), 115)
        if not title:
            continue
        brand = clean(row.get("marque_produit"), 55)
        reason = clean(row.get("risques_encourus") or row.get("motif_rappel"), 135)
        alerts.append({
            "type": "recall",
            "id": identity,
            "title": title,
            "description": (" · ".join(x for x in [brand, reason] if x))[:170],
            "date": day(row["date_publication"]).isoformat(),
            "url": link,
            "source": "RappelConso"
        })
        seen.add(identity)
    alerts.sort(key=lambda item: item["date"], reverse=True)
    return alerts[:12]

def amount(value):
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    text = clean(value, 55)
    text = re.sub(r"[^0-9,.\-]", "", text)
    if not text:
        return None
    if "," in text and "." in text:
        text = text.replace(",", "") if text.rfind(".") > text.rfind(",") else text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        number = float(text)
    except ValueError:
        return None
    return number if math.isfinite(number) and number > 0 else None

def price_rows():
    period = {
        "memberStateCodes": "FR",
        "beginDate": (TODAY - dt.timedelta(days=31)).strftime("%d/%m/%Y"),
        "endDate": TODAY.strftime("%d/%m/%Y")
    }
    # Certains serveurs demandent un filtre produit ; ne pas considérer
    # une erreur HTTP comme une absence de mouvement de prix.
    attempts = [dict(period, products="Oranges"), period]
    payload = None
    problems = []
    for params in attempts:
        try:
            candidate = get_json(PRICE_API, params, maximum=16_000_000)
            if isinstance(candidate, dict):
                candidate = candidate.get("results", candidate.get("data", candidate.get("items")))
            if isinstance(candidate, list) and candidate:
                payload = candidate
                print("EU columns: " + ", ".join(sorted(candidate[0].keys())) if isinstance(candidate[0], dict) else "EU list non objet")
                print("EU sample: " + json.dumps(candidate[0], ensure_ascii=False)[:700])
                break
        except Exception as exc:
            problems.append(str(exc))
    if payload is None:
        raise ValueError("Aucune réponse de prix exploitable : " + " | ".join(problems[:4]))
    if isinstance(payload, dict):
        payload = payload.get("results", payload.get("data", payload.get("items")))
    if not isinstance(payload, list):
        raise ValueError("Format du cours européen non reconnu")
    groups = defaultdict(list)
    accepted = 0
    for record in payload:
        if not isinstance(record, dict):
            continue
        country = clean(record.get("memberStateCode") or record.get("memberStateCodes") or record.get("memberStateName")).casefold()
        if country not in ("fr", "france"):
            continue
        date = day(record.get("endDate") or record.get("beginDate"))
        value = amount(record.get("price"))
        if not date or not value or date > TODAY or TODAY - date > dt.timedelta(days=28):
            continue
        name = clean(record.get("productName") or record.get("product") or record.get("productCode"), 55)
        variety = clean(record.get("variety") or record.get("varietyName"), 50)
        stage = clean(record.get("productStage") or record.get("stageName") or record.get("stage") or record.get("priceStage"), 50)
        unit = clean(record.get("unit"), 30)
        # Eviter tout mélange de variété, stade ou unité.
        if not name or not stage or not unit:
            continue
        accepted += 1
        key = (name, variety, stage, unit)
        groups[key].append((date, value))
    if not accepted:
        raise ValueError("Aucune série française comparable dans la réponse")
    alerts = []
    for (name, variety, stage, unit), measures in groups.items():
        unique = dict(measures)
        series = sorted(unique.items(), reverse=True)
        if len(series) < 2:
            continue
        newest_day, newest = series[0]
        if TODAY - newest_day > dt.timedelta(days=PRICE_DAYS):
            continue
        candidates = [(d, p) for d, p in series[1:] if 4 <= (newest_day - d).days <= 15]
        if not candidates:
            continue
        previous_day, previous = min(candidates, key=lambda v: abs((newest_day - v[0]).days - 7))
        if previous <= 0:
            continue
        change = 100 * (newest - previous) / previous
        if abs(change) < 20 or abs(change) > 300:
            continue
        title = " ".join(part for part in (name, variety) if part)
        alerts.append({
            "type": "price",
            "id": "price:" + "|".join((name, variety, stage, unit)),
            "title": title[:100],
            "description": (stage + " · " + unit + " · " + str((newest_day - previous_day).days) + " jours")[:160],
            "date": newest_day.isoformat(),
            "change": round(change, 1),
            "url": PRICE_SOURCE,
            "source": "Commission européenne"
        })
    alerts.sort(key=lambda row: abs(row["change"]), reverse=True)
    return alerts[:10]


# V37.65 — Signaux d'offre des publications publiques et risques hydriques.
# Une note de marché peut confirmer une offre réduite, jamais une rupture magasin.
from html.parser import HTMLParser

FRANCEAGRIMER_NOTE = "https://www.franceagrimer.fr/chiffre-et-analyses-economiques/note-de-conjoncture-mensuelle-fruits-legumes-et-pommes-de-terre"
VIGIEAU_ZONES_AUBE = "https://api.vigieau.beta.gouv.fr/api/zones/departement/10"
VIGIEAU_SITE = "https://vigieau.gouv.fr/"
SUPPLY_DAYS = 35

class _ArticleText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.ignored = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.ignored += 1
        if not self.ignored and tag in ("p", "div", "h1", "h2", "h3", "h4", "li", "br"):
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self.ignored = max(0, self.ignored - 1)
        if not self.ignored and tag in ("p", "div", "h1", "h2", "h3", "h4", "li"):
            self.parts.append(" ")

    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(data)

def supply_feed():
    req = urllib.request.Request(FRANCEAGRIMER_NOTE, headers={
        "User-Agent": "Mozilla/5.0 (compatible; InventairesU/1.0)",
        "Accept": "text/html"
    })
    with urllib.request.urlopen(req, timeout=15) as response:
        if response.status != 200:
            raise ValueError("FranceAgriMer HTTP " + str(response.status))
        content = response.read(2_000_001)
        if len(content) > 2_000_000:
            raise ValueError("Page FranceAgriMer trop longue")
        markup = content.decode("utf-8", errors="replace")
    parser = _ArticleText()
    parser.feed(markup)
    article = re.sub(r"\s+", " ", " ".join(parser.parts))
    published = re.search(r"date\s+de\s+publication\s*:\s*(\d{2}/\d{2}/\d{4})", article, re.I)
    if not published:
        raise ValueError("Date de publication non identifiable")
    published_day = day(published.group(1))
    if not published_day or not recent(published_day.isoformat(), SUPPLY_DAYS):
        return []
    heading = re.search(r"points\s+cl[eé]s\s+de\s+la\s+note\s+de\s+conjoncture\s+mensuelle", article, re.I)
    if not heading:
        raise ValueError("La section récente 'Points clés' est introuvable")
    # Ne jamais aller jusqu'aux anciennes éditions ou PDF historiques.
    summary = article[heading.start():heading.start() + 4100]
    end = re.search(r"concernant\s+le\s+commerce\s+ext[eé]rieur", summary, re.I)
    if end:
        summary = summary[:end.start()]
    # Expressions précises ; pas d'inférence à partir d'une hausse des cours.
    rules = (
        ("Carottes et poireaux",
         r"disponibilit[eé]s\s+en\s+carottes\s+et\s+en\s+poireaux.{0,95}?inf[eé]rieures",
         "Disponibilités inférieures aux niveaux habituels · note mensuelle",
         "Offre réduite"),
        ("Pommes",
         r"en\s+pommes?\s+les\s+disponibilit[eé]s\s+restent\s+limit[eé]es",
         "Disponibilités limitées signalées dans la note mensuelle",
         "Offre réduite"),
        ("Noix",
         r"r[eé]coltes\s+de\s+noix\s+sont\s+p[eé]nalis[eé]es\s+par\s+la\s+canicule\s+et\s+la\s+s[eé]cheresse",
         "Récoltes pénalisées par la chaleur et la sécheresse",
         "Récolte affectée"),
    )
    results = []
    for name, phrase, description, label in rules:
        if re.search(phrase, summary, re.I):
            results.append({
                "type": "supply", "id": "franceagrimer:" + published_day.isoformat() + ":" + name.casefold(),
                "title": name, "description": description,
                "date": published_day.isoformat(), "url": FRANCEAGRIMER_NOTE,
                "source": "FranceAgriMer", "label": label
            })
    return results

def water_feed():
    payload = get_json(VIGIEAU_ZONES_AUBE, {}, maximum=3_000_000)
    if isinstance(payload, dict):
        payload = payload.get("zones", payload.get("results"))
    if not isinstance(payload, list):
        raise ValueError("Structure VigiEau non reconnue")
    severity = {"crise": 2, "alerte_renforcee": 1}
    affected = []
    for zone in payload:
        if not isinstance(zone, dict):
            continue
        dep = str(zone.get("departement") or zone.get("departementCode") or "10")
        if dep not in ("10", "Aube"):
            continue
        level = str(zone.get("niveauGravite") or zone.get("niveau_gravite") or "").lower()
        if level in severity:
            affected.append(level)
    if not affected:
        return []
    worst = max(affected, key=lambda level: severity[level])
    level_text = "crise" if worst == "crise" else "alerte renforcée"
    return [{
        "type": "water", "id": "vigieau:aube:" + worst,
        "title": "Sécheresse · Aube",
        "description": "Certaines zones en " + level_text + " · risque hydrique, pas une pénurie de produits",
        "date": TODAY.isoformat(), "url": VIGIEAU_SITE,
        "source": "VigiEau", "label": "Risque eau"
    }]

def main():
    existing = {}
    if OUT.exists():
        try:
            existing = json.loads(OUT.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            pass
    output = {
        "schema": 1,
        "generatedAt": iso_now(),
        "recalls": existing.get("recalls", []),
        "prices": existing.get("prices", []),
        "shortages": [],
        "supply": existing.get("supply", []),
        "water": existing.get("water", []),
        "checks": dict(existing.get("checks") or {}),
    }
    ok = 0
    for name, source in (("recalls", recall_feed), ("prices", price_rows),
                         ("supply", supply_feed), ("water", water_feed)):
        try:
            output[name] = source()
            output["checks"][name] = iso_now()
            ok += 1
            print(name + ": " + str(len(output[name])) + " alerte(s) validée(s)")
        except Exception as error:
            print(name + ": source indisponible : " + str(error), file=sys.stderr)
    # Les pénuries exigent un constat officiel explicite et daté.
    # Aucun indicateur de prix seul ne permet de déclarer une pénurie.
    output["checks"]["shortages"] = None
    for name, days in (("recalls", RECALL_DAYS), ("prices", PRICE_DAYS),
                       ("supply", SUPPLY_DAYS), ("water", 2)):
        output[name] = [
            item for item in output.get(name, [])
            if isinstance(item, dict) and recent(item.get("date"), days)
        ]
    if not ok:
        print("Aucune source actualisée : conservation des contrôles précédents.")
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
