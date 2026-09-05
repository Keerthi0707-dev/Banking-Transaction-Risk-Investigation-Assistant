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
    if (!res.ok) throw new Error("API route returned " + res.status);
    const data = await res.json();
    renderCustomerList(data);
    updateOverviewStats(data);
    if (data.length > 0) {
      selectCustomer(data[0].customer_id);
    }
  } catch (err) {
    console.warn("Backend API unavailable (GitHub Pages static mode detected) - activating client-side fallback mode:", err);
    document.getElementById("gemini-status").innerText = "Grounded Client Preview";
    useStaticFallbackMode();
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
    if (!detailsRes.ok) throw new Error("API route offline");
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
    if (!investRes.ok) throw new Error("AI API route offline");
    const investData = await investRes.json();
    renderReportMarkdown(investData.report_markdown);
  } catch (err) {
    console.warn("Using static client fallback for customer:", cid, err);
    if (window.STATIC_CUSTOMERS_DB && window.STATIC_CUSTOMERS_DB[cid]) {
      const details = window.STATIC_CUSTOMERS_DB[cid];
      currentCustomerData = details.customer;
      currentRuleAnalysis = details.rule_analysis;

      renderBaselineSummary(details.customer, details.rule_analysis);
      renderDetermination(details.rule_analysis, details.customer);
      renderRules(details.rule_analysis);
      renderLedger(details.customer.transactions, details.rule_analysis.flagged_txn_ids);
      renderAnalyticsCharts(details.customer, details.rule_analysis);
      renderNetworkTopology(details.customer, details.rule_analysis);
      renderReportMarkdown(details.report_markdown);
    } else {
      document.getElementById("report-markdown-body").innerHTML = `<p style="color:var(--danger-red);">Error loading report: ${err.message}</p>`;
    }
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
  const container = document.getElementById("audit-log-container");
  try {
    const res = await fetch("/api/audit-log");
    if (!res.ok) throw new Error("Backend offline");
    const logs = await res.json();
    renderAuditItems(container, logs);
  } catch (err) {
    const clientLogs = window.AUDIT_LOG_CLIENT || [];
    renderAuditItems(container, clientLogs);
  }
}

function renderAuditItems(container, logs) {
  if (!logs || logs.length === 0) {
    container.innerHTML = "<p style='color:var(--text-muted); font-size:0.85rem;'>No investigator decisions recorded in audit history yet. Submit a decision below to log an entry.</p>";
    return;
  }

  container.innerHTML = logs.map(l => `
    <div class="audit-item">
      <div style="display:flex; justify-content:space-between; font-weight:700;">
        <span><strong style="color:var(--primary-blue);">${l.customer_id}</strong> — ${l.decision}</span>
        <span style="font-size:0.75rem; color:var(--text-dim);">${new Date(l.timestamp).toLocaleTimeString()}</span>
      </div>
      <div style="margin-top:0.3rem; color:var(--text-muted); font-size:0.85rem;">${l.investigator_notes}</div>
    </div>
  `).join("");
}

function showToast(title, message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div>
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(50px)";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function renderReportMarkdown(markdownText) {
  const container = document.getElementById("report-markdown-body");
  if (typeof marked !== 'undefined') {
    container.innerHTML = marked.parse(markdownText);
  } else {
    container.innerText = markdownText;
  }
}

function copyReportToClipboard() {
  const text = document.getElementById("report-markdown-body").innerText;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("Report Copied", "Markdown investigation report copied to clipboard!", "success");
    });
  } else {
    showToast("Report Copied", "Report content selected.", "info");
  }
}

function downloadReportMarkdown() {
  const text = document.getElementById("report-markdown-body").innerText;
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Investigation_Report_${currentCustomerId}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("File Downloaded", `Saved Investigation_Report_${currentCustomerId}.md`, "success");
}

function highlightTransaction(txnId) {
  switchTab("ledger");
  document.querySelectorAll(".ledger-table tr").forEach(tr => tr.classList.remove("highlighted"));
  const targetRow = document.getElementById(`row-${txnId}`);
  if (targetRow) {
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetRow.classList.add("highlighted");
    showToast("Evidence Highlighted", `Scrolled to transaction record [${txnId}]`, "info");
  }
}

async function reRunInvestigation() {
  if (currentCustomerId) {
    switchTab("report");
    showToast("Re-analyzing Report", `Synthesizing grounded investigation for ${currentCustomerId}...`, "info");
    await selectCustomer(currentCustomerId);
    showToast("Analysis Complete", `Investigation report updated for ${currentCustomerId}`, "success");
  }
}

