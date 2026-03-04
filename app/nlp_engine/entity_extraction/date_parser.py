from datetime import date, timedelta


def extract_date_range(text: str):
    text = text.lower()
    today = date.today()

    if "today" in text:
        return today, today

    if "yesterday" in text:
        y = today - timedelta(days=1)
        return y, y

    if "last week" in text:
        start = today - timedelta(days=7)
        end = today
        return start, end

    if "this week" in text:
        start = today - timedelta(days=today.weekday())
        end = today
        return start, end

    return None, None
