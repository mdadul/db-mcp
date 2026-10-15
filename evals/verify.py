"""Check that the answers in evaluation.xml are what the seed data actually gives.

Run from the repo root:  python3 evals/verify.py
Builds an in-memory database from evals/seed.sql, runs one SQL query per question,
and compares the result with the answer in evaluation.xml. Exits 1 on any mismatch.
"""
import sqlite3
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).parent

# Ground-truth SQL for each question, in the same order as evaluation.xml.
QUERIES = [
    """SELECT country FROM (SELECT c.country, COUNT(DISTINCT c.id) n FROM customers c
       JOIN orders o ON o.customer_id = c.id WHERE o.status = 'refunded'
       GROUP BY c.country ORDER BY n DESC, c.country LIMIT 1)""",
    """SELECT p.name FROM order_items oi JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id WHERE o.status = 'delivered'
       GROUP BY p.id ORDER BY SUM(oi.quantity) DESC, p.name LIMIT 1""",
    """SELECT COUNT(DISTINCT customer_id) FROM support_tickets
       WHERE priority = 'high' AND closed_at IS NULL""",
    """SELECT c.name FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.status = 'delivered' GROUP BY c.id ORDER BY SUM(o.total_cents) DESC, c.name LIMIT 1""",
    """SELECT SUM(total_cents) FROM orders WHERE ordered_at LIKE '2024-03-%'
       AND status NOT IN ('cancelled', 'refunded')""",
    """SELECT p.category FROM order_items oi JOIN products p ON p.id = oi.product_id
       GROUP BY p.category ORDER BY COUNT(*) DESC, p.category LIMIT 1""",
    """SELECT COUNT(DISTINCT o.id) FROM orders o JOIN customers c ON c.id = o.customer_id
       JOIN support_tickets t ON t.order_id = o.id
       WHERE c.country = 'Japan' AND t.subject = 'Damaged item'""",
    """SELECT p.sku FROM products p JOIN order_items oi ON oi.product_id = p.id
       JOIN orders o ON o.id = oi.order_id WHERE o.status = 'refunded'
       GROUP BY p.id ORDER BY p.price_cents DESC, p.sku LIMIT 1""",
    """SELECT CASE WHEN EXISTS (SELECT 1 FROM support_tickets t JOIN orders o ON o.id = t.order_id
       WHERE o.customer_id <> t.customer_id) THEN 'Yes' ELSE 'No' END""",
    """SELECT printf('%.2f', AVG(n)) FROM (SELECT COUNT(*) n FROM order_items GROUP BY order_id)""",
]


def normalise(value):
    return str(value).strip()


def main() -> int:
    db = sqlite3.connect(":memory:")
    db.executescript((HERE / "seed.sql").read_text())

    pairs = ET.parse(HERE / "evaluation.xml").getroot().findall("qa_pair")
    if len(pairs) != len(QUERIES):
        print(f"expected {len(QUERIES)} questions, found {len(pairs)}")
        return 1

    failures = 0
    for i, (pair, sql) in enumerate(zip(pairs, QUERIES), start=1):
        expected = normalise(pair.findtext("answer"))
        actual = normalise(db.execute(sql).fetchone()[0])
        status = "ok  " if expected == actual else "FAIL"
        if expected != actual:
            failures += 1
        print(f"{status} Q{i}: expected={expected!r} actual={actual!r}")
    print(f"{len(pairs) - failures}/{len(pairs)} answers match the seed data")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
