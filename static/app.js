let currentCustomerId = "CUST-101";
let currentCustomerData = null;
let currentRuleAnalysis = null;
let timelineChart = null;
let hoursChart = null;

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
  animateCountUp("stat-total-accounts", customers.length);
  const clean = customers.filter(c => !c.needs_attention).length;
  const flagged = customers.filter(c => c.needs_attention && c.expected_outcome !== "AMBIGUOUS_HUMAN_ESCALATION").length;
  const escalated = customers.filter(c => c.expected_outcome === "AMBIGUOUS_HUMAN_ESCALATION").length;
  
  animateCountUp("stat-clean-accounts", clean);
  animateCountUp("stat-flagged-accounts", flagged);
  animateCountUp("stat-escalated-accounts", escalated);
}

function animateCountUp(elementId, targetValue) {
  const el = document.getElementById(elementId);
  if (!el) return;
  let current = 0;
  const step = Math.max(1, Math.floor(targetValue / 15));
  const timer = setInterval(() => {
    current += step;
    if (current >= targetValue) {
      el.innerText = targetValue;
      clearInterval(timer);
    } else {
      el.innerText = current;
    }
  }, 30);
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

  document.getElementById("report-markdown-body").innerHTML = "<p style='color:var(--text-muted);'><i>Synthesizing grounded investigation report via Gemini API...</i></p>";

  try {
    const detailsRes = await fetch(`/api/customers/${cid}`);
    const details = await detailsRes.json();
    currentCustomerData = details.customer;
    currentRuleAnalysis = details.rule_analysis;

    renderBaselineSummary(details.customer, details.rule_analysis);
    renderDetermination(details.rule_analysis, details.customer);
    renderRules(details.rule_analysis);
    renderLedger(details.customer.transactions, details.rule_analysis.flagged_txn_ids);

    // Render Graphics & Visualizations
    renderAnalyticsCharts(details.customer, details.rule_analysis);
    renderNetworkTopology(details.customer, details.rule_analysis);

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
  const chip = document.getElementById("banner-status-chip");
  const scoreVal = document.getElementById("det-score-val");
  const gaugeFill = document.getElementById("gauge-fill-circle");

  const score = ruleAnalysis.risk_score;
  scoreVal.innerText = score;

  // Calculate SVG stroke offset for gauge (r=40, circumference = 251.2)
  const circumference = 251.2;
  const offset = circumference - (score / 100) * circumference;
  gaugeFill.style.strokeDashoffset = offset;

  if (customer.expected_outcome === "AMBIGUOUS_HUMAN_ESCALATION") {
    banner.className = "determination-banner clean";
    banner.style.background = "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(180, 83, 9, 0.25))";
    banner.style.border = "1px solid rgba(245, 158, 11, 0.4)";
    chip.innerText = "AMBIGUOUS / HUMAN ESCALATION";
    chip.style.color = "#fbbf24";
    title.innerText = "HUMAN INVESTIGATOR REVIEW REQUIRED";
    subtitle.innerText = "Pattern matches travel category but exhibits elevated single transaction magnitude. Requires investigator verification.";
    gaugeFill.style.stroke = "#f59e0b";
  } else if (ruleAnalysis.needs_attention) {
    banner.className = "determination-banner flagged";
    banner.style.background = "";
    banner.style.border = "";
    chip.innerText = "HIGH RISK PATTERN";
    chip.style.color = "#f87171";
    title.innerText = "ATTENTION REQUIRED: RISK PATTERN DETECTED";
    subtitle.innerText = `Detected ${ruleAnalysis.triggered_rules.length} rule trigger(s) breaking customer's normal historical baseline.`;
    gaugeFill.style.stroke = "#ef4444";
  } else {
    banner.className = "determination-banner clean";
    banner.style.background = "";
    banner.style.border = "";
    chip.innerText = "ROUTINE BASELINE";
    chip.style.color = "#34d399";
    title.innerText = "NO SUSPICIOUS ACTIVITY DETECTED";
    subtitle.innerText = "Account activity is consistent with historical baseline spending patterns. Recommended action: Close as routine.";
    gaugeFill.style.stroke = "#10b981";
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

function renderAnalyticsCharts(customer, ruleAnalysis) {
  if (typeof Chart === 'undefined') return;

  const txns = customer.transactions || [];
  const flaggedSet = new Set(ruleAnalysis.flagged_txn_ids || []);

  // 1. Timeline Chart (Date vs Amount)
  const labels = txns.map(t => t.date.split(" ")[0]);
  const amounts = txns.map(t => t.amount);
  const pointColors = txns.map(t => flaggedSet.has(t.txn_id) ? "#ef4444" : "#3b82f6");
  const pointRadius = txns.map(t => flaggedSet.has(t.txn_id) ? 8 : 4);

  const ctxTimeline = document.getElementById("timelineChart").getContext("2d");
  if (timelineChart) timelineChart.destroy();

  const gradient = ctxTimeline.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
  gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

  timelineChart = new Chart(ctxTimeline, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Transaction Amount ($)',
        data: amounts,
        borderColor: '#3b82f6',
        backgroundColor: gradient,
        fill: true,
        tension: 0.3,
        pointBackgroundColor: pointColors,
        pointBorderColor: '#ffffff',
        pointRadius: pointRadius
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', font: { size: 10 } } }
      }
    }
  });

  // 2. Time of Day Distribution Bar Chart
  const hourCounts = new Array(24).fill(0);
  txns.forEach(t => {
    const hr = parseInt(t.date.split(" ")[1].split(":")[0], 10);
    hourCounts[hr] += 1;
  });

  const barColors = hourCounts.map((_, hr) => (hr >= 1 && hr <= 5) ? '#ef4444' : '#38bdf8');

  const ctxHours = document.getElementById("hoursChart").getContext("2d");
  if (hoursChart) hoursChart.destroy();

  hoursChart = new Chart(ctxHours, {
    type: 'bar',
    data: {
      labels: Array.from({length: 24}, (_, i) => `${i}:00`),
      datasets: [{
        label: 'Transactions',
        data: hourCounts,
        backgroundColor: barColors,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 9 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', stepSize: 1 } }
      }
    }
  });
}

function renderNetworkTopology(customer, ruleAnalysis) {
  const container = document.getElementById("network-graph-view");
  if (!container) return;

  const payees = Array.from(new Set(customer.transactions.map(t => t.payee)));
  const flaggedSet = new Set(ruleAnalysis.flagged_txn_ids || []);
  
  // Find payees associated with flagged txns
  const flaggedPayees = new Set(
    customer.transactions.filter(t => flaggedSet.has(t.txn_id)).map(t => t.payee)
  );

  let svgHtml = `
    <svg class="network-svg" viewBox="0 0 700 200">
      <defs>
        <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <!-- Central Customer Node -->
      <line x1="120" y1="100" x2="350" y2="100" stroke="#3b82f6" stroke-width="2" class="edge-line"/>
      <circle cx="120" cy="100" r="22" fill="#1e293b" stroke="#3b82f6" stroke-width="3" filter="url(#glow-blue)" class="node-circle"/>
      <text x="120" y="105" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="bold">${customer.customer_id}</text>
  `;

  // Draw payee nodes on right side
  const startY = 40;
  const spacingY = payees.length > 1 ? 120 / (payees.length - 1) : 0;

  payees.slice(0, 4).forEach((payee, idx) => {
    const py = payees.length === 1 ? 100 : startY + idx * spacingY;
    const isFlagged = flaggedPayees.has(payee);
    const strokeColor = isFlagged ? "#ef4444" : "#10b981";
    const filterGlow = isFlagged ? "url(#glow-red)" : "none";

    svgHtml += `
      <line x1="120" y1="100" x2="520" y2="${py}" stroke="${strokeColor}" stroke-width="${isFlagged ? 3 : 1.5}" stroke-dasharray="${isFlagged ? '4' : 'none'}" class="${isFlagged ? 'edge-line' : ''}"/>
      <circle cx="520" cy="${py}" r="16" fill="#0f172a" stroke="${strokeColor}" stroke-width="2.5" filter="${filterGlow}" class="node-circle"/>
      <text x="545" y="${py + 4}" fill="${isFlagged ? '#f87171' : '#9ca3af'}" font-size="11" font-weight="${isFlagged ? 'bold' : 'normal'}">${payee}</text>
    `;
  });

  svgHtml += `</svg>`;
  container.innerHTML = svgHtml;
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));

  const btn = document.getElementById(`tab-btn-${tabName}`);
  const content = document.getElementById(`tab-${tabName}`);

  if (btn) btn.classList.add("active");
  if (content) content.classList.remove("hidden");

  if (tabName === "audit") {
    fetchAuditLog();
  }
}

async function fetchAuditLog() {
  try {
    const res = await fetch("/api/audit-log");
    const logs = await res.json();
    const container = document.getElementById("audit-log-container");
    if (!logs || logs.length === 0) {
      container.innerHTML = "<p style='color:var(--text-muted); font-size:0.85rem;'>No investigator decisions recorded in audit history.</p>";
      return;
    }

    container.innerHTML = logs.map(l => `
      <div class="audit-item">
        <div style="display:flex; justify-content:space-between; font-weight:700;">
          <span>${l.customer_id} - ${l.decision}</span>
          <span style="font-size:0.75rem; color:var(--text-dim);">${new Date(l.timestamp).toLocaleTimeString()}</span>
        </div>
        <div style="margin-top:0.3rem; color:var(--text-muted);">${l.investigator_notes}</div>
      </div>
    `).join("");
  } catch (err) {
    console.error("Error fetching audit log:", err);
  }
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
  switchTab("ledger");
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
    fetchAuditLog();
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
    renderAnalyticsCharts(result.customer, result.rule_analysis);
    renderNetworkTopology(result.customer, result.rule_analysis);
    renderReportMarkdown(result.report_markdown);
  } catch (err) {
    alert(`Invalid JSON or analysis error: ${err.message}`);
  }
}
