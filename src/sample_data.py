import json
import os
from datetime import datetime, timedelta

def generate_sample_data():
    customers = [
        {
            "customer_id": "CUST-101",
            "name": "Elena Rostova",
            "account_type": "Personal Checking",
            "risk_profile": "Low Risk (Routine)",
            "account_created": "2021-03-15",
            "baseline_avg_monthly_spend": 3200.00,
            "baseline_typical_payees": ["Metro Supermarket", "Starbucks", "ConEd Utility", "Netflix", "City Water Board", "Amazon", "Uber"],
            "expected_outcome": "ROUTINE_CLEAN",
            "transactions": [
                # Month 1 - May 2026
                {"txn_id": "TXN-10101", "date": "2026-05-01 09:15:00", "description": "Direct Deposit Salary - TechCorp Inc", "payee": "TechCorp Payroll", "amount": 6500.00, "type": "CREDIT", "channel": "ACH", "category": "Income"},
                {"txn_id": "TXN-10102", "date": "2026-05-02 11:30:00", "description": "Grocery Purchase", "payee": "Metro Supermarket", "amount": 142.50, "type": "DEBIT", "channel": "POS Card", "category": "Groceries"},
                {"txn_id": "TXN-10103", "date": "2026-05-05 08:45:00", "description": "Morning Coffee", "payee": "Starbucks", "amount": 6.75, "type": "DEBIT", "channel": "POS Card", "category": "Dining"},
                {"txn_id": "TXN-10104", "date": "2026-05-10 14:20:00", "description": "Electric Bill Payment", "payee": "ConEd Utility", "amount": 115.30, "type": "DEBIT", "channel": "Online BillPay", "category": "Utilities"},
                {"txn_id": "TXN-10105", "date": "2026-05-15 19:00:00", "description": "Streaming Subscription", "payee": "Netflix", "amount": 19.99, "type": "DEBIT", "channel": "Recurring Card", "category": "Entertainment"},
                {"txn_id": "TXN-10106", "date": "2026-05-20 18:30:00", "description": "Dinner with Friends", "payee": "Bistro Olive", "amount": 84.00, "type": "DEBIT", "channel": "POS Card", "category": "Dining"},
                
                # Month 2 - June 2026
                {"txn_id": "TXN-10107", "date": "2026-06-01 09:15:00", "description": "Direct Deposit Salary - TechCorp Inc", "payee": "TechCorp Payroll", "amount": 6500.00, "type": "CREDIT", "channel": "ACH", "category": "Income"},
                {"txn_id": "TXN-10108", "date": "2026-06-03 10:15:00", "description": "Grocery Purchase", "payee": "Metro Supermarket", "amount": 165.20, "type": "DEBIT", "channel": "POS Card", "category": "Groceries"},
                {"txn_id": "TXN-10109", "date": "2026-06-12 15:00:00", "description": "Water Bill", "payee": "City Water Board", "amount": 48.00, "type": "DEBIT", "channel": "Online BillPay", "category": "Utilities"},
                {"txn_id": "TXN-10110", "date": "2026-06-18 12:40:00", "description": "Online Order Household Goods", "payee": "Amazon", "amount": 129.99, "type": "DEBIT", "channel": "Online Card", "category": "Shopping"},
                
                # Month 3 - July 2026
                {"txn_id": "TXN-10111", "date": "2026-07-01 09:15:00", "description": "Direct Deposit Salary - TechCorp Inc", "payee": "TechCorp Payroll", "amount": 6500.00, "type": "CREDIT", "channel": "ACH", "category": "Income"},
                {"txn_id": "TXN-10112", "date": "2026-07-04 16:30:00", "description": "Ride share", "payee": "Uber", "amount": 28.50, "type": "DEBIT", "channel": "Mobile App", "category": "Transportation"},
                {"txn_id": "TXN-10113", "date": "2026-07-15 19:00:00", "description": "Streaming Subscription", "payee": "Netflix", "amount": 19.99, "type": "DEBIT", "channel": "Recurring Card", "category": "Entertainment"},
                {"txn_id": "TXN-10114", "date": "2026-07-22 11:00:00", "description": "Grocery Purchase", "payee": "Metro Supermarket", "amount": 188.40, "type": "DEBIT", "channel": "POS Card", "category": "Groceries"},

                # Month 4 - August 2026
                {"txn_id": "TXN-10115", "date": "2026-08-01 09:15:00", "description": "Direct Deposit Salary - TechCorp Inc", "payee": "TechCorp Payroll", "amount": 6500.00, "type": "CREDIT", "channel": "ACH", "category": "Income"},
                {"txn_id": "TXN-10116", "date": "2026-08-05 13:20:00", "description": "Electric Bill Payment", "payee": "ConEd Utility", "amount": 130.40, "type": "DEBIT", "channel": "Online BillPay", "category": "Utilities"},
                {"txn_id": "TXN-10117", "date": "2026-08-14 17:45:00", "description": "Weekend Groceries", "payee": "Metro Supermarket", "amount": 155.00, "type": "DEBIT", "channel": "POS Card", "category": "Groceries"}
            ]
        },
        {
            "customer_id": "CUST-102",
            "name": "Marcus Vance",
            "account_type": "Small Business Checking",
            "risk_profile": "Medium Risk (Recent Payee Burst)",
            "account_created": "2022-09-10",
            "baseline_avg_monthly_spend": 12500.00,
            "baseline_typical_payees": ["Paper & Ink Co", "TechDistributors LLC", "OfficeDepot", "State Tax Authority"],
            "expected_outcome": "SUSPICIOUS_NEW_PAYEE_BURST",
            "new_payee_registrations": [
                {"payee": "Apex Alpha Logistics Ltd", "added_date": "2026-08-13 14:00:00", "country": "Cayman Islands (Offshore)"}
            ],
            "transactions": [
                # Baseline transactions
                {"txn_id": "TXN-10201", "date": "2026-06-05 10:00:00", "description": "Vendor Invoice #441", "payee": "Paper & Ink Co", "amount": 1850.00, "type": "DEBIT", "channel": "ACH Transfer", "category": "Supplies"},
                {"txn_id": "TXN-10202", "date": "2026-06-18 14:30:00", "description": "Hardware Restock", "payee": "TechDistributors LLC", "amount": 3400.00, "type": "DEBIT", "channel": "Wire Transfer", "category": "Inventory"},
                {"txn_id": "TXN-10203", "date": "2026-07-02 11:15:00", "description": "Office Supplies", "payee": "OfficeDepot", "amount": 420.00, "type": "DEBIT", "channel": "Corporate Card", "category": "Supplies"},
                {"txn_id": "TXN-10204", "date": "2026-07-20 09:45:00", "description": "Quarterly Tax Payment", "payee": "State Tax Authority", "amount": 4500.00, "type": "DEBIT", "channel": "ACH Transfer", "category": "Taxes"},
                
                # ANOMALY: Burst to new payee added 24 hrs prior, late night/odd hours
                {"txn_id": "TXN-10205", "date": "2026-08-14 02:15:22", "description": "Urgent Freight Dispatch #1", "payee": "Apex Alpha Logistics Ltd", "amount": 9500.00, "type": "DEBIT", "channel": "Online Wire", "category": "Logistics"},
                {"txn_id": "TXN-10206", "date": "2026-08-14 02:35:10", "description": "Urgent Freight Dispatch #2", "payee": "Apex Alpha Logistics Ltd", "amount": 9800.00, "type": "DEBIT", "channel": "Online Wire", "category": "Logistics"},
                {"txn_id": "TXN-10207", "date": "2026-08-14 03:02:44", "description": "Urgent Freight Dispatch #3", "payee": "Apex Alpha Logistics Ltd", "amount": 9600.00, "type": "DEBIT", "channel": "Online Wire", "category": "Logistics"},
                {"txn_id": "TXN-10208", "date": "2026-08-14 03:28:19", "description": "Urgent Freight Dispatch #4", "payee": "Apex Alpha Logistics Ltd", "amount": 9600.00, "type": "DEBIT", "channel": "Online Wire", "category": "Logistics"}
            ]
        },
        {
            "customer_id": "CUST-103",
            "name": "Dr. Aris Thorne",
            "account_type": "Private Wealth Premier",
            "risk_profile": "High Risk (Massive Transfer Anomaly)",
            "account_created": "2019-11-04",
            "baseline_avg_monthly_spend": 4500.00,
            "baseline_typical_payees": ["St Jude Medical Group", "BMW Financial", "Equinox Fitness", "Whole Foods Market"],
            "expected_outcome": "SUSPICIOUS_LARGE_TRANSFER",
            "transactions": [
                # Baseline activity
                {"txn_id": "TXN-10301", "date": "2026-05-10 10:00:00", "description": "Monthly Lease Payment", "payee": "BMW Financial", "amount": 850.00, "type": "DEBIT", "channel": "ACH AutoPay", "category": "Automotive"},
                {"txn_id": "TXN-10302", "date": "2026-05-14 12:30:00", "description": "Organic Groceries", "payee": "Whole Foods Market", "amount": 210.40, "type": "DEBIT", "channel": "POS Card", "category": "Groceries"},
                {"txn_id": "TXN-10303", "date": "2026-06-01 07:00:00", "description": "Fitness Membership", "payee": "Equinox Fitness", "amount": 310.00, "type": "DEBIT", "channel": "Recurring Card", "category": "Fitness"},
                {"txn_id": "TXN-10304", "date": "2026-06-15 14:20:00", "description": "Clinic Equipment Maintenance", "payee": "St Jude Medical Group", "amount": 1200.00, "type": "DEBIT", "channel": "Online Transfer", "category": "Medical"},
                {"txn_id": "TXN-10305", "date": "2026-07-10 10:00:00", "description": "Monthly Lease Payment", "payee": "BMW Financial", "amount": 850.00, "type": "DEBIT", "channel": "ACH AutoPay", "category": "Automotive"},
                
                # ANOMALY: Massive transfer breaking historical baseline (Over 20x average single transfer)
                {"txn_id": "TXN-10306", "date": "2026-08-22 14:15:00", "description": "International Outward Wire - Escrow Clearance", "payee": "Sovereign Escrow Services", "amount": 145000.00, "type": "DEBIT", "channel": "Wire Transfer", "category": "Wire Transfer"},
                {"txn_id": "TXN-10307", "date": "2026-08-22 15:05:12", "description": "Secondary Settlement Transfer", "payee": "Global Holding LLC", "amount": 62000.00, "type": "DEBIT", "channel": "Wire Transfer", "category": "Wire Transfer"}
            ]
        },
        {
            "customer_id": "CUST-104",
            "name": "Sarah Lin",
            "account_type": "Standard Individual Checking",
            "risk_profile": "High Risk (Rapid Pass-Through & Crypto Structuring)",
            "account_created": "2023-01-20",
            "baseline_avg_monthly_spend": 2100.00,
            "baseline_typical_payees": ["Trader Joes", "Subway", "State Farm Insurance", "ConEd"],
            "expected_outcome": "SUSPICIOUS_PASS_THROUGH_STRUCTURING",
            "transactions": [
                # Baseline
                {"txn_id": "TXN-10401", "date": "2026-06-02 13:10:00", "description": "Auto Insurance", "payee": "State Farm Insurance", "amount": 140.00, "type": "DEBIT", "channel": "Online Card", "category": "Insurance"},
                {"txn_id": "TXN-10402", "date": "2026-06-15 17:22:00", "description": "Groceries", "payee": "Trader Joes", "amount": 85.30, "type": "DEBIT", "channel": "POS Card", "category": "Groceries"},
                {"txn_id": "TXN-10403", "date": "2026-07-01 09:00:00", "description": "Salary Deposit", "payee": "Studio Design Corp", "amount": 3400.00, "type": "CREDIT", "channel": "ACH", "category": "Income"},
                
                # ANOMALY: Rapid inbound credits followed immediately by outbound micro-wire structured bursts
                {"txn_id": "TXN-10404", "date": "2026-08-18 01:10:00", "description": "Incoming Wire Ref #99281", "payee": "Unknown Sender Alpha", "amount": 25000.00, "type": "CREDIT", "channel": "Wire Transfer", "category": "Inbound Wire"},
                {"txn_id": "TXN-10405", "date": "2026-08-18 01:25:00", "description": "Incoming Wire Ref #99284", "payee": "Unknown Sender Beta", "amount": 24500.00, "type": "CREDIT", "channel": "Wire Transfer", "category": "Inbound Wire"},
                {"txn_id": "TXN-10406", "date": "2026-08-18 02:05:00", "description": "Outbound Transfer", "payee": "CoinVaultX Global", "amount": 9900.00, "type": "DEBIT", "channel": "Mobile Wire", "category": "Crypto/Digital Assets"},
                {"txn_id": "TXN-10407", "date": "2026-08-18 02:18:00", "description": "Outbound Transfer", "payee": "CoinVaultX Global", "amount": 9850.00, "type": "DEBIT", "channel": "Mobile Wire", "category": "Crypto/Digital Assets"},
                {"txn_id": "TXN-10408", "date": "2026-08-18 02:30:00", "description": "Outbound Transfer", "payee": "PeerPay Global", "amount": 9950.00, "type": "DEBIT", "channel": "Mobile Wire", "category": "Crypto/Digital Assets"},
                {"txn_id": "TXN-10409", "date": "2026-08-18 02:45:00", "description": "Outbound Transfer", "payee": "PeerPay Global", "amount": 9800.00, "type": "DEBIT", "channel": "Mobile Wire", "category": "Crypto/Digital Assets"},
                {"txn_id": "TXN-10410", "date": "2026-08-18 03:00:00", "description": "Outbound Transfer", "payee": "PeerPay Global", "amount": 9750.00, "type": "DEBIT", "channel": "Mobile Wire", "category": "Crypto/Digital Assets"}
            ]
        },
        {
            "customer_id": "CUST-105",
            "name": "David K. Miller",
            "account_type": "Executive Premier Checking",
            "risk_profile": "Ambiguous / Moderate Risk (Needs Human Review)",
            "account_created": "2018-05-12",
            "baseline_avg_monthly_spend": 18500.00,
            "baseline_typical_payees": ["British Airways", "Lufthansa", "Marriott Hotels", "Ritz Carlton Paris", "Amex Corporate"],
            "expected_outcome": "AMBIGUOUS_HUMAN_ESCALATION",
            "transactions": [
                # Baseline travel and executive expenses
                {"txn_id": "TXN-10501", "date": "2026-05-18 15:30:00", "description": "Flight Ticket London - JFK", "payee": "British Airways", "amount": 4200.00, "type": "DEBIT", "channel": "Corporate Card", "category": "Travel"},
                {"txn_id": "TXN-10502", "date": "2026-06-05 11:20:00", "description": "Hotel Accommodation", "payee": "Ritz Carlton Paris", "amount": 3800.00, "type": "DEBIT", "channel": "Corporate Card", "category": "Travel"},
                {"txn_id": "TXN-10503", "date": "2026-07-12 14:00:00", "description": "Monthly Executive Card Settlement", "payee": "Amex Corporate", "amount": 14500.00, "type": "DEBIT", "channel": "ACH AutoPay", "category": "Credit Card Settlement"},
                
                # Scenario: Large travel transaction that matches travel category but is elevated
                {"txn_id": "TXN-10504", "date": "2026-08-10 11:45:00", "description": "Private Jet Charter Services", "payee": "Luxury Aviation Charter Paris", "amount": 28500.00, "type": "DEBIT", "channel": "Online Wire", "category": "Travel"}
            ]
        }
    ]

    os.makedirs("data", exist_ok=True)
    with open("data/customers.json", "w") as f:
        json.dump(customers, f, indent=2)
    print(f"Generated {len(customers)} customer profiles in data/customers.json")

if __name__ == "__main__":
    generate_sample_data()
