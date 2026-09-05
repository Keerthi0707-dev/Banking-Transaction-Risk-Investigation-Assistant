TRACK_ID=PS06
# Banking - Transaction Risk Investigation Assistant (FraudDesk AI)

An enterprise-grade Banking Transaction Risk Investigation Assistant built for a bank's fraud desk. The system evaluates multi-month customer transaction histories using a hybrid architecture: a **Deterministic Rule Engine** (calculating baseline statistics and flagging explicit pattern anomalies) paired with **Google Gemini 2.5/2.0 Flash AI** (generating grounded, cited investigation reports).

---

## 🚀 Quick Start (Single Command)

From the repository root:

```bash
pip install -r requirements.txt
python app.py
```

The application will start backend & frontend together, serving at:
**`http://localhost:8000`** (or `http://127.0.0.1:8000`)

---

## 🔑 Environment Variables

The application uses Google Gemini for LLM reasoning and report synthesis.

- `GEMINI_API_KEY`: Set your Gemini API key in the environment before starting the app.
  ```bash
  export GEMINI_API_KEY="your-gemini-api-key"   # Linux/macOS
  $env:GEMINI_API_KEY="your-gemini-api-key"     # Windows PowerShell
  ```
*Note: If no API key is set, the application automatically operates in deterministic grounded fallback mode with 100% functionality.*

---

## 🏗️ System Architecture

```
+-------------------------------------------------------------------+
|               Multi-Month Customer Transaction History            |
|                  (Date, Payee, Amount, Channel, Hours)            |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|                    Deterministic Rule Engine                      |
|  - Baseline Mean Spend & StdDev calculation                       |
|  - Rule 1: Unusually Large Transfer (Z-Score > 3.0)              |
|  - Rule 2: Bursts of Payments to New Payee (< 48 hrs)             |
|  - Rule 3: Odd-Hours Activity Spikes (01:00 AM - 05:00 AM)        |
|  - Rule 4: Structuring & Threshold Avoidance ($9,000 - $9,999)    |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|                 Grounded Gemini AI Risk Investigator              |
|  - First Finding Determination (NO SUSPICIOUS ACTIVITY vs ATTENTION)|
|  - Exact Evidence Citations ([TXN-XXXXX])                        |
|  - Historical Baseline Contrast & Anomaly Explanation             |
|  - Strict Guardrails (Never claims fraud, Defers to Human)       |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|               Interactive Fraud Desk Web Application              |
|  - Visual Analytics & Flow (Chart.js + SVG Network Topology Graph)|
|  - Animated SVG Radial Risk Gauge (0-100 Score Meter)            |
|  - Searchable Transaction Ledger & Interactive Citation Inspection |
|  - Human Investigator Decision Workbench & Audit Trail            |
+-------------------------------------------------------------------+
```

---

## 💡 Key Features & Architectural Highlights

### 1. First Finding Clarity & Clean Case Discipline
- The system's **first finding** explicitly states whether anything needs attention at all (`NO SUSPICIOUS ACTIVITY DETECTED` vs `ATTENTION REQUIRED`).
- Routine accounts (e.g. `CUST-101`) return a clean report with zero false positives.

### 2. Deterministic Rule Engine + Grounded AI
- **Unusually Large Transfer**: Flags transfers exceeding historical Z-score baseline (>3.0) or multiplier thresholds.
- **Bursts of Payments to New Payee**: Flags 3+ transfers to newly registered payees (<14 days old) within a short window.
- **Odd-Hours Activity**: Detects high-value transactions during off-peak night hours (01:00 AM - 05:00 AM).
- **Structuring & Pass-Through**: Identifies multiple micro-transfers near mandatory reporting thresholds ($9,000 - $9,999).

### 3. Strict Guardrail Compliance
- **No Unfounded Fraud Claims**: The system never declares "fraud has occurred" - it flags anomalies, cites evidence, and defers judgment to the investigator.
- **Direct Transaction Citations**: Every claim cites exact transaction IDs `[TXN-XXXXX]`. In the web UI, clicking a citation chip scrolls to and highlights the target transaction row.
- **Human Escalation**: Ambiguous cases (e.g. `CUST-105`) are explicitly flagged for human investigator review with specific questions to verify.

### 4. Interactive Fraud Operations Desk UI
- **Multi-Customer Selection**: Switch between routine, flagged, and ambiguous customer profiles.
- **Interactive Visual Analytics**: Chart.js spending anomaly timeline area chart, time-of-day bar chart, and SVG beneficiary node graph.
- **Custom Ledger Sandbox**: Paste custom JSON transaction histories to evaluate custom scenarios in real-time.
- **Human Investigator Workbench**: Record audit decisions (`Verified Clean`, `Request Customer Verification`, `Escalate to AML Team`).

---

## 📊 Generated Sample Data (`data/customers.json`)

The system includes pre-configured customer accounts representing diverse real-world scenarios:
1. `CUST-101` (Elena Rostova): Routine personal checking. Demonstrates zero-false-positive clean baseline report.
2. `CUST-102` (Marcus Vance): Small business account. Demonstrates burst of 4 rapid late-night transfers to a newly added offshore payee.
3. `CUST-103` (Dr. Aris Thorne): Wealth premier account. Demonstrates massive $145,000 wire transfer breaking historical baseline by 20x.
4. `CUST-104` (Sarah Lin): Individual checking. Demonstrates inbound wire pass-through immediately swept out via structured crypto transfers.
5. `CUST-105` (David K. Miller): Executive account. Ambiguous edge case ($28,500 private jet charter) escalated to human investigator for travel authorization check.

---

## 🧪 Running Unit Tests

To run the automated pytest test suite:

```bash
python -m pytest tests/test_rule_engine.py
```

---
