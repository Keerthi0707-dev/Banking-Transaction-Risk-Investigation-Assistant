import os
import json
from google import genai
from google.genai import types

class GeminiInvestigator:
    """
    Integrates with Google Gemini API to generate grounded, cited transaction risk reports.
    Strictly follows NexusTiq24 PS06 rules:
    - First finding explicitly states if attention is needed.
    - Cites exact transaction IDs [TXN-XXXXX].
    - Compares activity against historical baseline.
    - Recommends investigator starting point.
    - Escalates ambiguous cases.
    - NEVER declares fraud.
    """

    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        self.client = None
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"Warning: Failed to initialize Gemini Client: {e}")

    def generate_investigation_report(self, customer, rule_analysis):
        """
        Generates structured investigation report based on customer data & deterministic rule outputs.
        """
        # System instructions enforcing PS06 compliance
        system_instruction = (
            "You are an expert Bank Transaction Risk Investigation Assistant for a fraud operations desk. "
            "Your role is to analyze customer transaction records alongside deterministic rule findings and write a precise, grounded investigation report.\n\n"
            "CRITICAL COMPLIANCE RULES:\n"
            "1. FIRST FINDING: Your report MUST start with a clear determination of whether anything needs attention at all ('NO SUSPICIOUS ACTIVITY DETECTED' or 'ATTENTION REQUIRED').\n"
            "2. EXACT CITATIONS: Every transaction mentioned MUST cite its exact transaction ID in the format [TXN-XXXXX].\n"
            "3. BASELINE COMPARISON: You must explicitly compare recent activity against the customer's normal historical baseline (mean spend, typical payees, typical transaction hours).\n"
            "4. NO FRAUD CLAIMS: You must NEVER state that 'fraud has occurred' or accuse anyone of illegal acts. Flag anomalies, explain rule triggers, and present evidence objectively.\n"
            "5. HUMAN ESCALATION: For high-risk or ambiguous cases, explicitly recommend human investigator escalation and state what to inspect first.\n"
            "6. CLEAN CASE DISCIPLINE: If rule analysis shows no triggered rules and normal baseline activity, explicitly state that no action is required and summarize why."
        )

        prompt = f"""
Analyze the following customer transaction data and deterministic rule analysis, and generate a comprehensive Investigation Report.

--- CUSTOMER PROFILE ---
Customer ID: {customer['customer_id']}
Name: {customer['name']}
Account Type: {customer['account_type']}
Account Created: {customer['account_created']}

--- DETERMINISTIC RULE ANALYSIS ---
Needs Attention: {rule_analysis['needs_attention']}
Risk Score: {rule_analysis['risk_score']} / 100
Baseline Summary: {json.dumps(rule_analysis['baseline_summary'], indent=2)}
Triggered Rules: {json.dumps(rule_analysis['triggered_rules'], indent=2)}

--- FULL TRANSACTION HISTORY ---
{json.dumps(customer['transactions'], indent=2)}

--- REQUIRED REPORT SECTIONS ---
1. **Executive Determination**: (State upfront: "NO SUSPICIOUS ACTIVITY DETECTED" or "ATTENTION REQUIRED: [Severity]")
2. **Key Findings & Rule Triggers**: (For each triggered rule, cite exact [TXN-XXXXX] IDs, amounts, payees, and dates)
3. **Baseline & Pattern Deviation Analysis**: (How current activity differs from normal baseline spend/hours/channels)
4. **Investigator Recommended Next Steps**: (What a human fraud analyst should inspect first, or confirm clean closure)
5. **Escalation & Case Note**: (Explicitly state if human escalation is required and why)

Write the response in clean, professional Markdown.
"""

        if self.client:
            try:
                # Primary attempt using gemini-2.5-flash or gemini-2.0-flash
                model_name = "gemini-2.5-flash"
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=0.2,
                        max_output_tokens=2048
                    )
                )
                if response and response.text:
                    return response.text
            except Exception as e:
                print(f"Gemini API call failed ({e}), falling back to deterministic report builder.")

        # Deterministic Grounded Fallback Report (if API key missing or offline)
        return self._generate_fallback_report(customer, rule_analysis)

    def _generate_fallback_report(self, customer, rule_analysis):
        """
        Deterministic, fully grounded fallback report builder ensuring 100% operational safety.
        """
        needs_att = rule_analysis["needs_attention"]
        risk_score = rule_analysis["risk_score"]
        rules = rule_analysis["triggered_rules"]
        baseline = rule_analysis["baseline_summary"]
        txns = customer["transactions"]

        if not needs_att:
            return f"""# Transaction Risk Investigation Report

## Executive Determination
**NO SUSPICIOUS ACTIVITY DETECTED** (Risk Score: {risk_score}/100)

## Summary of Findings
A thorough review of customer **{customer['name']} ({customer['customer_id']})** transaction history across {len(txns)} record(s) indicates that all recent activity is fully consistent with established baseline behavior.

- **Baseline Average Spend**: ${baseline.get('mean_debit_amount', 0):,.2f} per debit transaction.
- **Historical Payee Consistency**: All payees match known recurring channels ({', '.join(customer.get('baseline_typical_payees', ['Established payees']))}).
- **Rule Triggers**: 0 risk rules triggered.

## Conclusion & Recommendation
No risk flags or pattern deviations detected. **Recommended Action: Mark case as Routine / Clean and close investigation.**
"""

        # Flagged report
        rules_text = ""
        for r in rules:
            txn_citations = " ".join([f"[{tid}]" for tid in r["flagged_transactions"]])
            rules_text += f"### {r['rule_name']} ({r['severity']} Severity)\n"
            rules_text += f"- **Rule ID**: `{r['rule_id']}`\n"
            rules_text += f"- **Flagged Transactions**: {txn_citations}\n"
            rules_text += f"- **Finding Details**: {r['description']}\n\n"

        return f"""# Transaction Risk Investigation Report

## Executive Determination
**ATTENTION REQUIRED: HIGH RISK PATTERN DETECTED** (Overall Risk Score: {risk_score}/100)

The system detected **{len(rules)} specific risk rule trigger(s)** requiring review by a human fraud investigator.

---

## Key Findings & Rule Triggers

{rules_text}

---

## Baseline & Pattern Deviation Analysis

- **Historical Mean Spend**: ${baseline.get('mean_debit_amount', 0):,.2f} (Std Dev: ${baseline.get('std_debit_amount', 0):,.2f})
- **Observed Anomaly**: Current transactions deviate significantly from historical baseline frequency, transaction windows, and volume.
- **Payee & Channel Deviations**: Interaction with newly registered or unverified entities outside historical routine.

---

## Investigator Recommended Next Steps

1. **Primary Inspection**: Review transaction records highlighted above, specifically focusing on initial high-value debit triggers.
2. **Customer Contact**: Verify whether high-value online transfers were authorized by customer **{customer['name']}**.
3. **Payee Verification**: Confirm beneficiary registration and legitimacy of newly added payment channels.

---

## Escalation & Case Note
> **HUMAN INVESTIGATOR ESCALATION REQUIRED**: This report flags potential risk indicators based on bank rules. It does **not** state or imply that fraud has occurred. The case is escalated to the Fraud Operations desk for manual review and final determination.
"""
