import requests
import xml.etree.ElementTree as ET
import re
import csv
import json
import os
import sys
from datetime import datetime


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
        try:
                response = requests.post(TALLY_URL, data=xml, timeout=15)
                response.raise_for_status()
                cleaned = clean_xml(response.text)
                return ET.fromstring(cleaned)
        except requests.ConnectionError:
                print("[ERROR] Could not connect to Tally at", TALLY_URL)
                sys.exit(1)
        except Exception as e:
                print(f"[ERROR] Tally request failed: {e}")
                sys.exit(1)

def extract_sales_for_backend(day_book_rows):
    """
    Filters Day Book for 'Sales' vouchers and generates a simplified sales.csv
    compatible with the voicetally-backend.
    Expected Backend Schema: date, customer, amount, status
    """
    sales_rows = []
    
    # day_book_rows structure: 
    # [voucher_type, voucher_number, voucher_date, party_ledger, ledger_name, amount, dr_cr, narration]
    # indices: 0=type, 1=number, 2=date, 3=party, 4=ledger, 5=amount, 6=drcr, 7=narration

    # We want unique vouchers to avoid summing up line items (Tax + Sales + etc).
    # Since we want the total invoice value, we should look for the entry that represents the Party's Debit.
    # In a typical Sales voucher:
    # - Party Ledger is Debited (Total Amount)
    # - Sales/Tax Ledgers are Credited (Split Amounts)
    
    # We will track processed voucher numbers to avoid duplicates
    processed_vouchers = set()

    for row in day_book_rows:
        v_type = row[0].lower()
        v_number = row[1]
        
        # Filter for Sales vouchers. 
        if "sales" in v_type:
             # Check if we already processed this voucher
             if v_number in processed_vouchers:
                 continue

             date_str = row[2] # YYYYMMDD
             customer = row[3]
             # logic: we want the total amount.
             # In extract_day_book, we are iterating ledger entries.
             # If we just take the first entry we encounter for this voucher, 
             # it might be the Sales Ledger (sub-amount) or the Party Ledger (total amount)?
             # 'party_ledger' (row[3]) is the common header value.
             # 'ledger_name' (row[4]) is the specific line item.
             
             # If ledger_name == party_ledger, then this line is likely the Party's debit => Total Amount.
             # However, sometimes Party Ledger isn't in ALLLEDGERENTRIES if it's a simple headers-only view, 
             # but usually it is in Tally XML "Day Book" export mode.
             
             # Fallback/Simplification: 
             # If we can't be sure which line is the total, this script might be inaccurate for totals.
             # BUT, for the Pilot/Demo, let's assume the first line we see for a Sales voucher 
             # is roughly indicative or we accept the risk.
             
             # BETTER LOGIC:
             # Find the row where row[4] (ledger_name) == row[3] (party_ledger).
             # This confirms it's the Party's entry -> Total Bill Amount.
             
             if row[4] == row[3]:
                 try:
                    # Format Date: YYYYMMDD -> YYYY-MM-DD
                    date_obj = datetime.strptime(date_str, "%Y%m%d")
                    formatted_date = date_obj.strftime("%Y-%m-%d")
                    
                    amount = row[5]
                    status = "Paid" # Default
                    
                    sales_rows.append([formatted_date, customer, amount, status])
                    processed_vouchers.add(v_number)
                 except ValueError:
                    # If date parsing fails, skip or keep original
                    pass
    
    # If we found no matches with exact party name match (sometimes case differs or alias used),
    # we might fallback to just taking the first entry of that voucher? 
    # Let's keep strict for now to avoid duplicates.
    
    path = os.path.join(OUTPUT_DIR, "sales.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "customer", "amount", "status"])
        writer.writerows(sales_rows)
    print(f"Generated sales.csv with {len(sales_rows)} rows.")


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
    
    # Create the specific file for the backend
    extract_sales_for_backend(rows)

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
# MAIN

def _test_extract_sales_for_backend():
    # Simple test for extraction logic
    dummy_rows = [
        ["Sales", "V1", "20231001", "Customer A", "Customer A", 1180.0, "DR", "Sold items"],
        ["Sales", "V1", "20231001", "Customer A", "Sales Account", 1000.0, "CR", "Sold items"],
        ["Sales", "V1", "20231001", "Customer A", "GST Output", 180.0, "CR", "Sold items"],
        ["Receipt", "V2", "20231002", "Customer A", "Cash", 1180.0, "DR", "Payment received"],
        ["Sales", "V3", "20231005", "Customer B", "Customer B", 500.0, "DR", "Small sale"],
    ]
    extract_sales_for_backend(dummy_rows)
    print("[TEST] sales.csv generated for test data.")

if __name__ == "__main__":
    print(f"Extracting data for company: {COMPANY_NAME}")
    try:
        extract_groups()
        extract_ledgers()
        extract_stock_groups()
        extract_stock_items()
        extract_units()
        extract_day_book()
        print("Extraction completed successfully")
        print(f"CSVs generated in: {OUTPUT_DIR}")
    except Exception as e:
        print(f"[FATAL] Extraction failed: {e}")
    # Run test
    _test_extract_sales_for_backend()
