def detect_anomalies(data: dict) -> dict:
    """
    Detects simple anomalies based on thresholds.
    """

    anomalies = {}

    if data.get("total_outstanding", 0) > 0:
        anomalies["outstanding_alert"] = True

    if data.get("low_stock_items"):
        anomalies["stock_alert"] = True

    return anomalies
