import os
import json
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

import sys

# Ensure project root and src/ are on sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "src")))

try:
    from rule_engine import RuleEngine
except ImportError:
    from src.rule_engine import RuleEngine

try:
    from gemini_investigator import GeminiInvestigator
except ImportError:
    from src.gemini_investigator import GeminiInvestigator

from contextlib import asynccontextmanager

# Global in-memory data store
CUSTOMERS_FILE = "data/customers.json"
CUSTOMERS_DB = {}
AUDIT_LOG = []

investigator = GeminiInvestigator()

def load_customers():
    global CUSTOMERS_DB
    if not os.path.exists(CUSTOMERS_FILE):
        try:
            from sample_data import generate_sample_data
        except ImportError:
            from src.sample_data import generate_sample_data
        generate_sample_data()
    
    with open(CUSTOMERS_FILE, "r") as f:
        data = json.load(f)
        CUSTOMERS_DB = {c["customer_id"]: c for c in data}

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_customers()
    yield

app = FastAPI(title="NexusTiq24 - Banking Transaction Risk Investigation Assistant", lifespan=lifespan)

# Eager load on import for sync/test environments
load_customers()



# API Models
class CustomAnalysisRequest(BaseModel):
    customer_id: str = "CUST-CUSTOM"
    name: str = "Custom Upload Customer"
    account_type: str = "Standard Checking"
    baseline_avg_monthly_spend: Optional[float] = 3000.0
    transactions: List[Dict[str, Any]]

class InvestigatorDecisionRequest(BaseModel):
    customer_id: str
    decision: str  # "CLEARED_ROUTINE", "ESCALATED_AML", "CUSTOMER_VERIFICATION_REQUESTED"
    investigator_notes: str
    flagged_txn_ids: List[str] = []

@app.get("/api/health")
def health_check():
    return {"status": "online", "track_id": "PS06", "gemini_api_configured": investigator.client is not None}

@app.get("/api/customers")
def get_customers():
    summary_list = []
    for cid, customer in CUSTOMERS_DB.items():
        engine = RuleEngine(customer)
        analysis = engine.analyze()
        summary_list.append({
            "customer_id": cid,
            "name": customer["name"],
            "account_type": customer["account_type"],
            "risk_profile": customer.get("risk_profile", "Standard"),
            "expected_outcome": customer.get("expected_outcome", "UNKNOWN"),
            "needs_attention": analysis["needs_attention"],
            "risk_score": analysis["risk_score"],
            "triggered_rules_count": len(analysis["triggered_rules"]),
            "transaction_count": len(customer.get("transactions", []))
        })
    return summary_list

@app.get("/api/customers/{customer_id}")
def get_customer_details(customer_id: str):
    if customer_id not in CUSTOMERS_DB:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    customer = CUSTOMERS_DB[customer_id]
    engine = RuleEngine(customer)
    rule_analysis = engine.analyze()
    return {
        "customer": customer,
        "rule_analysis": rule_analysis
    }

@app.post("/api/investigate/{customer_id}")
def generate_investigation(customer_id: str):
    if customer_id not in CUSTOMERS_DB:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    customer = CUSTOMERS_DB[customer_id]
    engine = RuleEngine(customer)
    rule_analysis = engine.analyze()
    
    report_markdown = investigator.generate_investigation_report(customer, rule_analysis)
    
    return {
        "customer_id": customer_id,
        "name": customer["name"],
        "rule_analysis": rule_analysis,
        "report_markdown": report_markdown
    }

@app.post("/api/analyze-custom")
def analyze_custom_transactions(req: CustomAnalysisRequest):
    custom_customer = {
        "customer_id": req.customer_id,
        "name": req.name,
        "account_type": req.account_type,
        "baseline_avg_monthly_spend": req.baseline_avg_monthly_spend or 3000.0,
        "transactions": req.transactions
    }
    
    engine = RuleEngine(custom_customer)
    rule_analysis = engine.analyze()
    report_markdown = investigator.generate_investigation_report(custom_customer, rule_analysis)
    
    return {
        "customer": custom_customer,
        "rule_analysis": rule_analysis,
        "report_markdown": report_markdown
    }

@app.post("/api/investigator-decision")
def record_decision(req: InvestigatorDecisionRequest):
    from datetime import datetime
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "customer_id": req.customer_id,
        "decision": req.decision,
        "investigator_notes": req.investigator_notes,
        "flagged_txn_ids": req.flagged_txn_ids
    }
    AUDIT_LOG.append(log_entry)
    return {"status": "success", "log_entry": log_entry}

@app.get("/api/audit-log")
def get_audit_log():
    return AUDIT_LOG

# Mount static files
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
def read_root():
    if os.path.exists("static/index.html"):
        with open("static/index.html", "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>Banking Transaction Risk Investigation Assistant (PS06) Running</h1>"

if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False)