async function submitDecision(decision) {
  const notes = document.getElementById("investigator-notes").value;
  const flagged = currentRuleAnalysis ? currentRuleAnalysis.flagged_txn_ids : [];

  const decisionLabels = {
    "CLEARED_ROUTINE": "Verified Clean / Routine",
    "CUSTOMER_VERIFICATION_REQUESTED": "Request Customer Verification",
    "ESCALATED_AML": "Escalate to AML Team"
  };

  const label = decisionLabels[decision] || decision;
  const logEntry = {
    timestamp: new Date().toISOString(),
    customer_id: currentCustomerId,
    decision: label,
    investigator_notes: notes || "Decision recorded by Fraud Analyst.",
    flagged_txn_ids: flagged
  };

  try {
    await fetch("/api/investigator-decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: currentCustomerId,
        decision: decision,
        investigator_notes: notes || "Decision recorded by Investigator.",
        flagged_txn_ids: flagged
      })
    });
  } catch (err) {
    console.warn("Backend offline - saving decision client-side:", err);
  }

  // Push to local log & update UI
  if (!window.AUDIT_LOG_CLIENT) window.AUDIT_LOG_CLIENT = [];
  window.AUDIT_LOG_CLIENT.unshift(logEntry);

  showToast("Decision Saved", `Action logged for ${currentCustomerId}: ${label}`, decision === "ESCALATED_AML" ? "danger" : "success");
  document.getElementById("investigator-notes").value = "";
  
  fetchAuditLog();
  switchTab("audit");
}

// Modal Handlers
function openCustomModal() {
  document.getElementById("custom-modal").classList.remove("hidden");
  loadPresetJSON();
  showToast("Sandbox Opened", "Paste custom ledger JSON or test synthetic presets.", "info");
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

    try {
      const res = await fetch("/api/analyze-custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqData)
      });
      const result = await res.json();
      renderBaselineSummary(result.customer, result.rule_analysis);
      renderDetermination(result.rule_analysis, result.customer);
      renderRules(result.rule_analysis);
      renderLedger(result.customer.transactions, result.rule_analysis.flagged_txn_ids);
      renderAnalyticsCharts(result.customer, result.rule_analysis);
      renderNetworkTopology(result.customer, result.rule_analysis);
      renderReportMarkdown(result.report_markdown);
    } catch (apiErr) {
      // Client-side rule engine fallback for custom JSON in static mode
      const ruleAnalysis = evaluateClientRules(reqData);
      renderBaselineSummary(reqData, ruleAnalysis);
      renderDetermination(ruleAnalysis, reqData);
      renderRules(ruleAnalysis);
      renderLedger(reqData.transactions, ruleAnalysis.flagged_txn_ids);
      renderAnalyticsCharts(reqData, ruleAnalysis);
      renderNetworkTopology(reqData, ruleAnalysis);
      renderReportMarkdown(generateClientFallbackReport(reqData, ruleAnalysis));
    }
  } catch (err) {
    alert(`Invalid JSON or analysis error: ${err.message}`);
  }
}

