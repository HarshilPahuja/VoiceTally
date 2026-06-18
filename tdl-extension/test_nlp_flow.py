"""
test_nlp_flow.py -- Smoke tests for the VoiceTally NLP layer
=============================================================

Tests entity extraction and intent classification WITHOUT requiring live
Tally or ChromaDB services. All tests are pure Python.

Run from the project root:
    venv\\Scripts\\python.exe tdl-extension/test_nlp_flow.py
    python tdl-extension/test_nlp_flow.py

Or with pytest (if installed):
    python -m pytest tdl-extension/test_nlp_flow.py -v
"""
# -*- coding: utf-8 -*-
import sys
import os

# Allow importing from the project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.nlp_engine.query_normalizer import normalize_query as normalize_text
from app.nlp_engine.intent_classifier import classify_intent_rules

def get_intent(text: str) -> str | None:
    return classify_intent_rules(text)[0]

from app.nlp_engine.entity_extractor import extract_entities_rules as extract_entities
from app.core import constants

PASS = 0
FAIL = 0


def check(label, condition, got=None):
    global PASS, FAIL
    if condition:
        print(f"  PASS  {label}")
        PASS += 1
    else:
        print(f"  FAIL  {label}  (got: {repr(got)})")
        FAIL += 1


# -------------------------------------------------------------------------
# 1. Intent Classification
# -------------------------------------------------------------------------
print("\n-- Intent Classification -----------------------------------------------")

cases = [
    ("show sales for last week",         constants.GET_SALES_SUMMARY),
    ("total revenue this week",          constants.GET_SALES_SUMMARY),
    ("outstanding payments",             constants.GET_OUTSTANDING_PAYMENTS),
    ("pending payment due amount",       constants.GET_OUTSTANDING_PAYMENTS),
    ("low stock items",                  constants.GET_LOW_STOCK_ITEMS),
    ("running low on inventory",         constants.GET_LOW_STOCK_ITEMS),
    ("today summary report",             constants.GET_DAILY_BUSINESS_SUMMARY),
    ("business today",                   constants.GET_DAILY_BUSINESS_SUMMARY),
    ("ledger balance for cash",          constants.GET_LEDGER_BALANCE),
    ("account balance",                  constants.GET_LEDGER_BALANCE),
    ("stock inquiry for cement",         constants.GET_STOCK_SUMMARY),
    ("inventory level",                  constants.GET_STOCK_SUMMARY),
    ("purchase overview",                constants.GET_PURCHASE_OVERVIEW),
    ("total expenses bought",            constants.GET_PURCHASE_OVERVIEW),
]

for query, expected_intent in cases:
    normalized = normalize_text(query)
    intent = get_intent(normalized)
    check(f'"{query}" -> {expected_intent}', intent == expected_intent, intent)


# -------------------------------------------------------------------------
# 2. Entity Extraction -- date ranges
# -------------------------------------------------------------------------
print("\n-- Date Entity Extraction -----------------------------------------------")

for query in [
    "show sales for last week",
    "today summary",
    "yesterday transactions",
    "this week purchases",
]:
    normalized = normalize_text(query)
    entities = extract_entities(normalized)
    has_date = "date_range" in entities
    check(f'"{query}" -> has date_range', has_date, entities)


# -------------------------------------------------------------------------
# 3. Entity Extraction -- business names
# -------------------------------------------------------------------------
print("\n-- Business Name Extraction ----------------------------------------------")

name_cases = [
    # (query, expected_key, expected_value_substring)
    ("show sales for abc traders",   "customer_name", "abc traders"),
    ("ledger transactions for cash", "ledger_name",   "cash"),
    ("balance of sundry debtors",    "ledger_name",   "sundry debtors"),
    ("stock inquiry for cement bags","item_name",     "cement bags"),
    ("how many steel left",          "item_name",     "steel"),
]

for query, key, expected_fragment in name_cases:
    normalized = normalize_text(query)
    entities = extract_entities(normalized)
    value = entities.get(key, "")
    found = expected_fragment in str(value).lower()
    check(f'"{query}" -> {key} contains "{expected_fragment}"', found, value)


# -------------------------------------------------------------------------
# Summary
# -------------------------------------------------------------------------
total = PASS + FAIL
status = "OK" if FAIL == 0 else "FAILED"
print(f"\n== Results: {PASS}/{total} passed ({status}) ==\n")
if FAIL > 0:
    sys.exit(1)
