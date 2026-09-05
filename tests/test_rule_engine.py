import pytest
import json
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    from rule_engine import RuleEngine
except ImportError:
    from src.rule_engine import RuleEngine
from fastapi.testclient import TestClient
from app import app

@pytest.fixture
def sample_customers():
    with open("data/customers.json", "r") as f:
        return {c["customer_id"]: c for c in json.load(f)}

def test_routine_customer_clean_baseline(sample_customers):
    customer = sample_customers["CUST-101"]
    engine = RuleEngine(customer)
    res = engine.analyze()
    
    assert res["needs_attention"] == False
    assert res["risk_score"] == 0
    assert len(res["triggered_rules"]) == 0
    assert len(res["flagged_txn_ids"]) == 0

def test_new_payee_burst_detection(sample_customers):
    customer = sample_customers["CUST-102"]
    engine = RuleEngine(customer)
    res = engine.analyze()
    
    assert res["needs_attention"] == True
    assert res["risk_score"] >= 40
    rule_ids = [r["rule_id"] for r in res["triggered_rules"]]
    assert "RULE_NEW_PAYEE_BURST" in rule_ids

def test_unusually_large_transfer_detection(sample_customers):
    customer = sample_customers["CUST-103"]
    engine = RuleEngine(customer)
    res = engine.analyze()
    
    assert res["needs_attention"] == True
    assert res["risk_score"] >= 35
    rule_ids = [r["rule_id"] for r in res["triggered_rules"]]
    assert "RULE_LARGE_TRANSFER" in rule_ids

def test_odd_hours_and_structuring(sample_customers):
    customer = sample_customers["CUST-104"]
    engine = RuleEngine(customer)
    res = engine.analyze()
    
    assert res["needs_attention"] == True
    rule_ids = [r["rule_id"] for r in res["triggered_rules"]]
    assert "RULE_ODD_HOURS" in rule_ids or "RULE_STRUCTURING" in rule_ids

def test_fastapi_endpoints():
    client = TestClient(app)
    
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["track_id"] == "PS06"
    
    response = client.get("/api/customers")
    assert response.status_code == 200
    customers = response.json()
    assert len(customers) >= 5

    response = client.get("/api/customers/CUST-101")
    assert response.status_code == 200
    assert response.json()["customer"]["customer_id"] == "CUST-101"
