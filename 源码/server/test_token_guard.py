import unittest
from token_guard import estimate, daily_limit, USED, ensure_budget


class TokenGuardTests(unittest.TestCase):
    def test_estimate_chinese(self):
        self.assertGreater(estimate(['一二三四五六七八']), 4)

    def test_daily_cap_blocks(self):
        from datetime import date
        saved = dict(USED)
        try:
            USED.update({'date': date.today().isoformat(), 'tokens': daily_limit()})
            with self.assertRaisesRegex(ValueError, '额度'):
                ensure_budget(10)
        finally:
            USED.update(saved)

    def test_under_cap_passes(self):
        from datetime import date
        saved = dict(USED)
        try:
            USED.update({'date': date.today().isoformat(), 'tokens': 0})
            ensure_budget(10)
        finally:
            USED.update(saved)


if __name__ == '__main__':
    unittest.main()