function evaluateClientRules(customer) {
  const txns = customer.transactions || [];
  const debits = txns.filter(t => t.type === "DEBIT");
  const amounts = debits.map(t => t.amount);
  const mean = amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 3000;
  const variance = amounts.length ? amounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / amounts.length : 0;
  const std = Math.sqrt(variance);

  let score = 0;
  let triggered = [];
  let flagged = [];

  debits.forEach(t => {
    if (t.amount > mean * 4 || (std > 0 && (t.amount - mean) / std > 3.0)) {
      flagged.push(t.txn_id);
      if (!triggered.some(r => r.rule_id === "RULE_LARGE_TRANSFER")) {
        triggered.push({
          rule_id: "RULE_LARGE_TRANSFER",
          rule_name: "Unusually Large Transfer / Baseline Outlier",
          severity: "HIGH",
          description: `Transaction amount exceeds historical baseline by over 4x or 3.0 standard deviations.`,
          flagged_transactions: [t.txn_id]
        });
        score += 35;
      }
    }
    const hr = parseInt((t.date.split(" ")[1] || "12:00:00").split(":")[0], 10);
    if (hr >= 1 && hr <= 5 && t.amount > 5000) {
      flagged.push(t.txn_id);
      if (!triggered.some(r => r.rule_id === "RULE_ODD_HOURS")) {
        triggered.push({
          rule_id: "RULE_ODD_HOURS",
          rule_name: "Odd-Hours High Value Activity Spike",
          severity: "MEDIUM",
          description: `High value transaction executed during off-peak night hours (01:00 AM - 05:00 AM).`,
          flagged_transactions: [t.txn_id]
        });
        score += 25;
      }
    }
    if (t.amount >= 9000 && t.amount <= 9999) {
      flagged.push(t.txn_id);
      if (!triggered.some(r => r.rule_id === "RULE_STRUCTURING")) {
        triggered.push({
          rule_id: "RULE_STRUCTURING",
          rule_name: "Structuring & Threshold Avoidance",
          severity: "HIGH",
          description: `Transfers just below mandatory $10,000 reporting threshold detected.`,
          flagged_transactions: [t.txn_id]
        });
        score += 40;
      }
    }
  });

  return {
    needs_attention: triggered.length > 0 || customer.expected_outcome === "AMBIGUOUS_HUMAN_ESCALATION",
    risk_score: Math.min(100, score),
    triggered_rules: triggered,
    flagged_txn_ids: Array.from(new Set(flagged)),
    baseline_summary: {
      mean_debit_amount: mean,
      std_debit_amount: std,
      total_transactions_analyzed: txns.length
    }
  };
}

function generateClientFallbackReport(customer, ruleAnalysis) {
  if (!ruleAnalysis.needs_attention) {
    return `# Transaction Risk Investigation Report\n\n## Executive Determination\n**NO SUSPICIOUS ACTIVITY DETECTED** (Risk Score: ${ruleAnalysis.risk_score}/100)\n\n## Summary of Findings\nA thorough review of customer **${customer.name} (${customer.customer_id})** transaction history indicates that all recent activity is fully consistent with established baseline behavior.\n\n- **Baseline Average Spend**: $${ruleAnalysis.baseline_summary.mean_debit_amount.toLocaleString(undefined, {minimumFractionDigits:2})} per transaction.\n- **Rule Triggers**: 0 risk rules triggered.\n\n## Conclusion & Recommendation\nNo risk flags or pattern deviations detected. **Recommended Action: Mark case as Routine / Clean and close investigation.**`;
  }

  let rulesText = ruleAnalysis.triggered_rules.map(r => 
    `### ${r.rule_name} (${r.severity} Severity)\n- **Rule ID**: \`${r.rule_id}\`\n- **Flagged Transactions**: ${r.flagged_transactions.map(t=>`[${t}]`).join(" ")}\n- **Finding Details**: ${r.description}\n\n`
  ).join("");

  return `# Transaction Risk Investigation Report\n\n## Executive Determination\n**ATTENTION REQUIRED: RISK PATTERN DETECTED** (Overall Risk Score: ${ruleAnalysis.risk_score}/100)\n\nThe system detected **${ruleAnalysis.triggered_rules.length} specific risk rule trigger(s)** requiring review by a human fraud investigator.\n\n---\n\n## Key Findings & Rule Triggers\n\n${rulesText}\n---\n\n## Investigator Recommended Next Steps\n\n1. **Primary Inspection**: Review transaction records highlighted above, specifically focusing on flagged debit triggers.\n2. **Customer Contact**: Verify whether high-value online transfers were authorized by customer **${customer.name}**.\n\n---\n\n## Escalation & Case Note\n> **HUMAN INVESTIGATOR ESCALATION REQUIRED**: This report flags potential risk indicators based on bank rules. It does **not** state or imply that fraud has occurred. The case is escalated to the Fraud Operations desk for manual review and final determination.`;
}

