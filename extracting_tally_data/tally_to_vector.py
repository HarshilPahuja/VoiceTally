import requests
import xml.etree.ElementTree as ET
import re
import json
import os
import hashlib
from datetime import datetime

import chromadb

# ---------------- CONFIG ---------------- #

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

DEFAULT_CONFIG = {
    "tally": {"url": "http://localhost:9000", "company_name": "Demo Company"}
}

if os.path.exists(CONFIG_PATH):
    with open(CONFIG_PATH, "r") as f:
        config = json.load(f)
else:
    config = DEFAULT_CONFIG

TALLY_URL    = config["tally"]["url"]
COMPANY_NAME = config["tally"]["company_name"]
CHROMA_DIR   = os.path.join(BASE_DIR, "chroma_db")

# ---------------- CHROMA SETUP ---------------- #

chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
collections = {
    "day_book":    chroma_client.get_or_create_collection("day_book"),
    "sales":       chroma_client.get_or_create_collection("sales"),
    "ledgers":     chroma_client.get_or_create_collection("ledgers"),
    "groups":      chroma_client.get_or_create_collection("groups"),
    "stock_items": chroma_client.get_or_create_collection("stock_items"),
}

# ---------------- XML HELPERS ---------------- #

def clean_xml(raw: str) -> str:
    raw = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", raw)

    def drop_bad_dec(m):
        n = int(m.group(1))
        return "" if (n < 9 or n in (11, 12) or 14 <= n <= 31 or n == 127) else m.group(0)

    def drop_bad_hex(m):
        n = int(m.group(1), 16)
        return "" if (n < 9 or n in (11, 12) or 14 <= n <= 31 or n == 127) else m.group(0)

    raw = re.sub(r"&#(\d+);",           drop_bad_dec, raw)
    raw = re.sub(r"&#x([0-9A-Fa-f]+);", drop_bad_hex, raw)
    return raw


def post_xml(body: str) -> ET.Element | None:
    try:
        resp = requests.post(
            TALLY_URL,
            data=body.encode("utf-8"),
            headers={"Content-Type": "text/xml; charset=utf-8"},
            timeout=60,
        )
    except requests.exceptions.ConnectionError:
        print(f"❌  Cannot connect to Tally at {TALLY_URL}")
        return None
    except Exception as e:
        print(f"⚠️  Request error: {e}")
        return None

    raw     = resp.content.decode("utf-8", errors="replace")
    cleaned = clean_xml(raw)
    if not cleaned.strip():
        return None
    try:
        return ET.fromstring(cleaned)
    except ET.ParseError as e:
        print(f"⚠️  XML parse error: {e}")
        print("    Preview:", cleaned[:400])
        return None


def export_report(report_name: str, extra_vars: str = "") -> ET.Element | None:
    body = f"""<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>{report_name}</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>{COMPANY_NAME}</SVCURRENTCOMPANY>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          {extra_vars}
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>"""
    return post_xml(body)


def get_name(el: ET.Element) -> str:
    """NAME can be an XML attribute OR a child tag depending on Tally version."""
    return (el.get("NAME") or el.findtext("NAME") or "").strip()


