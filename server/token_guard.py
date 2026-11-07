"""Rough daily token budget for LLM calls; map queries stay free of this guard."""
import threading
from datetime import date
from maps import settings

LOCK = threading.Lock()
USED = {'date': date.today().isoformat(), 'tokens': 0}


def daily_limit():
    raw = settings().get('TOKEN_DAILY_LIMIT')
    try:
        value = int(raw)
        return value if value > 0 else 80000
    except (TypeError, ValueError):
        return 80000


def estimate(texts):
    """Chinese-heavy rough estimate: ~1.6 chars per token."""
    return max(1, int(sum(len(text) for text in texts) / 1.6))


def add(tokens):
    with LOCK:
        today = date.today().isoformat()
        if USED['date'] != today:
            USED.update({'date': today, 'tokens': 0})
        USED['tokens'] += max(0, int(tokens))
        return USED['tokens']


def used():
    with LOCK:
        if USED['date'] != date.today().isoformat():
            return 0
        return USED['tokens']


def ensure_budget(estimated):
    limit = daily_limit()
    if used() + estimated > limit:
        raise ValueError(f'今日 AI 额度（约 {limit} tokens）已用完；地图与周边查询不受影响，明天自动恢复。')