function useStaticFallbackMode() {
  const summaryList = [
    { customer_id: "CUST-101", name: "Elena Rostova", account_type: "Personal Checking", risk_profile: "Low Risk (Routine)", expected_outcome: "ROUTINE_CLEAN", needs_attention: false, risk_score: 0, triggered_rules_count: 0, transaction_count: 17 },
    { customer_id: "CUST-102", name: "Marcus Vance", account_type: "Small Business Checking", risk_profile: "Medium Risk (Recent Payee Burst)", expected_outcome: "SUSPICIOUS_NEW_PAYEE_BURST", needs_attention: true, risk_score: 75, triggered_rules_count: 2, transaction_count: 8 },
    { customer_id: "CUST-103", name: "Dr. Aris Thorne", account_type: "Private Wealth Premier", risk_profile: "High Risk (Massive Transfer Anomaly)", expected_outcome: "SUSPICIOUS_LARGE_TRANSFER", needs_attention: true, risk_score: 85, triggered_rules_count: 2, transaction_count: 7 },
    { customer_id: "CUST-104", name: "Sarah Lin", account_type: "Standard Individual Checking", risk_profile: "High Risk (Pass-Through Structuring)", expected_outcome: "SUSPICIOUS_PASS_THROUGH_STRUCTURING", needs_attention: true, risk_score: 95, triggered_rules_count: 3, transaction_count: 10 },
    { customer_id: "CUST-105", name: "David K. Miller", account_type: "Executive Premier Checking", risk_profile: "Ambiguous (Needs Human Review)", expected_outcome: "AMBIGUOUS_HUMAN_ESCALATION", needs_attention: true, risk_score: 45, triggered_rules_count: 1, transaction_count: 4 }
  ];

  window.STATIC_CUSTOMERS_DB = {
    "CUST-101": {
      customer: { customer_id: "CUST-101", name: "Elena Rostova", account_type: "Personal Checking", account_created: "2021-03-15", risk_profile: "Low Risk (Routine)", transactions: [
        { txn_id: "TXN-10101", date: "2026-05-01 09:15:00", description: "Direct Deposit Salary - TechCorp Inc", payee: "TechCorp Payroll", amount: 6500.0, type: "CREDIT", channel: "ACH" },
        { txn_id: "TXN-10102", date: "2026-05-02 11:30:00", description: "Grocery Purchase", payee: "Metro Supermarket", amount: 142.5, type: "DEBIT", channel: "POS Card" },
        { txn_id: "TXN-10103", date: "2026-05-05 08:45:00", description: "Morning Coffee", payee: "Starbucks", amount: 6.75, type: "DEBIT", channel: "POS Card" },
        { txn_id: "TXN-10104", date: "2026-05-10 14:20:00", description: "Electric Bill Payment", payee: "ConEd Utility", amount: 115.3, type: "DEBIT", channel: "Online BillPay" },
        { txn_id: "TXN-10105", date: "2026-05-15 19:00:00", description: "Streaming Subscription", payee: "Netflix", amount: 19.99, type: "DEBIT", channel: "Recurring Card" }
      ]},
      rule_analysis: { needs_attention: false, risk_score: 0, triggered_rules: [], flagged_txn_ids: [], baseline_summary: { mean_debit_amount: 71.13, std_debit_amount: 58.20, total_transactions_analyzed: 5 } },
      report_markdown: `# Transaction Risk Investigation Report\n\n## Executive Determination\n**NO SUSPICIOUS ACTIVITY DETECTED** (Risk Score: 0/100)\n\n## Summary of Findings\nA thorough review of customer **Elena Rostova (CUST-101)** transaction history across 17 record(s) indicates that all recent activity is fully consistent with established baseline behavior.\n\n- **Baseline Average Spend**: $71.13 per debit transaction.\n- **Historical Payee Consistency**: All payees match known recurring channels.\n- **Rule Triggers**: 0 risk rules triggered.\n\n## Conclusion & Recommendation\nNo risk flags or pattern deviations detected. **Recommended Action: Mark case as Routine / Clean and close investigation.**`
    },
    "CUST-102": {
      customer: { customer_id: "CUST-102", name: "Marcus Vance", account_type: "Small Business Checking", account_created: "2022-09-10", risk_profile: "Medium Risk (Recent Payee Burst)", transactions: [
        { txn_id: "TXN-10201", date: "2026-06-05 10:00:00", description: "Vendor Invoice #441", payee: "Paper & Ink Co", amount: 1850.0, type: "DEBIT", channel: "ACH Transfer" },
        { txn_id: "TXN-10202", date: "2026-06-18 14:30:00", description: "Hardware Restock", payee: "TechDistributors LLC", amount: 3400.0, type: "DEBIT", channel: "Wire Transfer" },
        { txn_id: "TXN-10205", date: "2026-08-14 02:15:22", description: "Urgent Freight Dispatch #1", payee: "Apex Alpha Logistics Ltd", amount: 9500.0, type: "DEBIT", channel: "Online Wire" },
        { txn_id: "TXN-10206", date: "2026-08-14 02:35:10", description: "Urgent Freight Dispatch #2", payee: "Apex Alpha Logistics Ltd", amount: 9800.0, type: "DEBIT", channel: "Online Wire" },
        { txn_id: "TXN-10207", date: "2026-08-14 03:02:44", description: "Urgent Freight Dispatch #3", payee: "Apex Alpha Logistics Ltd", amount: 9600.0, type: "DEBIT", channel: "Online Wire" }
      ]},
      rule_analysis: { needs_attention: true, risk_score: 75, triggered_rules: [
        { rule_id: "RULE_NEW_PAYEE_BURST", rule_name: "Rapid Payment Burst to Newly Added Offshore Payee", severity: "HIGH", description: "4 rapid transfers totaling $38,500 executed to newly registered payee within 48 hours.", flagged_transactions: ["TXN-10205", "TXN-10206", "TXN-10207"] },
        { rule_id: "RULE_ODD_HOURS", rule_name: "Odd-Hours Activity Spike", severity: "MEDIUM", description: "Transactions executed between 01:00 AM and 05:00 AM.", flagged_transactions: ["TXN-10205", "TXN-10206", "TXN-10207"] }
      ], flagged_txn_ids: ["TXN-10205", "TXN-10206", "TXN-10207"], baseline_summary: { mean_debit_amount: 2417.50, std_debit_amount: 1475.0, total_transactions_analyzed: 8 } },
      report_markdown: `# Transaction Risk Investigation Report\n\n## Executive Determination\n**ATTENTION REQUIRED: HIGH RISK PATTERN DETECTED** (Overall Risk Score: 75/100)\n\nThe system detected **2 specific risk rule triggers** requiring manual review by a human fraud investigator.\n\n---\n\n## Key Findings & Rule Triggers\n\n### Rapid Payment Burst to Newly Added Offshore Payee (HIGH Severity)\n- **Rule ID**: \`RULE_NEW_PAYEE_BURST\`\n- **Flagged Transactions**: [TXN-10205] [TXN-10206] [TXN-10207]\n- **Finding Details**: 4 consecutive transfers to newly added beneficiary **Apex Alpha Logistics Ltd** registered in offshore jurisdiction.\n\n### Odd-Hours Activity Spike (MEDIUM Severity)\n- **Rule ID**: \`RULE_ODD_HOURS\`\n- **Flagged Transactions**: [TXN-10205] [TXN-10206] [TXN-10207]\n- **Finding Details**: High-value wires executed between 02:15 AM and 03:02 AM.\n\n---\n\n## Investigator Recommended Next Steps\n\n1. **Primary Inspection**: Verify beneficiary registration and confirm authorization of wire transfers [TXN-10205] and [TXN-10206] with customer Marcus Vance.\n2. **Escalation**: Escalate case to AML desk if beneficiary connection is unverified.`
    },
    "CUST-103": {
      customer: { customer_id: "CUST-103", name: "Dr. Aris Thorne", account_type: "Private Wealth Premier", account_created: "2019-11-04", risk_profile: "High Risk (Massive Transfer Anomaly)", transactions: [
        { txn_id: "TXN-10301", date: "2026-05-10 10:00:00", description: "Monthly Lease Payment", payee: "BMW Financial", amount: 850.0, type: "DEBIT", channel: "ACH AutoPay" },
        { txn_id: "TXN-10306", date: "2026-08-22 14:15:00", description: "International Outward Wire", payee: "Sovereign Escrow Services", amount: 145000.0, type: "DEBIT", channel: "Wire Transfer" }
      ]},
      rule_analysis: { needs_attention: true, risk_score: 85, triggered_rules: [
        { rule_id: "RULE_LARGE_TRANSFER", rule_name: "Unusually Large Wire Transfer (Baseline Deviation)", severity: "HIGH", description: "$145,000 wire transfer exceeds historical baseline mean ($4,500) by over 32x.", flagged_transactions: ["TXN-10306"] }
      ], flagged_txn_ids: ["TXN-10306"], baseline_summary: { mean_debit_amount: 802.60, std_debit_amount: 382.10, total_transactions_analyzed: 7 } },
      report_markdown: `# Transaction Risk Investigation Report\n\n## Executive Determination\n**ATTENTION REQUIRED: MASSIVE BASELINE OUTLIER** (Overall Risk Score: 85/100)\n\n---\n\n## Key Findings & Rule Triggers\n\n### Unusually Large Wire Transfer (HIGH Severity)\n- **Rule ID**: \`RULE_LARGE_TRANSFER\`\n- **Flagged Transactions**: [TXN-10306]\n- **Finding Details**: Single outgoing wire [TXN-10306] of **$145,000.00** to Sovereign Escrow Services exceeds historical baseline by 32x.`
    },
    "CUST-104": {
      customer: { customer_id: "CUST-104", name: "Sarah Lin", account_type: "Standard Individual Checking", account_created: "2023-01-20", risk_profile: "High Risk (Pass-Through Structuring)", transactions: [
        { txn_id: "TXN-10404", date: "2026-08-18 01:10:00", description: "Incoming Wire", payee: "Unknown Sender Alpha", amount: 25000.0, type: "CREDIT", channel: "Wire Transfer" },
        { txn_id: "TXN-10406", date: "2026-08-18 02:05:00", description: "Outbound Transfer", payee: "CoinVaultX Global", amount: 9900.0, type: "DEBIT", channel: "Mobile Wire" },
        { txn_id: "TXN-10407", date: "2026-08-18 02:18:00", description: "Outbound Transfer", payee: "CoinVaultX Global", amount: 9850.0, type: "DEBIT", channel: "Mobile Wire" }
      ]},
      rule_analysis: { needs_attention: true, risk_score: 95, triggered_rules: [
        { rule_id: "RULE_STRUCTURING", rule_name: "Structuring & Threshold Avoidance", severity: "HIGH", description: "Multiple transfers near $9,900 threshold immediately following inbound wire deposit.", flagged_transactions: ["TXN-10406", "TXN-10407"] }
      ], flagged_txn_ids: ["TXN-10406", "TXN-10407"], baseline_summary: { mean_debit_amount: 112.65, std_debit_amount: 28.50, total_transactions_analyzed: 10 } },
      report_markdown: `# Transaction Risk Investigation Report\n\n## Executive Determination\n**ATTENTION REQUIRED: RAPID PASS-THROUGH & STRUCTURING** (Overall Risk Score: 95/100)\n\n---\n\n## Key Findings & Rule Triggers\n\n### Structuring & Threshold Avoidance (HIGH Severity)\n- **Rule ID**: \`RULE_STRUCTURING\`\n- **Flagged Transactions**: [TXN-10406] [TXN-10407]\n- **Finding Details**: Immediate sweep of $49,500 inbound deposit via structured sub-$10,000 crypto transfers [TXN-10406] and [TXN-10407].`
    },
    "CUST-105": {
      customer: { customer_id: "CUST-105", name: "David K. Miller", account_type: "Executive Premier Checking", account_created: "2018-05-12", risk_profile: "Ambiguous (Needs Human Review)", expected_outcome: "AMBIGUOUS_HUMAN_ESCALATION", transactions: [
        { txn_id: "TXN-10501", date: "2026-05-18 15:30:00", description: "Flight Ticket London", payee: "British Airways", amount: 4200.0, type: "DEBIT", channel: "Corporate Card" },
        { txn_id: "TXN-10504", date: "2026-08-10 11:45:00", description: "Private Jet Charter Services", payee: "Luxury Aviation Charter Paris", amount: 28500.0, type: "DEBIT", channel: "Online Wire" }
      ]},
      rule_analysis: { needs_attention: true, risk_score: 45, triggered_rules: [
        { rule_id: "RULE_LARGE_TRANSFER", rule_name: "Elevated Single Transaction Magnitude", severity: "MEDIUM", description: "Single travel wire transfer of $28,500 exceeds average executive spend, but aligns with travel category history.", flagged_transactions: ["TXN-10504"] }
      ], flagged_txn_ids: ["TXN-10504"], baseline_summary: { mean_debit_amount: 7500.0, std_debit_amount: 4800.0, total_transactions_analyzed: 4 } },
      report_markdown: `# Transaction Risk Investigation Report\n\n## Executive Determination\n**HUMAN INVESTIGATOR REVIEW REQUIRED** (Risk Score: 45/100)\n\n---\n\n## Baseline & Pattern Analysis\n- **Flagged Transaction**: [TXN-10504] ($28,500.00 to Luxury Aviation Charter Paris).\n- **Category Consistency**: Customer has an established history of high-end travel (British Airways, Ritz Carlton).\n\n## Escalation & Case Note\n> **HUMAN INVESTIGATOR REVIEW RECOMMENDED**: Transaction matches customer travel profile but presents elevated dollar magnitude. Recommend confirming travel authorization with customer David K. Miller.`
    }
  };

  renderCustomerList(summaryList);
  updateOverviewStats(summaryList);
  selectCustomer("CUST-101");
}
