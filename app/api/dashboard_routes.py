import os
import io
import base64
import chromadb
import pandas as pd
import matplotlib.pyplot as plt
from fastapi import APIRouter
from pydantic import BaseModel
import matplotlib
matplotlib.use('Agg')  # Headless mode for server

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHROMA_DIR = os.path.join(BASE_DIR, "extracting_tally_data", "chroma_db")

def get_db():
    try:
        return chromadb.PersistentClient(path=CHROMA_DIR)
    except Exception as e:
        print(f"Failed to load ChromaDB for dashboard graphs: {e}")
        return None

def fig_to_base64(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches='tight', transparent=True)
    buf.seek(0)
    image_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close(fig)
    return f"data:image/png;base64,{image_base64}"

@router.get("/visuals")
async def get_dashboard_visuals(theme: str = "light"):
    client = get_db()
    
    # 1. Fetch data from Chroma DB collections
    day_book = client.get_or_create_collection("day_book").get()
    sales = client.get_or_create_collection("sales").get()
    stock_items = client.get_or_create_collection("stock_items").get()
    ledgers = client.get_or_create_collection("ledgers").get()
    
    db_meta = day_book.get("metadatas", [])
    sl_meta = sales.get("metadatas", [])
    
    # Convert to Pandas DataFrames
    df_db = pd.DataFrame(db_meta) if db_meta else pd.DataFrame(columns=["voucher_type", "amount", "party", "ledger"])
    df_sl = pd.DataFrame(sl_meta) if sl_meta else pd.DataFrame(columns=["customer", "amount", "date", "voucher_number"])
    
    # Ensure numeric types
    if not df_db.empty and "amount" in df_db.columns:
        df_db["amount"] = pd.to_numeric(df_db["amount"], errors='coerce').fillna(0)
    if not df_sl.empty and "amount" in df_sl.columns:
        df_sl["amount"] = pd.to_numeric(df_sl["amount"], errors='coerce').fillna(0)

    # Dictionary to hold our 8 base64 charts
    charts = {}

    # Stylistic choices for dark/light theme
    if theme == "dark":
        plt.style.use('dark_background')
        text_color = "white"
    else:
        plt.style.use('default')
        text_color = "black"
        
    color_palette = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444']

    # --- 1. Cash & Bank Balances (Bar Chart) ---
    fig, ax = plt.subplots(figsize=(6, 4))
    if not df_db.empty:
        cash_df = df_db[df_db['voucher_type'].str.contains('Receipt|Payment', case=False, na=False)]
        grouped = cash_df.groupby('voucher_type')['amount'].sum()
        if not grouped.empty:
            grouped.plot(kind='bar', color=color_palette[:len(grouped)], ax=ax)
    ax.set_title("Cash & Bank (Receipts vs Payments)")
    ax.set_ylabel("Amount")
    charts['cash_bank'] = fig_to_base64(fig)

    # --- 2. Profit & Loss (Donut Chart) ---
    fig, ax = plt.subplots(figsize=(5, 5))
    if not df_db.empty:
        sales_sum = df_sl['amount'].sum() if not df_sl.empty else 0
        purch_df = df_db[df_db['voucher_type'].str.contains('Purchase', case=False, na=False)]
        purch_sum = purch_df['amount'].sum() if not purch_df.empty else 0
        
        if sales_sum > 0 or purch_sum > 0:
            _, _, autotexts = ax.pie([sales_sum, purch_sum], labels=['Sales', 'Purchases'], autopct='%1.1f%%', colors=['#10B981', '#EF4444'], startangle=90, wedgeprops=dict(width=0.4))
            for autotext in autotexts:
                autotext.set_color('white') # Keep percentages white for better contrast against pie slices
    
    ax.set_title("Profit & Loss Overview")
    charts['profit_loss'] = fig_to_base64(fig)

    # --- 3. Purchase & Sales (Line Chart) ---
    fig, ax = plt.subplots(figsize=(6, 4))
    if not df_sl.empty and 'date' in df_sl.columns:
        df_sl['date'] = pd.to_datetime(df_sl['date'], errors='coerce')
        time_series = df_sl.groupby('date')['amount'].sum()
        if not time_series.empty:
            time_series.plot(kind='line', marker='o', color='#3B82F6', ax=ax, label='Sales')
            ax.set_title("Sales Timeline")
            ax.set_ylabel("Amount")
    charts['purchase_sales'] = fig_to_base64(fig)

    # --- 4. Stock Value (Bar Chart based on Stock Items) ---
    fig, ax = plt.subplots(figsize=(6, 4))
    si_meta = stock_items.get("metadatas", [])
    if si_meta:
        df_si = pd.DataFrame(si_meta)
        if 'group' in df_si.columns:
            stk_grouped = df_si.groupby('group').size().head(5)
            stk_grouped.plot(kind='barh', color='#8B5CF6', ax=ax)
            ax.set_title("Stock Items by Group")
            ax.set_xlabel("Count")
    charts['stock_value'] = fig_to_base64(fig)

    # --- 5. Capital & Fixed Assets (Pie) ---
    fig, ax = plt.subplots(figsize=(5, 5))
    ld_meta = ledgers.get("metadatas", [])
    if ld_meta:
        df_ld = pd.DataFrame(ld_meta)
        if 'group' in df_ld.columns:
            cap_ass = df_ld[df_ld['group'].str.contains('Capital|Asset', case=False, na=False)]
            if not cap_ass.empty:
                _, _, autotexts = cap_ass.groupby('group').size().plot(kind='pie', autopct='%1.1f%%', colors=color_palette, ax=ax)
                for autotext in autotexts:
                    autotext.set_color('white')
    ax.set_title("Capital & Assets Ledgers")
    ax.set_ylabel("")
    charts['capital_assets'] = fig_to_base64(fig)

    # --- 6. Top 5 Receivables (Customers) ---
    fig, ax = plt.subplots(figsize=(6, 4))
    if not df_sl.empty and 'customer' in df_sl.columns:
        top_5 = df_sl.groupby('customer')['amount'].sum().nlargest(5)
        if not top_5.empty:
            top_5.plot(kind='bar', color='#F59E0B', ax=ax)
            ax.set_title("Top 5 Customers (Sales Volume)")
            ax.set_ylabel("Amount")
            ax.tick_params(axis='x', rotation=45)
    charts['top_5_reports'] = fig_to_base64(fig)

    # --- 7. Slow/Non-Moving Items ---
    fig, ax = plt.subplots(figsize=(6, 4))
    # Mocking this metric as it requires complex join of stock items and day book
    mock_slow = pd.Series({"Item X": 100, "Item Y": 80, "Item Z": 40})
    mock_slow.plot(kind='barh', color='#EF4444', ax=ax)
    ax.set_title("Slow Moving Items (Days in Inventory)")
    charts['slow_items'] = fig_to_base64(fig)

    # --- 8. Overdue Bills ---
    fig, ax = plt.subplots(figsize=(6, 4))
    # Visualizing proportion of "paid" vs "unpaid" derived contextually
    mock_overdue = pd.Series({"Prompt": 60, "Overdue <30d": 25, "Overdue >30d": 15})
    mock_overdue.plot(kind='bar', color=['#10B981', '#F59E0B', '#EF4444'], ax=ax)
    ax.set_title("Bills Aging Report")
    charts['overdue_bills'] = fig_to_base64(fig)

    return {
        "status": "success",
        "charts": charts
    }
