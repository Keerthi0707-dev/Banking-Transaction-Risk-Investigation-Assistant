let currentCustomerId = "CUST-101";
let currentCustomerData = null;
let currentRuleAnalysis = null;

document.addEventListener("DOMContentLoaded", () => {
  fetchCustomers();
});

async function fetchCustomers() {
  try {
    const res = await fetch("/api/customers");
    const data = await res.json();
    renderCustomerList(data);
    updateOverviewStats(data);
    if (data.length > 0) {
      selectCustomer(data[0].customer_id);
    }
  } catch (err) {
    console.error("Error loading customers:", err);
  }
}

function updateOverviewStats(customers) {
  document.getElementById("stat-total-accounts").innerText = customers.length;
  const clean = customers.filter(c => !c.needs_attention).length;
  const flagged = customers.filter(c => c.needs_attention && c.expected_outcome !== "AMBIGUOUS_HUMAN_ESCALATION").length;
  const escalated = customers.filter(c => c.expected_outcome === "AMBIGUOUS_HUMAN_ESCALATION").length;
  
  document.getElementById("stat-clean-accounts").innerText = clean;
  document.getElementById("stat-flagged-accounts").innerText = flagged;
  document.getElementById("stat-escalated-accounts").innerText = escalated;
}

function renderCustomerList(customers) {
  const container = document.getElementById("customer-list-container");
  container.innerHTML = "";

  customers.forEach(c => {
    const card = document.createElement("div");
    card.className = `customer-card ${c.customer_id === currentCustomerId ? 'active' : ''}`;
    card.id = `card-${c.customer_id}`;
    card.onclick = () => selectCustomer(c.customer_id);

    let tagClass = "clean";
    let tagLabel = "✓ Routine Baseline";
    if (c.expected_outcome === "AMBIGUOUS_HUMAN_ESCALATION") {
      tagClass = "ambiguous";
      tagLabel = "⚖️ Human Escalation";
    } else if (c.needs_attention) {
      tagClass = "flagged";
      tagLabel = `⚠️ ${c.triggered_rules_count} Rule Trigger(s)`;
    }

    card.innerHTML = `
      <div class="customer-card-header">
        <div class="customer-name">${c.name}</div>
        <div class="customer-id">${c.customer_id}</div>
      </div>
      <div class="customer-meta">
        <span>${c.account_type}</span>
        <span>${c.transaction_count} Txns</span>
      </div>
      <div class="risk-tag ${tagClass}">${tagLabel}</div>
    `;
    container.appendChild(card);
  });
}

async function selectCustomer(cid) {
  currentCustomerId = cid;
  
  // Highlight active card
  document.querySelectorAll(".customer-card").forEach(el => el.classList.remove("active"));
  const activeCard = document.getElementById(`card-${cid}`);
  if (activeCard) activeCard.classList.add("active");

  document.getElementById("report-markdown-body").innerHTML = "<p style='color:var(--text-muted);'><i>Running Gemini AI Investigation & Rule Evaluation...</i></p>";

  try {
    const detailsRes = await fetch(`/api/customers/${cid}`);
    const details = await detailsRes.json();
    currentCustomerData = details.customer;
    currentRuleAnalysis = details.rule_analysis;

    renderBaselineSummary(details.customer, details.rule_analysis);
    renderDetermination(details.rule_analysis, details.customer);
    renderRules(details.rule_analysis);
    renderLedger(details.customer.transactions, details.rule_analysis.flagged_txn_ids);

    // Fetch AI Report
    const investRes = await fetch(`/api/investigate/${cid}`, { method: "POST" });
    const investData = await investRes.json();
    renderReportMarkdown(investData.report_markdown);
  } catch (err) {
    console.error("Error investigating customer:", err);
    document.getElementById("report-markdown-body").innerHTML = `<p style="color:var(--danger-red);">Error loading report: ${err.message}</p>`;
  }
}

function renderBaselineSummary(customer, ruleAnalysis) {
  document.getElementById("baseline-cid").innerText = customer.customer_id;
  const b = ruleAnalysis.baseline_summary;
  document.getElementById("baseline-details").innerHTML = `
    <div style="margin-bottom:0.4rem;"><strong>Account Created:</strong> ${customer.account_created}</div>
    <div style="margin-bottom:0.4rem;"><strong>Risk Profile:</strong> ${customer.risk_profile || 'Standard'}</div>
    <div style="margin-bottom:0.4rem;"><strong>Baseline Monthly Mean:</strong> $${b.mean_debit_amount ? b.mean_debit_amount.toLocaleString() : 'N/A'} (StdDev: $${b.std_debit_amount || 0})</div>
    <div><strong>Total Analyzed:</strong> ${b.total_transactions_analyzed || 0} transactions</div>
  `;
}

