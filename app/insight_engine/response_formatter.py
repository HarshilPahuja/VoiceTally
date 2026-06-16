def format_insight_response(insights: dict) -> str:
    """
    Converts structured insights into plain English.
    """

    responses = []

    if "total_sales" in insights:
        responses.append(
            f"Your total sales were ₹{insights['total_sales']}."
        )

    if "sales_change_percentage" in insights:
        pct = insights["sales_change_percentage"]
        if pct >= 0:
            responses.append(f"Sales increased by {pct} percent.")
        else:
            responses.append(f"Sales decreased by {abs(pct)} percent.")

    if "total_outstanding" in insights:
        responses.append(
            f"You have ₹{insights['total_outstanding']} in outstanding payments."
        )

    if "low_stock_count" in insights:
        responses.append(
            f"{insights['low_stock_count']} items are running low on stock."
        )

    if not responses:
        return "No significant insights available."

    return " ".join(responses)