def generate_id(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


# ---------------- ALL MASTERS (the response Tally keeps returning) ---------------- #

def fetch_all_masters() -> ET.Element | None:
    """
    Tally's gateway keeps routing requests to 'All Masters'.
    Lean into it — request it directly and parse everything from one call.
    This is actually more efficient: one request gets groups, ledgers,
    stock items, currencies, and cost centres all at once.
    """
    body = f"""<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>{COMPANY_NAME}</SVCURRENTCOMPANY>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>"""
    return post_xml(body)


# ---------------- GROUPS ---------------- #

def extract_groups(masters_root: ET.Element | None = None):
    print("\n🔄  Extracting Groups …")

    root   = masters_root if masters_root is not None else fetch_all_masters()
    groups = root.findall(".//GROUP") if root is not None else []

    if not groups:
        # Tally Prime uses TALLYMESSAGE wrappers; also try direct child
        groups = root.findall("GROUP") if root is not None else []

    if not groups:
        print("⚠️  No GROUP tags found in Tally response.")
        return

    docs, meta, ids = [], [], []
    for g in groups:
        name   = get_name(g)
        parent = (g.findtext("PARENT") or "").strip()
        if not name:
            continue
        docs.append(f"Group: {name}. Parent: {parent or 'top-level'}.")
        meta.append({"name": name, "parent": parent})
        ids.append(f"group_{generate_id(name)}")

    if docs:
        collections["groups"].upsert(documents=docs, metadatas=meta, ids=ids)
        print(f"✅  Upserted {len(docs)} groups")
    else:
        print("⚠️  GROUP elements found but all had empty NAME.")


# ---------------- LEDGERS ---------------- #

def extract_ledgers(masters_root: ET.Element | None = None):
    print("\n🔄  Extracting Ledgers …")

    root    = masters_root if masters_root is not None else fetch_all_masters()
    ledgers = root.findall(".//LEDGER") if root is not None else []

    if not ledgers:
        print("⚠️  No ledgers found.")
        return

    docs, meta, ids = [], [], []
    for l in ledgers:
        name   = get_name(l)
        parent = (l.findtext("PARENT") or "").strip()
        if not name:
            continue
        docs.append(f"Ledger: {name}. Group: {parent or 'Unknown'}.")
        meta.append({"name": name, "group": parent})
        ids.append(f"ledger_{generate_id(name)}")

    if docs:
        collections["ledgers"].upsert(documents=docs, metadatas=meta, ids=ids)
        print(f"✅  Upserted {len(docs)} ledgers")


# ---------------- STOCK ITEMS ---------------- #

def extract_stock_items(masters_root: ET.Element | None = None):
    print("\n🔄  Extracting Stock Items …")

    root  = masters_root if masters_root is not None else fetch_all_masters()
    items = root.findall(".//STOCKITEM") if root is not None else []

    if not items:
        print("    No stock items found (Demo Company may have none — skipping).")
        return

    docs, meta, ids = [], [], []
    for i in items:
        name  = get_name(i)
        group = (i.findtext("PARENT") or "").strip()
        if not name:
            continue
        docs.append(f"Stock item: {name}. Group: {group or 'Unknown'}.")
        meta.append({"name": name, "group": group})
        ids.append(f"stock_{generate_id(name)}")

    if docs:
        collections["stock_items"].upsert(documents=docs, metadatas=meta, ids=ids)
        print(f"✅  Upserted {len(docs)} stock items")


# ---------------- DAY BOOK ---------------- #

def extract_day_book():
    print("\n🔄  Extracting Day Book …")

    # Wide date range — covers Demo Company data regardless of year
    from_date = "20200101"
    to_date   = datetime.today().strftime("%Y%m%d")
    print(f"📅  Date range: {from_date} → {to_date}")

    extra = f"<SVFROMDATE>{from_date}</SVFROMDATE><SVTODATE>{to_date}</SVTODATE>"
    root  = export_report("Day Book", extra)

    if root is None:
        print("⚠️  Skipping Day Book — no response.")
        return

    vouchers = root.findall(".//VOUCHER")
    print(f"    Found {len(vouchers)} vouchers")

    if not vouchers:
        print("⚠️  No vouchers found.")
        return

    docs, metas, ids                  = [], [], []
    sales_docs, sales_meta, sales_ids = [], [], []
    processed: set[str]               = set()

    for v in vouchers:
        v_type    = (v.get("VCHTYPE") or v.findtext("VOUCHERTYPENAME") or "").strip()
        v_number  = (v.findtext("VOUCHERNUMBER") or "").strip()
        v_date    = (v.findtext("DATE") or "").strip()
        party     = (v.findtext("PARTYLEDGERNAME") or "").strip()
        narration = (v.findtext("NARRATION") or "").strip()

        # Try all known ledger entry container tag names
        entries = (
            v.findall(".//ALLLEDGERENTRIES.LIST") or
            v.findall(".//LEDGERENTRIES.LIST") or
            v.findall(".//ALLLEDGERENTRIES") or
            []
        )

        if entries:
            for entry in entries:
                ledger = (entry.findtext("LEDGERNAME") or "").strip()
                try:
                    amount = float(entry.findtext("AMOUNT") or 0)
                except (ValueError, TypeError):
                    amount = 0.0

                doc = (f"{v_type} voucher {v_number} on {v_date} for {party}. "
                       f"Ledger: {ledger}. Amount: {amount}. Narration: {narration}")
                docs.append(doc)
                metas.append({
                    "voucher_type": v_type, "voucher_number": v_number,
                    "party": party, "ledger": ledger, "amount": amount,
                })
                ids.append(generate_id(doc))
        else:
            # No ledger entries found — store voucher header at minimum
            doc = (f"{v_type} voucher {v_number} on {v_date} for {party}. "
                   f"Narration: {narration}")
            docs.append(doc)
            metas.append({
                "voucher_type": v_type, "voucher_number": v_number,
                "party": party, "ledger": "", "amount": 0.0,
            })
            ids.append(generate_id(doc))

        # Sales
        if "sales" in v_type.lower() and v_number and v_number not in processed:
            inv_amt = 0.0
            for entry in entries:
                if (entry.findtext("ISPARTYLEDGER") or "").strip().lower() == "yes":
                    try:
                        inv_amt = abs(float(entry.findtext("AMOUNT") or 0))
                    except (ValueError, TypeError):
                        pass
                    break
            if inv_amt == 0.0:
                for entry in entries:
                    try:
                        a = abs(float(entry.findtext("AMOUNT") or 0))
                        if a:
                            inv_amt = a
                            break
                    except (ValueError, TypeError):
                        pass

            try:
                fmt_date = datetime.strptime(v_date, "%Y%m%d").strftime("%Y-%m-%d")
            except ValueError:
                fmt_date = v_date

            sdoc = (f"Sales invoice {v_number} on {fmt_date} "
                    f"for customer {party} amount {inv_amt}")
            sales_docs.append(sdoc)
            sales_meta.append({"customer": party, "amount": inv_amt,
                                "date": fmt_date, "voucher_number": v_number})
            sales_ids.append(f"sales_{generate_id(v_number)}")
            processed.add(v_number)

    if docs:
        collections["day_book"].upsert(documents=docs, metadatas=metas, ids=ids)
        print(f"✅  Upserted {len(docs)} day_book records")
    else:
        print("⚠️  No day_book entries stored.")

    if sales_docs:
        collections["sales"].upsert(documents=sales_docs, metadatas=sales_meta, ids=sales_ids)
        print(f"✅  Upserted {len(sales_docs)} sales records")


# ---------------- MAIN ---------------- #

if __name__ == "__main__":
    print("🚀  Tally → ChromaDB pipeline")
    print(f"    Tally URL    : {TALLY_URL}")
    print(f"    Company      : {COMPANY_NAME}")
    print(f"    ChromaDB dir : {CHROMA_DIR}\n")

    # FIX: Fetch masters once, pass to all three extractors.
    # Avoids 3 redundant HTTP calls and works around Tally routing
    # 'List of Groups' → 'All Masters' silently.
    print("📦  Fetching all masters (groups + ledgers + stock items) …")
    masters = fetch_all_masters()

    if masters is not None:
        raw_preview = ET.tostring(masters, encoding="unicode")
        # Show which top-level tags came back so we know what Tally returned
        top_tags = list({child.tag for child in masters.iter() if child is not masters})[:20]
        print(f"    Tags found in response: {top_tags}")

    extract_groups(masters)
    extract_ledgers(masters)
    extract_stock_items(masters)
    extract_day_book()

    print("\n✅  Done.")
