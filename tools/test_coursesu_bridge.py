"""Tests unitaires locaux (aucune connexion externe)."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock

from coursesu_bridge import PriceError, build_feed, parse_product_page


class ParsingTest(unittest.TestCase):
    def test_price_per_kg(self):
        name, cents = parse_product_page('<h1 data-name-link="Carotte"></h1><span class="unit-info su-font">2,05 €/kg</span>')
        self.assertEqual((name, cents), ('Carotte', 205))

    def test_piece_price_not_confused(self):
        with self.assertRaises(PriceError):
            parse_product_page('<h1 data-name-link="Carotte"></h1><span class="sale-price">0,99 €</span><span class="unit-info">0,99 €/pièce</span>')

    def test_ambiguous_kg_prices_rejected(self):
        with self.assertRaises(PriceError):
            parse_product_page('<h1>Carotte</h1><span class="unit-info">1,99 €/kg</span><span class="unit-info">2,39 €/kg</span>')

    def test_no_title_rejected(self):
        with self.assertRaises(PriceError):
            parse_product_page('<span class="unit-info">2,05 €/kg</span>')

    def test_confirmed_mapping_feed(self):
        with TemporaryDirectory() as d:
            path = Path(d) / 'matches.json'
            path.write_text(json.dumps({"storeId":"superu-saintgermain","articles":[{"plu":"916","eanPrefix":"2824059","coursesuProductId":"123456","coursesuName":"Banane Cavendish"}]}), encoding='utf8')
            reader=Mock()
            reader.product.return_value=("Banane Cavendish", 99)
            f=build_feed(reader, path)
            self.assertEqual(f['articles'][0]['pricePerKg'], .99)
            self.assertEqual(f['articles'][0]['pricePerKgUnit'], 'EUR/kg')
            self.assertEqual(f['storeId'],'superu-saintgermain')

    def test_changed_product_blocked(self):
        with TemporaryDirectory() as d:
            path=Path(d)/'matches.json'
            path.write_text(json.dumps({"storeId":"superu-saintgermain","articles":[{"plu":"916","eanPrefix":"2824059","coursesuProductId":"123456","coursesuName":"Banane Cavendish"}]}),encoding='utf8')
            reader=Mock()
            reader.product.return_value=("Tomate grappe", 99)
            with self.assertRaises(PriceError):
                build_feed(reader, path)

if __name__ == '__main__':
    unittest.main()
