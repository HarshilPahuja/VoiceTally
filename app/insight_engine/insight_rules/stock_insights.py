def generate_stock_insights(data: dict) -> dict:
    """
    Generates insights related to inventory.
    Expects data to contain:
    - low_stock_items (list)
    """

    insights = {}

    low_stock_items = data.get("low_stock_items")
    if low_stock_items:
        insights["low_stock_items"] = low_stock_items
        insights["low_stock_count"] = len(low_stock_items)

    return insights
