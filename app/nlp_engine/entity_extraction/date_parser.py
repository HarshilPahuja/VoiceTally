import re
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

    # Regex patterns for variable durations
    match_days = re.search(r"\b(?:last|past|in\s+last|in\s+past)\s+(\d+)\s+days?\b", text)
    if match_days:
        days = int(match_days.group(1))
        return today - timedelta(days=days), today

    match_weeks = re.search(r"\b(?:last|past|in\s+last|in\s+past)\s+(\d+)\s+weeks?\b", text)
    if match_weeks:
        weeks = int(match_weeks.group(1))
        return today - timedelta(weeks=weeks), today

    match_months = re.search(r"\b(?:last|past|in\s+last|in\s+past)\s+(\d+)\s+months?\b", text)
    if match_months:
        months = int(match_months.group(1))
        return today - timedelta(days=months * 30), today

    match_years = re.search(r"\b(?:last|past|in\s+last|in\s+past)\s+(\d+)\s+years?\b", text)
    if match_years:
        years = int(match_years.group(1))
        return today - timedelta(days=years * 365), today

    if "last month" in text:
        return today - timedelta(days=30), today

    if "last year" in text:
        return today - timedelta(days=365), today

    return None, None

