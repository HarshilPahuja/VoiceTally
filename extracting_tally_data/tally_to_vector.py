import requests
import xml.etree.ElementTree as ET
import re
import json
import os
import hashlib
from datetime import datetime

import chromadb

# ---------------- CONFIG ---------------- #

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

with open(CONFIG_PATH, "r") as f:
    config = json.load(f)

TALLY_URL = config["tally"]["url"]
COMPANY_NAME = config["tally"]["company_name"]

CHROMA_DIR = os.path.join(BASE_DIR, "chroma_db")

# ---------------- CHROMA SETUP ---------------- #

client = chromadb.PersistentClient(path=CHROMA_DIR)

collections = {
    "day_book": client.get_or_create_collection("day_book"),
    "sales": client.get_or_create_collection("sales"),
    "ledgers": client.get_or_create_collection("ledgers"),
    "groups": client.get_or_create_collection("groups"),
    "stock_items": client.get_or_create_collection("stock_items"),
}

# ---------------- HELPERS ---------------- #

def clean_xml(raw_xml: str) -> str:
    raw_xml = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", raw_xml)
    raw_xml = re.sub(r"&#x?[0-9A-Fa-f]+;", "", raw_xml)
    return raw_xml

def tally_request(report_name: str):
    try:
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
            print(f"⚠️ Tally error for {report_name}: {response.status_code}")
            return None

        cleaned = clean_xml(response.text)

        try:
            return ET.fromstring(cleaned)
        except ET.ParseError:
            print(f"⚠️ XML parse failed for {report_name}")
            return None

    except Exception as e:
        print(f"⚠️ Request failed for {report_name}: {e}")
        return None

def generate_id(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()

# ---------------- GROUPS ---------------- #

def extract_groups():
    root = tally_request("List of Groups")
    if root is None:
        print("⚠️ Skipping Groups")
        return

    docs, meta, ids = [], [], []

    for i, group in enumerate(root.findall(".//GROUP")):
        name = group.findtext("NAME", "").strip()
        parent = group.findtext("PARENT", "").strip()

        if not name:
            continue

        doc = f"Group {name} under {parent}"

        docs.append(doc)
        meta.append({"name": name, "parent": parent})
        ids.append(f"group_{i}_{name}")

    if docs:
        collections["groups"].upsert(documents=docs, metadatas=meta, ids=ids)
        print(f"Upserted {len(docs)} groups")
    else:
        print("⚠️ No group data found")

# ---------------- LEDGERS ---------------- #

def extract_ledgers():
    root = tally_request("List of Accounts")
    if root is None:
        print("⚠️ Skipping Ledgers")
        return

    docs, meta, ids = [], [], []

    for i, ledger in enumerate(root.findall(".//LEDGER")):
        name = ledger.findtext("NAME", "").strip()
        parent = ledger.findtext("PARENT", "").strip()

        if not name:
            continue

        doc = f"Ledger {name} under group {parent}"

        docs.append(doc)
        meta.append({"name": name, "group": parent})
        ids.append(f"ledger_{i}_{name}")

    if docs:
        collections["ledgers"].upsert(documents=docs, metadatas=meta, ids=ids)
        print(f"Upserted {len(docs)} ledgers")
    else:
        print("⚠️ No ledger data found")

# ---------------- STOCK ITEMS ---------------- #

def extract_stock_items():
    root = tally_request("List of Stock Items")
    if root is None:
        print("⚠️ Skipping Stock Items")
        return

    docs, meta, ids = [], [], []

    for i, item in enumerate(root.findall(".//STOCKITEM")):
        name = item.findtext("NAME", "").strip()
        group = item.findtext("PARENT", "").strip()

        if not name:
            continue

        doc = f"Stock item {name} in group {group}"

        docs.append(doc)
        meta.append({"name": name, "group": group})
        ids.append(f"stock_{i}_{name}")

    if docs:
        collections["stock_items"].upsert(documents=docs, metadatas=meta, ids=ids)
        print(f"Upserted {len(docs)} stock items")
    else:
        print("⚠️ No stock items found")

# ---------------- DAY BOOK ---------------- #

def extract_day_book():
    root = tally_request("Day Book")
    if root is None:
        print("⚠️ Skipping Day Book")
        return

    docs, metadatas, ids = [], [], []
    sales_docs, sales_meta, sales_ids = [], [], []
    processed_sales = set()

    for voucher in root.findall(".//VOUCHER"):
        v_type = voucher.get("VCHTYPE", "")
        v_number = voucher.findtext("VOUCHERNUMBER", "")
        v_date = voucher.findtext("DATE", "")
        party = voucher.findtext("PARTYLEDGERNAME", "")
        narration = voucher.findtext("NARRATION", "")

        for entry in voucher.findall(".//ALLLEDGERENTRIES.LIST"):
            ledger = entry.findtext("LEDGERNAME", "")

            try:
                amount = float(entry.findtext("AMOUNT", "0") or 0)
            except:
                amount = 0

            doc = f"{v_type} voucher {v_number} on {v_date} for {party}. Ledger: {ledger}. Amount: {amount}. Narration: {narration}"

            docs.append(doc)
            metadatas.append({
                "voucher_type": v_type,
                "voucher_number": v_number,
                "party": party,
                "ledger": ledger,
                "amount": amount
            })
            ids.append(generate_id(doc))

            # SALES extraction
            if "sales" in v_type.lower():
                if ledger == party and v_number not in processed_sales:
                    try:
                        date_obj = datetime.strptime(v_date, "%Y%m%d")
                        formatted_date = date_obj.strftime("%Y-%m-%d")

                        sales_doc = f"Sales invoice {v_number} on {formatted_date} for customer {party} amount {abs(amount)}"

                        sales_docs.append(sales_doc)
                        sales_meta.append({
                            "customer": party,
                            "amount": abs(amount),
                            "date": formatted_date
                        })
                        sales_ids.append(f"sales_{v_number}")
                        processed_sales.add(v_number)
                    except Exception as e:
                        print(f"⚠️ Sales parse error: {e}")

    if docs:
        collections["day_book"].upsert(documents=docs, metadatas=metadatas, ids=ids)
        print(f"Upserted {len(docs)} day_book records")
    else:
        print("⚠️ No day book data found")

    if sales_docs:
        collections["sales"].upsert(documents=sales_docs, metadatas=sales_meta, ids=sales_ids)
        print(f"Upserted {len(sales_docs)} sales records")
    else:
        print("⚠️ No sales data found")

# ---------------- MAIN ---------------- #

if __name__ == "__main__":
    print(f"Extracting → ChromaDB for {COMPANY_NAME}")

    extract_groups()
    extract_ledgers()
    extract_stock_items()
    extract_day_book()

    print("Data stored in ChromaDB ")