function renderDetermination(ruleAnalysis, customer) {
  const banner = document.getElementById("determination-banner");
  const title = document.getElementById("det-title");
  const subtitle = document.getElementById("det-subtitle");
  const score = document.getElementById("det-score");

  score.innerText = `${ruleAnalysis.risk_score} / 100`;

  if (customer.expected_outcome === "AMBIGUOUS_HUMAN_ESCALATION") {
    banner.className = "determination-banner clean";
    banner.style.background = "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(180, 83, 9, 0.2))";
    banner.style.border = "1px solid rgba(245, 158, 11, 0.4)";
    title.innerText = "BORDERLINE / AMBIGUOUS CASE - HUMAN ESCALATION REQUIRED";
    subtitle.innerText = "Pattern matches travel category but exhibits elevated single transaction magnitude. Requires investigator context.";
  } else if (ruleAnalysis.needs_attention) {
    banner.className = "determination-banner flagged";
    banner.style.background = "";
    banner.style.border = "";
    title.innerText = "ATTENTION REQUIRED: HIGH RISK PATTERN DETECTED";
    subtitle.innerText = `Detected ${ruleAnalysis.triggered_rules.length} rule trigger(s) breaking customer's normal historical baseline.`;
  } else {
    banner.className = "determination-banner clean";
    banner.style.background = "";
    banner.style.border = "";
    title.innerText = "NO SUSPICIOUS ACTIVITY DETECTED";
    subtitle.innerText = "Account activity is consistent with historical baseline spending patterns. Recommended action: Close as routine.";
  }
}

function renderRules(ruleAnalysis) {
  const container = document.getElementById("rules-list");
  const rulesCard = document.getElementById("rules-card");
  const countBadge = document.getElementById("rule-count-badge");

  if (!ruleAnalysis.triggered_rules || ruleAnalysis.triggered_rules.length === 0) {
    rulesCard.classList.add("hidden");
    return;
  }

  rulesCard.classList.remove("hidden");
  countBadge.innerText = `${ruleAnalysis.triggered_rules.length} Rule Trigger(s)`;
  container.innerHTML = "";

  ruleAnalysis.triggered_rules.forEach(r => {
    const item = document.createElement("div");
    item.className = `rule-item ${r.severity}`;
    
    const chipHtml = r.flagged_transactions.map(tid => 
      `<span class="txn-chip" onclick="highlightTransaction('${tid}')">${tid}</span>`
    ).join(" ");

    item.innerHTML = `
      <div class="rule-header">
        <span>${r.rule_name}</span>
        <span style="font-size:0.75rem;" class="track-badge">${r.severity} SEVERITY</span>
      </div>
      <div class="rule-desc">${r.description}</div>
      <div class="txn-chips">Evidence: ${chipHtml}</div>
    `;
    container.appendChild(item);
  });
}

