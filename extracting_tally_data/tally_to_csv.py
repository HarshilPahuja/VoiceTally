import requests
import xml.etree.ElementTree as ET
import re
import csv
import json
import os
import sys


# LOAD CONFIG (relative to script location)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

try:
    with open(CONFIG_PATH, "r") as f:
        config = json.load(f)
except FileNotFoundError:
    print("config.json not found")
    sys.exit(1)

TALLY_URL = config["tally"]["url"]
COMPANY_NAME = config["tally"]["company_name"]
OUTPUT_DIR = os.path.join(BASE_DIR, config["output"]["directory"])

os.makedirs(OUTPUT_DIR, exist_ok=True)

# COMMON HELPERS
def clean_xml(raw_xml: str) -> str:
    raw_xml = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", raw_xml)
    raw_xml = re.sub(r"&#x?[0-9A-Fa-f]+;", "", raw_xml)
    return raw_xml

def tally_request(report_name: str) -> ET.Element:
    xml = f"""
    <ENVELOPE>
      <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
      </HEADER>
      <BODY>
        <EXPORTDATA>
          <REQUESTDESC>
            <REPORTNAME>{report_name}</REPORTNAME>
            <STATICVARIABLES>
              <SVCURRENTCOMPANY>{COMPANY_NAME}</SVCURRENTCOMPANY>
              <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
          </REQUESTDESC>
        </EXPORTDATA>
      </BODY>
    </ENVELOPE>
    """

    response = requests.post(TALLY_URL, data=xml, timeout=15)
    if response.status_code != 200:
        raise Exception(f"Tally returned status {response.status_code}")

    cleaned = clean_xml(response.text)
    return ET.fromstring(cleaned)

# DAY BOOK
def extract_day_book():
    root = tally_request("Day Book")
    rows = []

    for voucher in root.findall(".//VOUCHER"):
        voucher_type = voucher.get("VCHTYPE", "")
        voucher_number = voucher.findtext("VOUCHERNUMBER", "")
        voucher_date = voucher.findtext("DATE", "")
        party_ledger = voucher.findtext("PARTYLEDGERNAME", "")
        narration = voucher.findtext("NARRATION", "")

        for entry in voucher.findall(".//ALLLEDGERENTRIES.LIST"):
            ledger_name = entry.findtext("LEDGERNAME", "")
            amount_text = entry.findtext("AMOUNT", "0")
            amount = float(amount_text) if amount_text else 0
            dr_cr = "DR" if amount > 0 else "CR"

            rows.append([
                voucher_type,
                voucher_number,
                voucher_date,
                party_ledger,
                ledger_name,
                abs(amount),
                dr_cr,
                narration
            ])

    path = os.path.join(OUTPUT_DIR, "day_book.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "voucher_type",
            "voucher_number",
            "voucher_date",
            "party_ledger",
            "ledger_name",
            "amount",
            "dr_cr",
            "narration"
        ])
        writer.writerows(rows)

# LEDGERS
def extract_ledgers():
    root = tally_request("List of Accounts")
    rows = []

    for ledger in root.findall(".//LEDGER"):
        rows.append([
            ledger.findtext("NAME", ""),
            ledger.findtext("PARENT", ""),
            ledger.findtext("OPENINGBALANCE", ""),
            ledger.findtext("CLOSINGBALANCE", ""),
            ledger.findtext("ISBILLWISEON", ""),
            ledger.findtext("ISCOSTCENTRESON", "")
        ])

    path = os.path.join(OUTPUT_DIR, "ledgers.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "ledger_name",
            "parent_group",
            "opening_balance",
            "closing_balance",
            "is_billwise_on",
            "is_cost_center_on"
        ])
        writer.writerows(rows)

#  GROUPS
def extract_groups():
    root = tally_request("List of Groups")
    rows = []

    for group in root.findall(".//GROUP"):
        rows.append([
            group.findtext("NAME", ""),
            group.findtext("PARENT", ""),
            group.findtext("PRIMARYGROUP", ""),
            group.findtext("NATUREOFGROUP", "")
        ])

    path = os.path.join(OUTPUT_DIR, "groups.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "group_name",
            "parent_group",
            "primary_group",
            "nature_of_group"
        ])
        writer.writerows(rows)

# STOCK ITEMS
def extract_stock_items():
    root = tally_request("List of Stock Items")
    rows = []

    for item in root.findall(".//STOCKITEM"):
        rows.append([
            item.findtext("NAME", ""),
            item.findtext("PARENT", ""),
            item.findtext("BASEUNITS", ""),
            item.findtext("OPENINGBALANCE", ""),
            item.findtext("OPENINGVALUE", ""),
            item.findtext("HSNCODE", "")
        ])

    path = os.path.join(OUTPUT_DIR, "stock_items.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "stock_item_name",
            "stock_group",
            "base_unit",
            "opening_quantity",
            "opening_value",
            "gst_hsn_code"
        ])
        writer.writerows(rows)

# STOCK GROUPS
def extract_stock_groups():
    root = tally_request("List of Stock Groups")
    rows = []

    for group in root.findall(".//STOCKGROUP"):
        rows.append([
            group.findtext("NAME", ""),
            group.findtext("PARENT", "")
        ])

    path = os.path.join(OUTPUT_DIR, "stock_groups.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "stock_group_name",
            "parent_stock_group"
        ])
        writer.writerows(rows)

# UNITS
def extract_units():
    root = tally_request("List of Units")
    rows = []

    for unit in root.findall(".//UNIT"):
        rows.append([
            unit.findtext("NAME", ""),
            unit.findtext("FORMALNAME", ""),
            unit.findtext("DECIMALPLACES", "")
        ])

    path = os.path.join(OUTPUT_DIR, "units.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "unit_name",
            "formal_name",
            "decimal_places"
        ])
        writer.writerows(rows)

# MAIN
if __name__ == "__main__":
    print(f"Extracting data for company: {COMPANY_NAME}")

    extract_groups()
    extract_ledgers()
    extract_stock_groups()
    extract_stock_items()
    extract_units()
    extract_day_book()

    print("Extraction completed successfully")
    print(f"CSVs generated in: {OUTPUT_DIR}")
