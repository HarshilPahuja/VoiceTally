def generate_sales_insights(data: dict) -> dict:
    """
    Generates insights related to sales performance.
    Expects data to contain:
    - total_sales
    - previous_total_sales (optional)
    - transaction_count (optional)
    """

    insights = {}

    total_sales = data.get("total_sales")
    previous_sales = data.get("previous_total_sales")

    if total_sales is None:
        return insights

    insights["total_sales"] = total_sales

    if previous_sales is not None:
        if previous_sales > 0:
            change_pct = ((total_sales - previous_sales) / previous_sales) * 100
            insights["sales_change_percentage"] = round(change_pct, 2)

    transaction_count = data.get("transaction_count")
    if transaction_count is not None:
        insights["transaction_count"] = transaction_count

    return insights
