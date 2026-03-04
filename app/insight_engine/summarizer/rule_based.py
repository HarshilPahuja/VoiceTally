def generate_rule_based_summary(insights: dict) -> str:
    """
    Generates a short business summary using rule-based logic.
    """

    summary_parts = []

    if "total_sales" in insights:
        summary_parts.append(
            f"Total sales were ₹{insights['total_sales']}."
        )

    if "sales_change_percentage" in insights:
        pct = insights["sales_change_percentage"]
        if pct >= 0:
            summary_parts.append(
                f"Sales increased by {pct}% compared to the previous period."
            )
        else:
            summary_parts.append(
                f"Sales decreased by {abs(pct)}% compared to the previous period."
            )

    if "total_outstanding" in insights:
        summary_parts.append(
            f"Outstanding payments amount to ₹{insights['total_outstanding']}."
        )

    if "low_stock_count" in insights:
        summary_parts.append(
            f"{insights['low_stock_count']} items are low on stock."
        )

    if not summary_parts:
        return "No major business changes detected."

    return " ".join(summary_parts)