function renderLedger(transactions, flaggedIds = []) {
  const tbody = document.getElementById("ledger-table-body");
  document.getElementById("txn-ledger-count").innerText = `${transactions.length} Records`;
  tbody.innerHTML = "";

  const flaggedSet = new Set(flaggedIds);

  transactions.forEach(t => {
    const tr = document.createElement("tr");
    tr.id = `row-${t.txn_id}`;
    if (flaggedSet.has(t.txn_id)) {
      tr.className = "flagged-row";
    }

    const isCredit = t.type === "CREDIT";
    const amtClass = isCredit ? "amount-credit" : "amount-debit";
    const amtSign = isCredit ? "+" : "-";

    tr.innerHTML = `
      <td><span class="customer-id" style="color:var(--primary-blue); font-weight:600;">${t.txn_id}</span></td>
      <td style="font-size:0.8rem; color:var(--text-muted);">${t.date}</td>
      <td>
        <strong style="font-size:0.9rem;">${t.payee}</strong>
        <div style="font-size:0.75rem; color:var(--text-dim);">${t.description}</div>
      </td>
      <td><span class="track-badge" style="background:#1f2937; color:var(--text-muted); border-color:var(--border-color);">${t.channel}</span></td>
      <td class="${amtClass}">${amtSign}$${Math.abs(t.amount).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
      <td>${flaggedSet.has(t.txn_id) ? '<span class="risk-tag flagged" style="margin:0;">Flagged</span>' : '<span style="font-size:0.75rem; color:var(--text-dim);">Routine</span>'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderReportMarkdown(markdownText) {
  const container = document.getElementById("report-markdown-body");
  if (typeof marked !== 'undefined') {
    container.innerHTML = marked.parse(markdownText);
  } else {
    container.innerText = markdownText;
  }
}

function highlightTransaction(txnId) {
  document.querySelectorAll(".ledger-table tr").forEach(tr => tr.classList.remove("highlighted"));
  const targetRow = document.getElementById(`row-${txnId}`);
  if (targetRow) {
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetRow.classList.add("highlighted");
  }
}

async function reRunInvestigation() {
  if (currentCustomerId) {
    selectCustomer(currentCustomerId);
  }
}

async function submitDecision(decision) {
  const notes = document.getElementById("investigator-notes").value;
  const flagged = currentRuleAnalysis ? currentRuleAnalysis.flagged_txn_ids : [];

  try {
    const res = await fetch("/api/investigator-decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: currentCustomerId,
        decision: decision,
        investigator_notes: notes || "Decision recorded by Investigator.",
        flagged_txn_ids: flagged
      })
    });
    const result = await res.json();
    alert(`Investigator Decision Saved!\nAction: ${decision}\nAudit Log ID recorded.`);
    document.getElementById("investigator-notes").value = "";
  } catch (err) {
    alert(`Failed to save decision: ${err.message}`);
  }
}

// Modal Handlers
function openCustomModal() {
  document.getElementById("custom-modal").classList.remove("hidden");
  loadPresetJSON();
}

function closeCustomModal() {
  document.getElementById("custom-modal").classList.add("hidden");
}

function loadPresetJSON() {
  const sample = {
    "customer_id": "CUST-SANDBOX",
    "name": "Custom Test Subject",
    "account_type": "Personal Checking",
    "baseline_avg_monthly_spend": 2500.0,
    "transactions": [
      {"txn_id": "TXN-SANDBOX-01", "date": "2026-08-01 10:00:00", "description": "Salary Deposit", "payee": "Employer Inc", "amount": 5000.0, "type": "CREDIT", "channel": "ACH", "category": "Income"},
      {"txn_id": "TXN-SANDBOX-02", "date": "2026-08-02 12:00:00", "description": "Groceries", "payee": "Fresh Mart", "amount": 120.0, "type": "DEBIT", "channel": "POS Card", "category": "Groceries"},
      {"txn_id": "TXN-SANDBOX-03", "date": "2026-08-15 03:22:00", "description": "Offshore Transfer 1", "payee": "Unknown Offshore Corp", "amount": 9950.0, "type": "DEBIT", "channel": "Online Wire", "category": "Wire Transfer"},
      {"txn_id": "TXN-SANDBOX-04", "date": "2026-08-15 03:45:00", "description": "Offshore Transfer 2", "payee": "Unknown Offshore Corp", "amount": 9900.0, "type": "DEBIT", "channel": "Online Wire", "category": "Wire Transfer"}
    ]
  };
  document.getElementById("custom-json-input").value = JSON.stringify(sample, null, 2);
}

async function submitCustomAnalysis() {
  try {
    const rawText = document.getElementById("custom-json-input").value;
    const reqData = JSON.parse(rawText);

    document.getElementById("report-markdown-body").innerHTML = "<p style='color:var(--text-muted);'>Analyzing custom transaction history...</p>";
    closeCustomModal();

    const res = await fetch("/api/analyze-custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqData)
    });
    const result = await res.json();

    currentCustomerId = reqData.customer_id;
    currentCustomerData = result.customer;
    currentRuleAnalysis = result.rule_analysis;

    renderBaselineSummary(result.customer, result.rule_analysis);
    renderDetermination(result.rule_analysis, result.customer);
    renderRules(result.rule_analysis);
    renderLedger(result.customer.transactions, result.rule_analysis.flagged_txn_ids);
    renderReportMarkdown(result.report_markdown);
  } catch (err) {
    alert(`Invalid JSON or analysis error: ${err.message}`);
  }
}
