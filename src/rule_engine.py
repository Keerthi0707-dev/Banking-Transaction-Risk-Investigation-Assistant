import numpy as np
import pandas as pd
from datetime import datetime, timedelta

class RuleEngine:
    """
    Deterministic rule engine that calculates baseline statistics for a customer
    and checks their recent transaction history against bank risk rules.
    """

    def __init__(self, customer_data):
        self.customer = customer_data
        self.transactions = customer_data.get("transactions", [])
        self.new_payees = {p["payee"]: p for p in customer_data.get("new_payee_registrations", [])}

    def analyze(self):
        if not self.transactions:
            return {
                "needs_attention": False,
                "risk_score": 0,
                "triggered_rules": [],
                "baseline_summary": {},
                "flagged_txn_ids": []
            }

        df = pd.DataFrame(self.transactions)
        df["datetime"] = pd.to_datetime(df["date"])
        df["hour"] = df["datetime"].dt.hour

        # Sort transactions chronologically
        df = df.sort_values("datetime").reset_index(drop=True)

        # Split baseline vs recent evaluation period (last 30 days or last batch)
        max_date = df["datetime"].max()
        cutoff_date = max_date - timedelta(days=30)
        
        baseline_df = df[df["datetime"] < cutoff_date]
        if baseline_df.empty or len(baseline_df) < 5:
            # Fallback if history is short: use overall except top 10% highest amounts
            q90 = df[df["type"] == "DEBIT"]["amount"].quantile(0.90) if not df[df["type"] == "DEBIT"].empty else 1000
            baseline_df = df[(df["type"] == "DEBIT") & (df["amount"] <= q90)]

        debit_baseline = baseline_df[baseline_df["type"] == "DEBIT"]["amount"]
        mean_spend = debit_baseline.mean() if not debit_baseline.empty else 500.0
        std_spend = debit_baseline.std() if not debit_baseline.empty and len(debit_baseline) > 1 else mean_spend * 0.5
        historical_payees = set(baseline_df["payee"].unique())

        baseline_summary = {
            "mean_debit_amount": round(float(mean_spend), 2),
            "std_debit_amount": round(float(std_spend), 2),
            "historical_payee_count": len(historical_payees),
            "total_transactions_analyzed": len(df)
        }

        triggered_rules = []
        flagged_ids = set()
        risk_score = 0

        # RULE 1: Unusually Large Transfer
        debits = df[df["type"] == "DEBIT"]
        for idx, row in debits.iterrows():
            amt = float(row["amount"])
            # Z-score relative to baseline
            z_score = (amt - mean_spend) / std_spend if std_spend > 0 else 0
            if amt >= 10000 and (z_score >= 3.0 or amt > mean_spend * 4):
                triggered_rules.append({
                    "rule_id": "RULE_LARGE_TRANSFER",
                    "rule_name": "Unusually Large Transfer",
                    "severity": "HIGH" if amt > 50000 else "MEDIUM",
                    "flagged_transactions": [row["txn_id"]],
                    "details": {
                        "amount": amt,
                        "mean_baseline": round(mean_spend, 2),
                        "multiplier": round(amt / mean_spend, 1) if mean_spend > 0 else "N/A",
                        "z_score": round(z_score, 2)
                    },
                    "description": f"Transaction {row['txn_id']} of ${amt:,.2f} to '{row['payee']}' is {round(amt/mean_spend, 1) if mean_spend>0 else 'N/A'}x higher than customer's baseline average of ${mean_spend:,.2f} (Z-score: {z_score:.2f})."
                })
                flagged_ids.add(row["txn_id"])
                risk_score += 35 if amt > 50000 else 25

        # RULE 2: Bursts of Payments to Newly Added Payee
        payee_counts = df.groupby("payee").agg(
            count=("txn_id", "count"),
            total_amt=("amount", "sum"),
            txn_ids=("txn_id", list),
            min_time=("datetime", "min"),
            max_time=("datetime", "max")
        ).reset_index()

        for idx, row in payee_counts.iterrows():
            payee = row["payee"]
            count = row["count"]
            tot_amt = row["total_amt"]
            txn_list = row["txn_ids"]
            is_new = payee in self.new_payees or payee not in historical_payees

            if is_new and count >= 3:
                time_span_hrs = (row["max_time"] - row["min_time"]).total_seconds() / 3600.0
                if time_span_hrs <= 48:
                    triggered_rules.append({
                        "rule_id": "RULE_NEW_PAYEE_BURST",
                        "rule_name": "Burst of Payments to Newly Added Payee",
                        "severity": "HIGH",
                        "flagged_transactions": txn_list,
                        "details": {
                            "payee": payee,
                            "transaction_count": count,
                            "total_amount": round(tot_amt, 2),
                            "time_window_hours": round(time_span_hrs, 2)
                        },
                        "description": f"Detected a rapid burst of {count} payments totaling ${tot_amt:,.2f} to new payee '{payee}' within a {time_span_hrs:.1f}-hour window."
                    })
                    for tid in txn_list:
                        flagged_ids.add(tid)
                    risk_score += 40

        # RULE 3: Odd-Hours Activity (1:00 AM - 5:00 AM)
        odd_hours_df = df[(df["hour"] >= 1) & (df["hour"] <= 5) & (df["type"] == "DEBIT")]
        if not odd_hours_df.empty:
            total_odd_amt = odd_hours_df["amount"].sum()
            odd_ids = odd_hours_df["txn_id"].tolist()
            if total_odd_amt >= 3000 or len(odd_ids) >= 2:
                triggered_rules.append({
                    "rule_id": "RULE_ODD_HOURS",
                    "rule_name": "Odd-Hours High-Value Activity",
                    "severity": "MEDIUM",
                    "flagged_transactions": odd_ids,
                    "details": {
                        "transaction_count": len(odd_ids),
                        "total_amount": round(total_odd_amt, 2),
                        "hours": odd_hours_df["hour"].tolist()
                    },
                    "description": f"Executed {len(odd_ids)} high-value transaction(s) totaling ${total_odd_amt:,.2f} during off-peak night hours (01:00 AM - 05:00 AM)."
                })
                for tid in odd_ids:
                    flagged_ids.add(tid)
                risk_score += 20

        # RULE 4: Rapid Pass-Through & Potential Structuring
        credits = df[df["type"] == "CREDIT"]
        if not credits.empty and not debits.empty:
            recent_credits_sum = credits[credits["datetime"] >= cutoff_date]["amount"].sum()
            recent_debits_sum = debits[debits["datetime"] >= cutoff_date]["amount"].sum()
            
            # Check for multiple transfers just under $10,000 threshold
            under_reporting = debits[(debits["amount"] >= 9000) & (debits["amount"] < 10000)]
            if len(under_reporting) >= 3:
                under_ids = under_reporting["txn_id"].tolist()
                triggered_rules.append({
                    "rule_id": "RULE_STRUCTURING",
                    "rule_name": "Potential Structuring / Threshold Avoidance",
                    "severity": "HIGH",
                    "flagged_transactions": under_ids,
                    "details": {
                        "count": len(under_reporting),
                        "amounts": under_reporting["amount"].tolist()
                    },
                    "description": f"Multiple transfers ({len(under_reporting)}) detected in the $9,000 - $9,999 range, consistent with mandatory reporting threshold avoidance."
                })
                for tid in under_ids:
                    flagged_ids.add(tid)
                risk_score += 45

        # Cap risk score at 100
        risk_score = min(100, risk_score)
        needs_attention = len(triggered_rules) > 0 and risk_score >= 20

        return {
            "needs_attention": needs_attention,
            "risk_score": risk_score,
            "triggered_rules": triggered_rules,
            "baseline_summary": baseline_summary,
            "flagged_txn_ids": list(flagged_ids)
        }
