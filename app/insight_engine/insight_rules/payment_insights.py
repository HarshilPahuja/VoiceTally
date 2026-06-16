def generate_payment_insights(data: dict) -> dict:
    """
    Generates insights related to outstanding payments.
    Expects data to contain:
    - total_outstanding
    - overdue_count (optional)
    """

    insights = {}

    total_outstanding = data.get("total_outstanding")
    if total_outstanding is not None:
        insights["total_outstanding"] = total_outstanding

    overdue_count = data.get("overdue_count")
    if overdue_count is not None and overdue_count > 0:
        insights["overdue_customers"] = overdue_count

    return insights
