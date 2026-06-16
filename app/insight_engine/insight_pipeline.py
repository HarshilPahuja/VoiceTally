from app.insight_engine.insight_rules.sales_insights import generate_sales_insights
from app.insight_engine.insight_rules.payment_insights import generate_payment_insights
from app.insight_engine.insight_rules.stock_insights import generate_stock_insights
from app.insight_engine.anomaly_detection.simple_thresholds import detect_anomalies


def run_insight_pipeline(intent: str, data: dict) -> dict:
    """
    Orchestrates insight generation based on intent.
    """

    insights = {}

    if intent == "GET_SALES_SUMMARY":
        insights.update(generate_sales_insights(data))

    elif intent == "GET_OUTSTANDING_PAYMENTS":
        insights.update(generate_payment_insights(data))

    elif intent == "GET_LOW_STOCK_ITEMS":
        insights.update(generate_stock_insights(data))

    anomalies = detect_anomalies(data)
    if anomalies:
        insights["anomalies"] = anomalies

    return insights
