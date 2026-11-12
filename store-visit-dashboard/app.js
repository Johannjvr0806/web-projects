"use strict";

const standards = {
  "Sales Floor": [
    "Lease line and entrance",
    "Team deployment",
    "Layout and flow",
    "Tables and flat packs",
    "Walls and fixtures",
    "Hanger discipline",
    "Signage and pricing",
    "Department execution",
    "Fitting rooms",
    "Till point",
    "Housekeeping"
  ],
  "Back of House": [
    "Stockroom organisation",
    "Walkways and safety",
    "Boxes and stock handling",
    "Hanger station",
    "IBT and delivery controls",
    "Lay-bye controls",
    "Damages and write-offs",
    "Manager administration"
  ],
  "Leadership and Culture": [
    "Lead: Be on the floor",
    "Align: One team, one plan",
    "Recognise: Say it on the day",
    "Empower: Fix it at the front",
    "Sustain: Protect the energy"
  ],
  "Previous Actions": [
    "Previous visit actions completed and evidence available"
  ]
};

const storeChecklist = [
  "Store Numbers (Manager alignment check)",
  "New Trade Update executed",
  "Floor Layout (Fully merchandised & full)",
  "Flat Pack Tables (Standards check)",
  "Hanger Disciplines (Sizing clips & sorting)",
  "Signage Compliance (Matches product/promo)",
  "Stockroom & Lay-Bye Management",
  "Manager's Office Files updated"
];

const STORAGE_KEYS = {
  actions: "actions",
  visits: "visits",
  draft: "draft",
  settings: "settings"
};
const $ = (selector, root = document) => root.querySelector(selector);
const content = $("#content");
const statusMessage = $("#statusMessage");
const pendingPhotoReads = new Set();
let actionStatusFilter = "All statuses";
let activeTab = "Sales Floor";
let activeStandardIndex = 0;
const actionFilters = { store: "All stores", status: "All statuses", priority: "All priorities", overdue: false };
let startupError = null;
let draft;
try {
  draft = loadDraft();
} catch (error) {
  draft = createDraft();
  startupError = error;
}

const DB = {
  get(key, fallback) {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored);
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(key);
  }
};

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `visit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createDraft() {
  return {
    id: createId(),
    date: new Date().toISOString().slice(0, 10),
    answers: {},
    checklist: {},
    issues: []
  };
}

function loadDraft() {
  const stored = localStorage.getItem(STORAGE_KEYS.draft);
  if (!stored) return createDraft();
  const saved = JSON.parse(stored);
  return {
    ...createDraft(),
    ...saved,
    answers: saved.answers || {},
    checklist: saved.checklist || {},
    issues: Array.isArray(saved.issues) ? saved.issues : []
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function showStatus(message, isError = false) {
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
  statusMessage.hidden = !message;
}

function readList(key) {
  const value = DB.get(key, []);
  if (!Array.isArray(value)) {
    throw new Error(`Saved ${key} data is not in the expected format.`);
  }
  return value;
}

function actions() {
  return readList(STORAGE_KEYS.actions);
}

function visits() {
  return readList(STORAGE_KEYS.visits);
}

function badge() {
  const openCount = actions().filter((action) => action.status !== "Closed").length;
  $("#actionBadge").textContent = String(openCount);
}

function go(page) {
  const pages = {
    dashboard: ["Dashboard", "Store standards, actions and visit follow-up.", dashboard],
    visit: ["Store Visit Audit - Data Capture", "Complete the audit, capture findings and generate a professional report.", visit],
    actions: ["Action Tracker", "Track owners, due dates and follow-up status.", actionPage],
    history: ["Visit History", "Review completed store visits.", history],
    reports: ["Reports", "Open and download completed visit reports.", reports],
    stores: ["Store List", "Stores are collected from your completed visits.", stores],
    settings: ["Settings", "Manage defaults for your visit reports.", settings]
  };
  const pageInfo = pages[page] || pages.dashboard;
  document.body.classList.toggle("visit-mode", page === "visit");
  document.querySelectorAll("nav button[data-page]").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  $("#pageTitle").textContent = pageInfo[0];
  $("#pageSub").textContent = pageInfo[1];
  pageInfo[2]();
  $("#sidebar").classList.remove("open");
  showStatus("");
}

function visitTable(items) {
  return `<div class="tableWrap"><table>
    <thead><tr><th>Store</th><th>Date</th><th>Type</th><th>Operational</th><th>Leadership</th><th></th></tr></thead>
    <tbody>${items.map((item) => `<tr>
      <td>${escapeHtml(item.storeName)} (${escapeHtml(item.storeCode)})</td>
      <td>${escapeHtml(item.date)}</td>
      <td>${escapeHtml(item.visitType || "Store audit")}</td>
      <td>${Number(item.operational || 0)}%</td>
      <td>${Number(item.leadership || 0)}%</td>
      <td><button class="secondary" data-open-report="${escapeHtml(item.id)}">Open report</button></td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function dashboard() {
  const allActions = actions();
  const allVisits = visits();
  const openActions = allActions.filter((action) => action.status !== "Closed");
  const today = new Date().toISOString().slice(0, 10);
  const overdue = openActions.filter((action) => action.dueDate && action.dueDate < today);
  const currentMonth = today.slice(0, 7);
  const metrics = [
    ["Open Actions", openActions.length],
    ["Overdue Actions", overdue.length],
    ["Visits This Month", allVisits.filter((item) => item.date?.slice(0, 7) === currentMonth).length],
    ["Awaiting Verification", allActions.filter((action) => action.status === "Awaiting Verification").length]
  ];
  content.innerHTML = `<div class="grid">${metrics.map(([label, value]) => `
    <div class="card metric"><small>${label}</small><strong>${value}</strong></div>`).join("")}
  </div><div class="split">
    <div class="card"><div class="sectionTitle"><h2>Recent Visits</h2><button class="secondary" data-page="history">View history</button></div>
      ${allVisits.length ? visitTable(allVisits.slice(-5).reverse()) : '<div class="empty">No visits yet. Start your first store visit.</div>'}
    </div>
    <div class="card"><div class="sectionTitle"><h2>Priority Actions</h2><button class="secondary" data-page="actions">View actions</button></div>
      ${openActions.length ? openActions.slice(0, 6).map((action) => `<p class="priorityItem">
        <span class="pill ${["High", "Critical"].includes(action.priority) ? "open" : "amber"}">${escapeHtml(action.priority || "Medium")}</span>
        <b>${escapeHtml(action.store)}</b><br><small>${escapeHtml(action.action || action.issue)}</small>
      </p>`).join("") : '<div class="empty">No open actions.</div>'}
    </div>
  </div>`;
}

function visit() {
  const savedSettings = getSettings();
  content.innerHTML = `<div class="visitToolbar">
    <div class="visitToolbarCopy"><span class="stepBadge">1</span><div>
      <h2>Store Visit Audit - Data Capture</h2>
      <p>Complete the audit, capture findings and generate a professional report.</p>
    </div></div>
    <div class="visitToolbarActions">
      <button class="secondary" data-save-draft>Save Draft</button>
      <button class="secondary" data-preview-draft>Preview Report</button>
      <button class="primary" data-complete-visit>Generate Report</button>
    </div>
  </div>
  <div class="card visitDetailsCard">
    <div class="sectionTitle"><h2>Visit Details</h2><span class="pill amber">Draft</span></div>
    <div class="formGrid visitDetailsGrid">
      <div class="field"><label for="storeName">STORE NAME *</label><input id="storeName" value="${escapeHtml(draft.storeName)}" placeholder="Select or enter store" required></div>
      <div class="field"><label for="storeCode">STORE CODE *</label><input id="storeCode" value="${escapeHtml(draft.storeCode)}" placeholder="Store code" required></div>
      <div class="field"><label for="manager">STORE MANAGER</label><input id="manager" value="${escapeHtml(draft.manager)}" placeholder="Store manager"></div>
      <div class="field"><label for="areaManager">AREA MANAGER</label><input id="areaManager" value="${escapeHtml(draft.areaManager || savedSettings.areaManager)}"></div>
      <div class="field"><label for="visitDate">VISIT DATE *</label><input id="visitDate" type="date" value="${escapeHtml(draft.date)}"></div>
      <div class="field"><label for="visitType">VISIT TYPE</label><select id="visitType">
        ${["Routine visit", "Follow-up visit", "Peak trade visit", "Stocktake follow-up", "Regional action follow-up"].map((type) =>
    `<option ${draft.visitType === type ? "selected" : ""}>${type}</option>`).join("")}
      </select></div>
      <div class="field visitNotesField"><label for="focus">GENERAL NOTES (OPTIONAL)</label>
        <textarea id="focus" rows="2" placeholder="Visit focus and notes">${escapeHtml(draft.focus)}</textarea>
      </div>
    </div>
  </div>
  <div id="audit" class="auditWorkspace"></div>
  <div class="workspacePanels">${renderActionPanel()}${renderHistoryPanel()}</div>
  ${renderReportPreview()}`;
  renderAudit();
}

function renderIssueCards(issues) {
  if (!issues.length) return '<div class="empty">No issues added. Add a note or photo above.</div>';
  return issues.map((issue) => `<article class="issueCard">
    ${issue.imageUrl ? `<img class="issueImage" src="${issue.imageUrl}" alt="Photo attached to issue">` : '<div class="issueImage issuePlaceholder" aria-hidden="true">!</div>'}
    <div class="issueCopy"><strong>${escapeHtml(issue.comment || "Photo added; no comment.")}</strong>
      <small>${escapeHtml(new Date(issue.createdAt).toLocaleString())}</small></div>
    <button class="danger" type="button" data-remove-issue="${escapeHtml(issue.id)}" aria-label="Remove issue">Remove</button>
  </article>`).join("");
}

function renderAudit() {
  const audit = $("#audit");
  const tabs = [...Object.entries(standards).map(([name, items]) => [name, items.length]), ["Summary", storeChecklist.length]];
  audit.innerHTML = `<div class="auditTabs" role="tablist">
    ${tabs.map(([name, count]) => `<button role="tab" class="${activeTab === name ? "active" : ""}" aria-selected="${activeTab === name}"
      data-audit-tab="${escapeHtml(name)}">${escapeHtml(name)} <span>${count}</span></button>`).join("")}
  </div>
  ${activeTab === "Summary" ? renderAuditSummary() : renderStandardWorkspace(activeTab)}`;
  updateChecklistProgress();
}

function renderStandardWorkspace(section) {
  const items = standards[section];
  if (!items) return "";
  activeStandardIndex = Math.min(activeStandardIndex, items.length - 1);
  const selectedKey = `${section}-${activeStandardIndex}`;
  const selected = draft.answers[selectedKey] || {};
  const list = items.map((item, index) => {
    const answer = draft.answers[`${section}-${index}`] || {};
    const color = answer.result === "Compliant" ? "green" :
      answer.result === "Action Required" ? "red" :
        answer.result === "Partially Compliant" ? "amber" : "muted";
    return `<button class="standardNavItem ${index === activeStandardIndex ? "active" : ""}" data-standard-index="${index}">
      <span class="standardNumber">${index + 1}</span><span>${escapeHtml(item)}</span><i class="statusDot ${color}"></i>
    </button>`;
  }).join("");
  const resultOptions = ["Compliant", "Partially Compliant", "Action Required", "Not Observed", "Not Applicable"];
  return `<div class="auditPanel">
    <aside class="standardNav"><h2>${escapeHtml(section)} Standards</h2>${list}</aside>
    <section class="standardEditor">
      <div class="standardEditorHeading"><div><p class="eyebrow">${escapeHtml(section)}</p>
        <h2>${activeStandardIndex + 1}. ${escapeHtml(items[activeStandardIndex])}</h2>
        <p>Check that the standard is in place, open and customer-ready.</p>
      </div><span class="standardCount">${activeStandardIndex + 1} / ${items.length}</span></div>
      <fieldset class="resultField"><legend>Result *</legend><div class="resultOptions">
        ${resultOptions.map((result) => `<button type="button" class="resultOption ${selected.result === result ? `selected ${statusClass(result)}` : ""}"
          data-result-key="${escapeHtml(selectedKey)}" data-result-value="${escapeHtml(result)}">${escapeHtml(result)}</button>`).join("")}
      </div></fieldset>
      <div class="standardEvidence">
        <div class="field"><label for="observation-${safe(selectedKey)}">OBSERVATION / COMMENT</label>
          <textarea id="observation-${safe(selectedKey)}" data-f="observation" rows="3" placeholder="Describe what you observed">${escapeHtml(selected.observation)}</textarea>
        </div>
        <div class="field"><label>PHOTO (OPTIONAL)</label>
          <label class="photoUpload"><input type="file" data-photo-key="${escapeHtml(selectedKey)}" accept="image/*" capture="environment">
            <span>Upload or capture photo</span></label>
          ${selected.photo ? `<img class="photoPreview" src="${selected.photo}" alt="Evidence photo">` : ""}
        </div>
      </div>
      <div class="correctionPanel ${["Partially Compliant", "Action Required"].includes(selected.result) ? "show" : ""}">
        <h3>If action is required or partially compliant</h3>
        <div class="issueGrid">
          <div class="field"><label>REQUIRED ACTION</label><input data-f="action" value="${escapeHtml(selected.action)}" placeholder="Enter corrective action"></div>
          <div class="field"><label>OWNER</label><input data-f="owner" value="${escapeHtml(selected.owner || "Store Manager")}"></div>
          <div class="field"><label>PRIORITY</label><select data-f="priority">
            ${["Medium", "Low", "High", "Critical"].map((priority) => `<option ${selected.priority === priority || (!selected.priority && priority === "Medium") ? "selected" : ""}>${priority}</option>`).join("")}
          </select></div>
          <div class="field"><label>DUE DATE</label><input data-f="dueDate" type="date" value="${escapeHtml(selected.dueDate)}"></div>
        </div>
      </div>
      <div class="standardPager">
        <button class="secondary" data-standard-prev ${activeStandardIndex === 0 ? "disabled" : ""}>Previous</button>
        <button class="secondary" data-standard-next ${activeStandardIndex === items.length - 1 ? "disabled" : ""}>Next standard</button>
      </div>
    </section>
  </div>`;
}

function renderAuditSummary() {
  const checks = storeChecklist.map((item, index) => `
    <label class="checklist-item">
      <input type="checkbox" data-store-check="${index}" ${draft.checklist[index] ? "checked" : ""}>
      <span class="checkmark" aria-hidden="true"></span>
      <span class="checklist-copy"><strong>${escapeHtml(item)}</strong></span>
      <span class="item-status">${draft.checklist[index] ? "DONE" : "TO DO"}</span>
    </label>`).join("");
  return `<div class="summaryWorkspace">
    <section class="card summaryChecklist"><div class="sectionTitle"><div><h2>Store Audit Checklist</h2>
      <p class="muted">Original checklist items are preserved here.</p></div><span class="pill amber" id="checklistProgress"></span></div>
      <div class="checklist">${checks}</div>
    </section>
    <section class="card summaryIssues"><div class="sectionTitle"><h2>Issues &amp; Notes</h2>
      <span class="pill amber">${draft.issues.length} ${draft.issues.length === 1 ? "issue" : "issues"}</span></div>
      <p class="muted">Add an issue note, a photo, or both. Issues are added to the Action Tracker when the visit is completed.</p>
      <form id="issueForm" class="issueForm">
        <div class="field"><label for="issueComment">ISSUE NOTE</label><textarea id="issueComment" rows="2" placeholder="What needs follow-up?"></textarea></div>
        <div class="field"><label for="issuePhoto">PHOTO</label><input id="issuePhoto" type="file" accept="image/*" capture="environment"></div>
        <button class="secondary" type="submit">+ Add Issue</button>
      </form>
      <div class="issueList" id="issueList">${renderIssueCards(draft.issues)}</div>
    </section>
  </div>`;
}

function statusClass(result) {
  return result === "Compliant" ? "compliant" :
    result === "Partially Compliant" ? "partial" :
      result === "Action Required" ? "required" : "neutral";
}

function renderActionPanel() {
  const allActions = actions();
  const openActions = allActions.filter((action) => action.status !== "Closed");
  const today = new Date().toISOString().slice(0, 10);
  const overdue = openActions.filter((action) => action.dueDate && action.dueDate < today);
  const filtered = allActions.filter((action) =>
    (actionFilters.store === "All stores" || action.store?.startsWith(actionFilters.store)) &&
    (actionFilters.status === "All statuses" || action.status === actionFilters.status) &&
    (actionFilters.priority === "All priorities" || action.priority === actionFilters.priority) &&
    (!actionFilters.overdue || (action.dueDate && action.dueDate < today && action.status !== "Closed"))
  );
  const storesList = [...new Set(allActions.map((action) => action.store).filter(Boolean))];
  const metrics = [
    ["Open actions", openActions.length, "blue"],
    ["Overdue actions", overdue.length, "red"],
    ["Awaiting verification", allActions.filter((action) => action.status === "Awaiting Verification").length, "blue"],
    ["Closed this month", allActions.filter((action) => action.status === "Closed").length, "green"],
    ["High priority", openActions.filter((action) => ["High", "Critical"].includes(action.priority)).length, "red"]
  ];
  return `<section class="card workspaceCard actionWorkspace">
    <div class="panelHeading"><div><span class="stepBadge">2</span><div><h2>Action Tracker</h2><p>All actions from store visits in one place.</p></div></div>
      <button class="primary" data-toggle-action-form>+ Add Action</button>
    </div>
    <form class="addActionForm" id="addActionForm" hidden>
      <div class="formGrid">
        <div class="field"><label>STORE</label><input name="store" value="${escapeHtml(draft.storeName && draft.storeCode ? `${draft.storeCode} ${draft.storeName}` : "")}" required></div>
        <div class="field"><label>AREA</label><input name="area" value="Sales Floor" required></div>
        <div class="field"><label>ISSUE</label><input name="issue" required></div>
        <div class="field"><label>REQUIRED ACTION</label><input name="action" required></div>
        <div class="field"><label>OWNER</label><input name="owner" value="Store Manager"></div>
        <div class="field"><label>PRIORITY</label><select name="priority"><option>Medium</option><option>Low</option><option>High</option><option>Critical</option></select></div>
        <div class="field"><label>DUE DATE</label><input name="dueDate" type="date"></div>
      </div>
      <button class="primary" type="submit">Save Action</button>
    </form>
    <div class="actionFilters">
      <select data-action-filter="store"><option>All stores</option>${storesList.map((store) => `<option ${actionFilters.store === store ? "selected" : ""}>${escapeHtml(store)}</option>`).join("")}</select>
      <select data-action-filter="status">${["All statuses", "Open", "In Progress", "Awaiting Verification", "Closed"].map((status) => `<option ${actionFilters.status === status ? "selected" : ""}>${status}</option>`).join("")}</select>
      <select data-action-filter="priority">${["All priorities", "Low", "Medium", "High", "Critical"].map((priority) => `<option ${actionFilters.priority === priority ? "selected" : ""}>${priority}</option>`).join("")}</select>
      <label class="overdueToggle"><input type="checkbox" data-action-overdue ${actionFilters.overdue ? "checked" : ""}> Overdue only</label>
    </div>
    <div class="actionMetrics">${metrics.map(([label, count, color]) => `<div class="actionMetric ${color}"><strong>${count}</strong><span>${label}</span></div>`).join("")}</div>
    ${filtered.length ? `<div class="tableWrap"><table class="denseTable"><thead><tr><th>#</th><th>Store</th><th>Area</th><th>Issue</th><th>Owner</th><th>Priority</th><th>Due Date</th><th>Status</th><th>Days Overdue</th><th>Photo</th></tr></thead>
      <tbody>${filtered.map((action, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(action.store)}</td><td>${escapeHtml(action.area)}</td><td>${escapeHtml(action.issue)}</td>
        <td>${escapeHtml(action.owner)}</td><td>${escapeHtml(action.priority || "Medium")}</td><td>${escapeHtml(action.dueDate || "-")}</td>
        <td><select data-action-status="${escapeHtml(action.id)}">${["Open", "In Progress", "Awaiting Verification", "Closed"].map((status) => `<option ${action.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></td>
        <td>${action.dueDate && action.dueDate < today && action.status !== "Closed" ? Math.floor((Date.now() - new Date(`${action.dueDate}T00:00:00`).getTime()) / 86400000) : 0}</td>
        <td>${action.photo ? `<img class="actionPhoto" src="${action.photo}" alt="Action photo">` : "-"}</td></tr>`).join("")}</tbody>
      </table></div>` : '<div class="empty">No actions match these filters.</div>'}
  </section>`;
}

function renderHistoryPanel() {
  const allVisits = visits().slice().reverse().slice(0, 6);
  return `<section class="card workspaceCard historyWorkspace">
    <div class="panelHeading"><div><span class="stepBadge">3</span><div><h2>Visit History</h2><p>View past visits, scores and follow-up actions.</p></div></div>
      <button class="secondary" data-page="history">View all</button>
    </div>
    ${allVisits.length ? `<div class="tableWrap"><table class="denseTable historyTable">
      <thead><tr><th>Date</th><th>Store</th><th>Type</th><th>Operational</th><th>Leadership</th><th>Actions</th><th>Report</th></tr></thead>
      <tbody>${allVisits.map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.storeCode)}</td><td>${escapeHtml(item.visitType || "Routine")}</td>
        <td>${Number(item.operational || 0)}%</td><td>${Number(item.leadership || 0)}%</td><td>${(item.issues || []).length}</td>
        <td><button class="textButton" data-open-report="${escapeHtml(item.id)}">View</button></td></tr>`).join("")}</tbody>
    </table></div>` : '<div class="empty">Completed visits will appear here.</div>'}
  </section>`;
}

function renderReportPreview() {
  const latest = visits().slice(-1)[0];
  if (!latest) return `<section class="card reportPreviewSection">
    <div class="panelHeading"><div><span class="stepBadge">4</span><div><h2>Example PDF Report - Store Visit Report (Preview)</h2><p>Reports include the checklist, findings, actions and photo evidence.</p></div></div></div>
    <div class="empty">Complete a visit to see its report preview here.</div>
  </section>`;
  const findings = Object.entries(latest.answers || {}).filter(([, answer]) => answer.result);
  const issueCards = (section) => findings.filter(([key]) => key.startsWith(section)).slice(0, 3).map(([key, answer]) => `
    <div class="previewFinding"><b>${escapeHtml(standards[key.split("-").slice(0, -1).join("-")]?.[Number(key.split("-").at(-1))] || key)}</b>
      <span class="pill ${statusClass(answer.result)}">${escapeHtml(answer.result)}</span>
      ${answer.observation ? `<small>${escapeHtml(answer.observation)}</small>` : ""}
      ${answer.photo ? `<img src="${answer.photo}" alt="Finding photo">` : ""}
    </div>`).join("") || '<p class="muted">No findings in this section.</p>';
  return `<section class="card reportPreviewSection">
    <div class="panelHeading"><div><span class="stepBadge">4</span><div><h2>Example PDF Report - Store Visit Report (Preview)</h2><p>Latest completed visit · ${escapeHtml(latest.storeName)} (${escapeHtml(latest.storeCode)})</p></div></div>
      <button class="secondary" data-open-report="${escapeHtml(latest.id)}">Open full report</button></div>
    <div class="pdfPreviewGrid">
      <article class="pdfPage"><div class="pdfBrand">PnP <span>Clothing</span></div><h3>Store Visit Report</h3>
        <p>${escapeHtml(latest.storeName)} (${escapeHtml(latest.storeCode)})</p><p>${escapeHtml(latest.date)}</p>
        <div class="previewScores"><b>Operational ${Number(latest.operational || 0)}%</b><b>Leadership ${Number(latest.leadership || 0)}%</b></div>
        <h4>Visit Summary</h4><p>Store manager: ${escapeHtml(latest.manager || "Not recorded")}</p>
        <p>Area manager: ${escapeHtml(latest.areaManager || "Not recorded")}</p><small>Page 1 · Summary and scores</small>
      </article>
      <article class="pdfPage"><div class="pdfBrand">PnP <span>Clothing</span></div><h3>Sales Floor Findings</h3>
        ${issueCards("Sales Floor")}<small>Page 2 · Sales floor findings</small>
      </article>
      <article class="pdfPage"><div class="pdfBrand">PnP <span>Clothing</span></div><h3>Back of House Findings</h3>
        ${issueCards("Back of House")}<h4>Visit Issues</h4><p>${(latest.issues || []).length} issue(s) recorded</p><small>Page 3 · Follow-up and evidence</small>
      </article>
    </div>
  </section>`;
}

function safe(value) {
  return value.replaceAll(" ", "_");
}

function updateChecklistProgress() {
  const progress = $("#checklistProgress");
  if (!progress) return;
  const complete = Object.values(draft.checklist).filter(Boolean).length;
  progress.textContent = `${complete} / ${storeChecklist.length} complete`;
}

function trackPhotoRead(promise) {
  pendingPhotoReads.add(promise);
  promise.then(
    () => pendingPhotoReads.delete(promise),
    () => pendingPhotoReads.delete(promise)
  );
  return promise;
}

function collectVisit() {
  draft.storeName = $("#storeName").value.trim();
  draft.storeCode = $("#storeCode").value.trim();
  draft.manager = $("#manager").value.trim();
  draft.areaManager = $("#areaManager").value.trim();
  draft.date = $("#visitDate").value;
  draft.visitType = $("#visitType").value;
  draft.focus = $("#focus").value.trim();
  const activeKey = `${activeTab}-${activeStandardIndex}`;
  const activeAnswer = draft.answers[activeKey];
  if (activeAnswer) {
    document.querySelectorAll("#audit [data-f]").forEach((field) => {
      activeAnswer[field.dataset.f] = field.value;
    });
  }
  return draft;
}

function compressPhoto(file) {
  if (!file || !file.type.startsWith("image/")) {
    return Promise.reject(new Error("Choose a valid image file."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(new Error("The selected photo could not be read. Try another image.")));
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("The selected photo could not be read. Try another image."));
        return;
      }
      const image = new Image();
      image.addEventListener("error", () => reject(new Error("The selected photo could not be prepared.")));
      image.addEventListener("load", () => {
        const maxDimension = 1280;
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("The selected photo could not be prepared."));
          return;
        }
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      });
      image.src = reader.result;
    });
    reader.readAsDataURL(file);
  });
}

async function saveDraft() {
  try {
    await Promise.all([...pendingPhotoReads]);
    collectVisit();
    DB.set(STORAGE_KEYS.draft, draft);
    showStatus("Draft saved on this device.");
  } catch (error) {
    showStatus(error.message || "The draft could not be saved. Check available browser storage.", true);
  }
}

function score(keys) {
  let points = 0;
  let count = 0;
  keys.forEach((key) => {
    const result = draft.answers[key]?.result;
    if (result === "Compliant") {
      points += 1;
      count += 1;
    } else if (result === "Partially Compliant") {
      points += 0.5;
      count += 1;
    } else if (result === "Action Required") {
      count += 1;
    }
  });
  return count ? Math.round((points / count) * 100) : 0;
}

function operationalScore() {
  const keys = ["Sales Floor", "Back of House", "Previous Actions"]
    .flatMap((section) => standards[section].map((_, index) => `${section}-${index}`));
  return score(keys);
}

function leadershipScore() {
  return score(standards["Leadership and Culture"].map((_, index) => `Leadership and Culture-${index}`));
}

function buildActions() {
  const newActions = [];
  Object.entries(draft.answers).forEach(([key, answer]) => {
    if (!["Partially Compliant", "Action Required"].includes(answer.result)) return;
    newActions.push({
      id: `${draft.id}-standard-${safe(key)}`,
      visitId: draft.id,
      store: `${draft.storeName} ${draft.storeCode}`,
      area: key.split("-")[0],
      issue: answer.observation || key,
      action: answer.action || "Correct standard",
      owner: answer.owner || "Store Manager",
      priority: answer.priority || "Medium",
      dueDate: answer.dueDate || "",
      photo: answer.photo || "",
      status: "Open"
    });
  });
  draft.issues.forEach((issue) => {
    newActions.push({
      id: `${draft.id}-issue-${issue.id}`,
      visitId: draft.id,
      store: `${draft.storeName} ${draft.storeCode}`,
      area: "Visit Issue",
      issue: issue.comment || "Photo added; no comment.",
      action: "Review and resolve the visit issue",
      owner: "Store Manager",
      priority: "Medium",
      dueDate: "",
      photo: issue.imageUrl || "",
      status: "Open"
    });
  });
  return newActions;
}

async function completeVisit() {
  try {
    await Promise.all([...pendingPhotoReads]);
    collectVisit();
    if (!draft.storeName || !draft.storeCode) {
      showStatus("Store name and store code are required before completing a visit.", true);
      $("#storeName").focus();
      return;
    }
    draft.operational = operationalScore();
    draft.leadership = leadershipScore();
    draft.completedAt = new Date().toISOString();
    const savedVisits = visits();
    const visitIndex = savedVisits.findIndex((item) => item.id === draft.id);
    if (visitIndex >= 0) savedVisits[visitIndex] = { ...draft };
    else savedVisits.push({ ...draft });
    const savedActions = actions();
    const actionIds = new Set(savedActions.map((action) => action.id));
    buildActions().forEach((action) => {
      if (!actionIds.has(action.id)) savedActions.push(action);
    });
    DB.set(STORAGE_KEYS.visits, savedVisits);
    DB.set(STORAGE_KEYS.actions, savedActions);
    DB.remove(STORAGE_KEYS.draft);
    badge();
    const completed = { ...draft };
    draft = createDraft();
    activeTab = "Sales Floor";
    activeStandardIndex = 0;
    showReport(completed);
    try {
      await downloadReport(completed);
      showStatus("Report generated and downloaded. Use Print / Save PDF if it did not download automatically.");
    } catch (error) {
      showStatus(error.message || "The visit was saved, but its PDF could not be generated. Use Print / Save PDF to try again.", true);
    }
  } catch (error) {
    showStatus(error.message || "The visit could not be saved. Check available browser storage and try again.", true);
  }
}

function actionPage() {
  const allActions = actions();
  const filtered = actionStatusFilter === "All statuses"
    ? allActions
    : allActions.filter((action) => action.status === actionStatusFilter);
  content.innerHTML = `<div class="card">
    <div class="toolbar"><label for="statusFilter">STATUS</label><select id="statusFilter">
      ${["All statuses", "Open", "In Progress", "Awaiting Verification", "Closed"].map((status) =>
    `<option ${actionStatusFilter === status ? "selected" : ""}>${status}</option>`).join("")}
    </select></div>
    ${filtered.length ? `<div class="tableWrap"><table>
      <thead><tr><th>Store</th><th>Area</th><th>Issue</th><th>Action</th><th>Owner</th><th>Priority</th><th>Due</th><th>Status</th></tr></thead>
      <tbody>${filtered.map((action) => `<tr>
        <td>${escapeHtml(action.store)}</td><td>${escapeHtml(action.area)}</td>
        <td>${escapeHtml(action.issue)}${action.photo ? `<br><img class="actionPhoto" src="${action.photo}" alt="Issue photo">` : ""}</td>
        <td>${escapeHtml(action.action)}</td><td>${escapeHtml(action.owner)}</td>
        <td><span class="pill ${["High", "Critical"].includes(action.priority) ? "open" : "amber"}">${escapeHtml(action.priority)}</span></td>
        <td>${escapeHtml(action.dueDate || "-")}</td><td><select data-action-status="${escapeHtml(action.id)}" aria-label="Status for ${escapeHtml(action.issue)}">
          ${["Open", "In Progress", "Awaiting Verification", "Closed"].map((status) =>
    `<option ${action.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select></td>
      </tr>`).join("")}</tbody>
    </table></div>` : '<div class="empty">No actions match this status.</div>'}
  </div>`;
}

function history() {
  const allVisits = visits().slice().reverse();
  content.innerHTML = `<div class="card">${allVisits.length ? visitTable(allVisits) : '<div class="empty">No completed visits yet.</div>'}</div>`;
}

function reports() {
  const allVisits = visits().slice().reverse();
  content.innerHTML = `<div class="card"><div class="sectionTitle"><h2>Completed reports</h2></div>
    ${allVisits.length ? `<div class="reportList">${allVisits.map((item) => `<div class="reportItem">
      <div><strong>${escapeHtml(item.storeName)} (${escapeHtml(item.storeCode)})</strong><small>${escapeHtml(item.date)} · ${escapeHtml(item.visitType || "Store audit")}</small></div>
      <button class="secondary" data-open-report="${escapeHtml(item.id)}">Open report</button>
    </div>`).join("")}</div>` : '<div class="empty">Reports will appear after a visit is completed.</div>'}
  </div>`;
}

function stores() {
  const byCode = new Map();
  visits().forEach((item) => byCode.set(item.storeCode || item.storeName, item));
  const allStores = [...byCode.values()];
  content.innerHTML = `<div class="card"><div class="sectionTitle"><h2>Stores</h2></div>
    ${allStores.length ? allStores.map((item) => `<div class="storeItem">
      <div><strong>${escapeHtml(item.storeName)}</strong><small>Manager: ${escapeHtml(item.manager || "Not recorded")}</small></div>
      <span class="pill amber">${escapeHtml(item.storeCode || "No code")}</span>
    </div>`).join("") : '<div class="empty">Stores are added automatically from completed visits.</div>'}
  </div>`;
}

function getSettings() {
  return DB.get(STORAGE_KEYS.settings, {
    areaManager: "Johann Janse van Rensburg",
    reportBrand: "PnP Clothing"
  });
}

function settings() {
  const saved = getSettings();
  content.innerHTML = `<div class="card"><h2>Settings</h2>
    <form id="settingsForm" class="formGrid settingsForm">
      <div class="field"><label for="settingManager">DEFAULT AREA MANAGER</label><input id="settingManager" value="${escapeHtml(saved.areaManager)}"></div>
      <div class="field"><label for="settingBrand">REPORT BRAND</label><input id="settingBrand" value="${escapeHtml(saved.reportBrand)}"></div>
      <button class="primary" type="submit">Save Settings</button>
    </form>
    <p class="note">Visits, actions, drafts and compressed photos are stored in this browser profile. This standalone prototype does not sync across devices.</p>
  </div>`;
}

function findVisit(id) {
  return visits().find((item) => item.id === id);
}

function showReport(item, isDraft = false) {
  if (!item) {
    go("reports");
    showStatus("That visit report could not be found.", true);
    return;
  }
  const checks = storeChecklist.map((label, index) => `
    <div class="reportCheck"><span>${escapeHtml(label)}</span><b>${item.checklist?.[index] ? "Complete" : "To do"}</b></div>`).join("");
  const answerEntries = Object.entries(item.answers || {});
  const findings = answerEntries.map(([key, answer]) => `<div class="standard reportStandard">
    <div><h3>${escapeHtml(key.replace(/-\d+$/, ""))}: ${escapeHtml(standards[key.split("-").slice(0, -1).join("-")]?.[Number(key.split("-").at(-1))] || key)}</h3>
      <p><b>Result:</b> ${escapeHtml(answer.result || "Not recorded")}</p>
      ${answer.observation ? `<p><b>Observation:</b> ${escapeHtml(answer.observation)}</p>` : ""}
      ${answer.action ? `<p><b>Required:</b> ${escapeHtml(answer.action)}</p>` : ""}
    </div>
    ${answer.photo ? `<img class="reportPhoto" src="${answer.photo}" alt="Audit evidence photo">` : ""}
  </div>`).join("");
  content.innerHTML = `<div class="card">
    <div class="sectionTitle"><div><small>${escapeHtml(getSettings().reportBrand)}</small>
      <h2>${escapeHtml(item.storeName)} (${escapeHtml(item.storeCode)})</h2>
      <p class="muted">Store visit feedback and required execution standards.</p>
    </div><div class="reportButtons"><button class="secondary noPrint" data-download-report="${escapeHtml(item.id)}">Download PDF</button>
      <button class="primary noPrint" type="button" onclick="window.print()">Print / Save PDF</button></div></div>
    <div class="grid reportMetrics">
      <div class="metric"><small>VISIT DATE</small><strong>${escapeHtml(item.date)}</strong></div>
      <div class="metric"><small>OPERATIONAL</small><strong>${Number(item.operational || 0)}%</strong></div>
      <div class="metric"><small>LEADERSHIP</small><strong>${Number(item.leadership || 0)}%</strong></div>
      <div class="metric"><small>ACTIONS</small><strong>${(item.issues || []).length + answerEntries.filter(([, answer]) => ["Partially Compliant", "Action Required"].includes(answer.result)).length}</strong></div>
    </div>
    <div class="reportMeta"><span><b>Visit type:</b> ${escapeHtml(item.visitType || "Store audit")}</span>
      <span><b>Store manager:</b> ${escapeHtml(item.manager || "Not recorded")}</span>
      <span><b>Area manager:</b> ${escapeHtml(item.areaManager || "")}</span></div>
  </div>
  <div class="card"><div class="sectionTitle"><h2>Store Audit Checklist</h2></div>${checks}</div>
  <div class="card"><div class="sectionTitle"><h2>Operational Standards</h2></div>
    ${findings || '<div class="empty">No operational standards were recorded.</div>'}</div>
  <div class="card"><div class="sectionTitle"><h2>Issues &amp; Notes</h2></div>
    ${item.issues?.length ? item.issues.map((issue) => `<div class="issueCard">
      ${issue.imageUrl ? `<img class="issueImage" src="${issue.imageUrl}" alt="Issue photo">` : '<div class="issueImage issuePlaceholder">!</div>'}
      <div class="issueCopy">${escapeHtml(issue.comment || "Photo added; no comment.")}</div>
    </div>`).join("") : '<div class="empty">No issues or follow-up actions were recorded.</div>'}
  </div>
  ${item.focus ? `<div class="note"><b>Management focus:</b> ${escapeHtml(item.focus)}</div>` : ""}
  <div class="footerActions noPrint">${isDraft
    ? '<button class="secondary" data-back-to-visit>Back to Visit</button>'
    : '<button class="secondary" data-page="reports">Back to Reports</button>'}</div>`;
}

function imageAsJpeg(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("error", () => reject(new Error("An issue photo could not be loaded for the PDF.")));
    image.addEventListener("load", () => {
      const maxDimension = 1400;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("A photo could not be prepared for the PDF."));
        return;
      }
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve({ data: canvas.toDataURL("image/jpeg", 0.86), width: canvas.width, height: canvas.height });
    });
    image.src = dataUrl;
  });
}

function getPdfLibraries() {
  const JsPdf = window.jspdf && window.jspdf.jsPDF;
  if (!JsPdf) {
    throw new Error("The PDF tools could not be loaded. Check your connection or use Print / Save PDF.");
  }
  return JsPdf;
}

function drawReportContinuationHeader(pdf, storeName, margin) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.setFillColor(0, 86, 145);
  pdf.rect(0, 0, pageWidth, 19, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(255, 255, 255);
  pdf.text("PnP", margin, 12);
  const pnpWidth = pdf.getTextWidth("PnP ");
  pdf.setTextColor(217, 45, 32);
  pdf.text("Clothing", margin + pnpWidth, 12);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(255, 255, 255);
  pdf.text(storeName, pageWidth - margin, 12, { align: "right" });
  pdf.setTextColor(38, 50, 56);
}

function startReportPage(pdf, storeName, margin) {
  pdf.addPage();
  drawReportContinuationHeader(pdf, storeName, margin);
  return 28;
}

function ensureReportSpace(pdf, y, needed, pageHeight, margin, storeName) {
  return y + needed <= pageHeight - margin - 8
    ? y
    : startReportPage(pdf, storeName, margin);
}

function drawReportFooter(pdf, margin, pageHeight, pageNumber, totalPages) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.setDrawColor(221, 228, 234);
  pdf.setLineWidth(0.3);
  pdf.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(107, 119, 133);
  pdf.text("PnP Clothing  |  Store Visit Report", margin, pageHeight - 8);
  pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
}

function drawSectionHeading(pdf, title, x, y) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(0, 86, 145);
  pdf.text(title, x, y);
  pdf.setDrawColor(217, 45, 32);
  pdf.setLineWidth(0.8);
  pdf.line(x, y + 2.5, x + 18, y + 2.5);
}

async function downloadReport(item) {
  const JsPdf = getPdfLibraries();
  const pdf = new JsPdf({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const navy = [0, 86, 145];
  const red = [217, 45, 32];
  const ink = [38, 50, 56];
  const muted = [107, 119, 133];
  const storeName = `${item.storeName} (${item.storeCode})`;
  const manager = item.areaManager || getSettings().areaManager;
  const dateValue = item.date
    ? new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${item.date}T00:00:00`))
    : "Not recorded";
  const checklistComplete = storeChecklist.filter((_, index) => item.checklist?.[index]).length;
  let y = 20;
  const brand = getSettings().reportBrand || "PnP Clothing";

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(23);
  pdf.setTextColor(...navy);
  pdf.text("PnP", margin, y);
  const pnpWidth = pdf.getTextWidth("PnP ");
  pdf.setTextColor(...red);
  pdf.text(brand.startsWith("PnP ") ? brand.slice(4) : brand, margin + pnpWidth, y);
  pdf.setFontSize(22);
  pdf.setTextColor(...ink);
  pdf.text("Store Visit Report", margin, 36);
  pdf.setDrawColor(...red);
  pdf.setLineWidth(1.1);
  pdf.line(margin, 40, margin + 28, 40);

  const infoY = 47;
  const infoHeight = 29;
  const infoGutter = 4;
  const infoWidth = (contentWidth - infoGutter) / 2;
  [
    { x: margin, label: "AREA MANAGER", value: manager },
    { x: margin + infoWidth + infoGutter, label: "VISIT DATE", value: dateValue }
  ].forEach((block) => {
    pdf.setFillColor(245, 248, 251);
    pdf.setDrawColor(221, 228, 234);
    pdf.roundedRect(block.x, infoY, infoWidth, infoHeight, 2, 2, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...muted);
    pdf.text(block.label, block.x + 5, infoY + 8);
    pdf.setFontSize(10);
    pdf.setTextColor(...ink);
    pdf.text(pdf.splitTextToSize(block.value || "Not recorded", infoWidth - 10), block.x + 5, infoY + 17);
  });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...muted);
  pdf.text(`STORE  ${item.storeName || "Not recorded"} (${item.storeCode || "No code"})`, margin + 1, infoY + infoHeight + 7);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...navy);
  pdf.text(`${checklistComplete} / ${storeChecklist.length} CHECKLIST ITEMS COMPLETE`, pageWidth - margin, infoY + infoHeight + 7, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...muted);
  pdf.text(`STORE MANAGER  ${item.manager || "Not recorded"}     VISIT TYPE  ${item.visitType || "Store audit"}`, margin + 1, infoY + infoHeight + 13);

  y = infoY + infoHeight + 25;
  drawSectionHeading(pdf, "Checklist Summary", margin, y);
  y += 8;
  const checklistWidths = [contentWidth * 0.55, contentWidth * 0.23, contentWidth * 0.22];
  const checklistX = [margin, margin + checklistWidths[0], margin + checklistWidths[0] + checklistWidths[1]];
  const drawChecklistHeader = () => {
    pdf.setFillColor(...navy);
    pdf.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(255, 255, 255);
    pdf.text("OPERATIONAL STANDARDS", checklistX[0] + 3, y + 7.7);
    pdf.text("STATUS", checklistX[1] + 2, y + 7.7);
    pdf.text("VERIFICATION", checklistX[2] + 2, y + 7.7);
    y += 12;
  };
  drawChecklistHeader();
  storeChecklist.forEach((label, index) => {
    const checked = Boolean(item.checklist?.[index]);
    const labelLines = pdf.splitTextToSize(label, checklistWidths[0] - 7);
    const statusLines = pdf.splitTextToSize(checked ? "COMPLETED" : "PENDING / TO DO", checklistWidths[1] - 5);
    const verificationLines = pdf.splitTextToSize(checked ? "Verified" : "Pending", checklistWidths[2] - 5);
    const rowHeight = Math.max(11, Math.max(labelLines.length, statusLines.length, verificationLines.length) * 4.5 + 5);
    const previousY = y;
    y = ensureReportSpace(pdf, y, rowHeight, pageHeight, margin, storeName);
    if (y < previousY) drawChecklistHeader();
    if (index % 2 === 0) {
      pdf.setFillColor(246, 248, 250);
      pdf.rect(margin, y, contentWidth, rowHeight, "F");
    }
    pdf.setDrawColor(225, 231, 236);
    pdf.setLineWidth(0.2);
    pdf.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...ink);
    pdf.text(labelLines, checklistX[0] + 3, y + 5.7);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(checked ? 7.8 : 7.1);
    pdf.setTextColor(...(checked ? [35, 128, 80] : [83, 91, 99]));
    pdf.text(statusLines, checklistX[1] + 2, y + 5.7);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...(checked ? [35, 128, 80] : muted));
    pdf.text(verificationLines, checklistX[2] + 2, y + 5.7);
    y += rowHeight;
  });

  const answerEntries = Object.entries(item.answers || {}).filter(([, answer]) => answer.result);
  if (answerEntries.length) {
    y += 8;
    y = ensureReportSpace(pdf, y, 22, pageHeight, margin, storeName);
    drawSectionHeading(pdf, "Operational Standards", margin, y);
    y += 8;
    const standardWidths = [contentWidth * 0.55, contentWidth * 0.23, contentWidth * 0.22];
    const standardX = [margin, margin + standardWidths[0], margin + standardWidths[0] + standardWidths[1]];
    const drawStandardsHeader = () => {
      pdf.setFillColor(...navy);
      pdf.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(255, 255, 255);
      pdf.text("STANDARD", standardX[0] + 3, y + 7.7);
      pdf.text("RESULT", standardX[1] + 2, y + 7.7);
      pdf.text("FOLLOW-UP", standardX[2] + 2, y + 7.7);
      y += 12;
    };
    drawStandardsHeader();
    answerEntries.forEach(([key, answer], rowIndex) => {
      const section = key.split("-").slice(0, -1).join("-");
      const index = Number(key.split("-").at(-1));
      const label = `${section}: ${standards[section]?.[index] || key}`;
      const labelLines = pdf.splitTextToSize(label, standardWidths[0] - 7);
      const resultLines = pdf.splitTextToSize(answer.result, standardWidths[1] - 5);
      const followUpLines = pdf.splitTextToSize(answer.action || (["Action Required", "Partially Compliant"].includes(answer.result) ? "Action open" : "-"), standardWidths[2] - 5);
      const rowHeight = Math.max(11, Math.max(labelLines.length, resultLines.length, followUpLines.length) * 4.5 + 5);
      const previousY = y;
      y = ensureReportSpace(pdf, y, rowHeight, pageHeight, margin, storeName);
      if (y < previousY) drawStandardsHeader();
      if (rowIndex % 2 === 0) {
        pdf.setFillColor(246, 248, 250);
        pdf.rect(margin, y, contentWidth, rowHeight, "F");
      }
      pdf.setDrawColor(225, 231, 236);
      pdf.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(...ink);
      pdf.text(labelLines, standardX[0] + 3, y + 5.7);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(...(answer.result === "Compliant" ? [35, 128, 80] : [83, 91, 99]));
      pdf.text(resultLines, standardX[1] + 2, y + 5.7);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...muted);
      pdf.text(followUpLines, standardX[2] + 2, y + 5.7);
      y += rowHeight;
    });
  }

  const reportItems = answerEntries
    .filter(([, answer]) => ["Partially Compliant", "Action Required"].includes(answer.result) || answer.observation || answer.photo)
    .map(([key, answer]) => {
      const section = key.split("-").slice(0, -1).join("-");
      const index = Number(key.split("-").at(-1));
      return {
        title: standards[section]?.[index] || key,
        result: answer.result,
        observation: answer.observation,
        action: answer.action,
        owner: answer.owner || "Store Manager",
        priority: answer.priority || "Medium",
        dueDate: answer.dueDate,
        imageUrl: answer.photo
      };
    })
    .concat((item.issues || []).map((issue) => ({
      title: "Visit Issue",
      observation: issue.comment || "Photo added; no comment.",
      imageUrl: issue.imageUrl
    })));

  y += 10;
  y = ensureReportSpace(pdf, y, 20, pageHeight, margin, storeName);
  drawSectionHeading(pdf, `Issue & Action Logs (${reportItems.length})`, margin, y);
  y += 9;
  if (!reportItems.length) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...muted);
    pdf.text("No issues or follow-up actions were recorded during this visit.", margin, y + 2);
    y += 10;
  }

  const contentBottom = pageHeight - margin - 8;
  const cardPadding = 5;
  const cardLineHeight = 4.6;
  const headingHeight = 10;
  const photoColumnWidth = 58;
  const photoGap = 7;
  for (let index = 0; index < reportItems.length; index += 1) {
    const reportItem = reportItems[index];
    const preparedImage = reportItem.imageUrl ? await imageAsJpeg(reportItem.imageUrl) : null;
    const imageScale = preparedImage ? Math.min(52 / preparedImage.width, 50 / preparedImage.height) : 0;
    const imageWidth = preparedImage ? preparedImage.width * imageScale : 0;
    const imageHeight = preparedImage ? preparedImage.height * imageScale : 0;
    const detailLines = [
      reportItem.result ? `Result: ${reportItem.result}` : "",
      reportItem.observation ? `Observation: ${reportItem.observation}` : "",
      reportItem.action ? `Required action: ${reportItem.action}` : "",
      reportItem.owner ? `Owner: ${reportItem.owner}` : "",
      reportItem.priority ? `Priority: ${reportItem.priority}` : "",
      reportItem.dueDate ? `Due date: ${reportItem.dueDate}` : ""
    ].filter(Boolean);
    const comment = detailLines.join("\n") || "No additional notes recorded.";
    const commentX = preparedImage ? margin + cardPadding + photoColumnWidth + photoGap : margin + cardPadding + 2;
    const commentWidth = preparedImage
      ? contentWidth - photoColumnWidth - photoGap - cardPadding * 2
      : contentWidth - cardPadding * 2 - 4;
    const commentLines = pdf.splitTextToSize(comment, commentWidth);
    let lineOffset = 0;
    let firstSegment = true;
    while (lineOffset < commentLines.length) {
      const minContentHeight = Math.max(imageHeight, preparedImage && firstSegment ? 25 : 5);
      const minCardHeight = headingHeight + cardPadding * 2 + minContentHeight;
      if (contentBottom - y < minCardHeight + 5) y = startReportPage(pdf, storeName, margin);
      const availableHeight = contentBottom - y;
      const includeImage = Boolean(preparedImage && firstSegment);
      const textStartY = y + headingHeight + cardPadding + 4;
      const textRoom = availableHeight - headingHeight - cardPadding * 2 - 5;
      const linesAvailable = Math.max(1, Math.floor(textRoom / cardLineHeight));
      const segmentLines = commentLines.slice(lineOffset, lineOffset + linesAvailable);
      const textHeight = Math.max(5, segmentLines.length * cardLineHeight);
      const imageFrameHeight = includeImage ? Math.max(imageHeight, 25) : 0;
      const cardHeight = headingHeight + cardPadding + Math.max(imageFrameHeight, textHeight) + cardPadding;
      if (cardHeight > availableHeight) {
        y = startReportPage(pdf, storeName, margin);
        continue;
      }
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(210, 220, 228);
      pdf.setLineWidth(0.35);
      pdf.roundedRect(margin, y, contentWidth, cardHeight, 2, 2, "FD");
      pdf.setFillColor(245, 248, 251);
      pdf.roundedRect(margin + 0.2, y + 0.2, contentWidth - 0.4, headingHeight, 1.8, 1.8, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(...navy);
      pdf.text(`Action Item #${index + 1} - ${reportItem.title}${firstSegment ? "" : " (continued)"}`, margin + cardPadding, y + 6.5);
      if (includeImage) {
        const imageX = margin + cardPadding;
        const imageY = textStartY;
        pdf.setFillColor(248, 249, 250);
        pdf.setDrawColor(225, 231, 236);
        pdf.roundedRect(imageX, imageY, photoColumnWidth - 4, imageFrameHeight, 1.5, 1.5, "FD");
        pdf.addImage(preparedImage.data, "JPEG", imageX + (photoColumnWidth - 4 - imageWidth) / 2,
          imageY + (imageFrameHeight - imageHeight) / 2, imageWidth, imageHeight);
      }
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(...ink);
      pdf.text(segmentLines, commentX, textStartY);
      lineOffset += segmentLines.length;
      y += cardHeight + 7;
      firstSegment = false;
      if (lineOffset < commentLines.length) y = startReportPage(pdf, storeName, margin);
    }
  }

  if (item.focus) {
    y = ensureReportSpace(pdf, y + 3, 14, pageHeight, margin, storeName);
    drawSectionHeading(pdf, "Management Focus", margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...ink);
    pdf.text(pdf.splitTextToSize(item.focus, contentWidth), margin, y + 8);
  }

  const totalPages = pdf.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    drawReportFooter(pdf, margin, pageHeight, page, totalPages);
  }

  const filenamePart = (item.storeName || "store").normalize("NFKD")
    .replace(/[^\w -]/g, "").trim().replace(/\s+/g, "-") || "store";
  const filename = `store-visit-report-${filenamePart}-${item.date || "visit"}.pdf`;
  const reportBlob = pdf.output("blob");
  if (!(reportBlob instanceof Blob) || reportBlob.size === 0) {
    throw new Error("The PDF was empty and could not be downloaded. Please try again.");
  }
  const reportUrl = URL.createObjectURL(reportBlob);
  const downloadLink = document.createElement("a");
  downloadLink.href = reportUrl;
  downloadLink.download = filename;
  downloadLink.hidden = true;
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  window.setTimeout(() => URL.revokeObjectURL(reportUrl), 60000);
}

function setStatus(id, status) {
  const allActions = actions();
  const action = allActions.find((item) => item.id === id);
  if (!action) throw new Error("That action could not be found.");
  action.status = status;
  DB.set(STORAGE_KEYS.actions, allActions);
  badge();
}

function addIssueFromForm(form) {
  const comment = $("#issueComment", form).value.trim();
  const file = $("#issuePhoto", form).files[0];
  if (!comment && !file) {
    showStatus("Add a comment or choose a photo before adding an issue.", true);
    return;
  }
  const saveIssue = (imageUrl) => {
    draft.issues.push({ id: createId(), comment, imageUrl, createdAt: new Date().toISOString() });
    form.reset();
    $("#issueList").innerHTML = renderIssueCards(draft.issues);
    form.closest(".card").querySelector(".sectionTitle .pill").textContent =
      `${draft.issues.length} ${draft.issues.length === 1 ? "issue" : "issues"}`;
    showStatus("");
  };
  if (!file) {
    saveIssue("");
    return;
  }
  trackPhotoRead(compressPhoto(file)).then(saveIssue)
    .catch((error) => showStatus(error.message, true));
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("#menuBtn")) {
    $("#sidebar").classList.toggle("open");
    return;
  }
  const pageButton = target.closest("[data-page]");
  const destination = pageButton?.dataset.page || target.closest("[data-go]")?.dataset.go;
  if (destination) {
    go(destination);
    return;
  }
  const tabButton = target.closest("[data-audit-tab]");
  if (tabButton) {
    activeTab = tabButton.dataset.auditTab;
    activeStandardIndex = 0;
    renderAudit();
    return;
  }
  const standardButton = target.closest("[data-standard-index]");
  if (standardButton) {
    activeStandardIndex = Number(standardButton.dataset.standardIndex);
    renderAudit();
    return;
  }
  const resultButton = target.closest("[data-result-key]");
  if (resultButton) {
    const key = resultButton.dataset.resultKey;
    draft.answers[key] = draft.answers[key] || {};
    draft.answers[key].result = resultButton.dataset.resultValue;
    if (!draft.answers[key].owner) draft.answers[key].owner = "Store Manager";
    if (!draft.answers[key].priority) draft.answers[key].priority = "Medium";
    renderAudit();
    return;
  }
  if (target.closest("[data-standard-prev]") && activeStandardIndex > 0) {
    activeStandardIndex -= 1;
    renderAudit();
    return;
  }
  if (target.closest("[data-standard-next]") && activeStandardIndex < standards[activeTab].length - 1) {
    activeStandardIndex += 1;
    renderAudit();
    return;
  }
  if (target.closest("[data-preview-draft]")) {
    try {
      collectVisit();
      showReport({ ...draft, operational: operationalScore(), leadership: leadershipScore() }, true);
    } catch (error) {
      showStatus(error.message || "The report preview could not be opened.", true);
    }
    return;
  }
  if (target.closest("[data-back-to-visit]")) {
    go("visit");
    return;
  }
  if (target.closest("[data-toggle-action-form]")) {
    const form = $("#addActionForm");
    form.hidden = !form.hidden;
    if (!form.hidden) $('input[name="issue"]', form).focus();
    return;
  }
  if (target.closest("[data-save-draft]")) {
    saveDraft();
    return;
  }
  if (target.closest("[data-complete-visit]")) {
    completeVisit();
    return;
  }
  const removeButton = target.closest("[data-remove-issue]");
  if (removeButton) {
    draft.issues = draft.issues.filter((issue) => issue.id !== removeButton.dataset.removeIssue);
    $("#issueList").innerHTML = renderIssueCards(draft.issues);
    const pill = removeButton.closest(".card").querySelector(".sectionTitle .pill");
    if (pill) pill.textContent = `${draft.issues.length} ${draft.issues.length === 1 ? "issue" : "issues"}`;
    return;
  }
  const openButton = target.closest("[data-open-report]");
  if (openButton) {
    showReport(findVisit(openButton.dataset.openReport));
    return;
  }
  const downloadButton = target.closest("[data-download-report]");
  if (downloadButton) {
    const item = findVisit(downloadButton.dataset.downloadReport)
      || (draft.id === downloadButton.dataset.downloadReport ? draft : null);
    downloadReport(item).then(() => showStatus("Report downloaded."))
      .catch((error) => showStatus(error.message, true));
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  if (target.matches("#storeName")) draft.storeName = target.value;
  if (target.matches("#storeCode")) draft.storeCode = target.value;
  if (target.matches("#manager")) draft.manager = target.value;
  if (target.matches("#areaManager")) draft.areaManager = target.value;
  if (target.matches("#visitDate")) draft.date = target.value;
  if (target.matches("#focus")) draft.focus = target.value;
  if (target.matches("#audit [data-f]")) {
    const key = `${activeTab}-${activeStandardIndex}`;
    draft.answers[key] = draft.answers[key] || {};
    draft.answers[key][target.dataset.f] = target.value;
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  if (target.matches("[data-store-check]")) {
    draft.checklist[target.dataset.storeCheck] = target.checked;
    const status = target.closest(".checklist-item").querySelector(".item-status");
    status.textContent = target.checked ? "DONE" : "TO DO";
    updateChecklistProgress();
    return;
  }
  if (target.matches("[data-action-status]")) {
    try {
      setStatus(target.dataset.actionStatus, target.value);
      const panel = target.closest(".actionWorkspace");
      if (panel) panel.outerHTML = renderActionPanel();
      else actionPage();
    } catch (error) {
      showStatus(error.message, true);
    }
    return;
  }
  if (target.matches("[data-action-filter]")) {
    actionFilters[target.dataset.actionFilter] = target.value;
    const panel = target.closest(".actionWorkspace");
    if (panel) panel.outerHTML = renderActionPanel();
    return;
  }
  if (target.matches("[data-action-overdue]")) {
    actionFilters.overdue = target.checked;
    const panel = target.closest(".actionWorkspace");
    if (panel) panel.outerHTML = renderActionPanel();
    return;
  }
  if (target.matches("[data-photo-key]") && target.files[0]) {
    const key = target.dataset.photoKey;
    trackPhotoRead(compressPhoto(target.files[0])).then((photo) => {
      draft.answers[key] = draft.answers[key] || {};
      draft.answers[key].photo = photo;
      const field = target.closest(".field");
      let preview = $(".photoPreview", field);
      if (!preview) {
        preview = document.createElement("img");
        preview.className = "photoPreview";
        preview.alt = "Evidence photo";
        field.append(preview);
      }
      preview.src = photo;
      showStatus("");
    }).catch((error) => showStatus(error.message, true));
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "addActionForm") {
    event.preventDefault();
    try {
      const form = event.target;
      const values = new FormData(form);
      const newAction = {
        id: createId(),
        visitId: draft.id,
        store: String(values.get("store")).trim(),
        area: String(values.get("area")).trim(),
        issue: String(values.get("issue")).trim(),
        action: String(values.get("action")).trim(),
        owner: String(values.get("owner")).trim() || "Store Manager",
        priority: String(values.get("priority")),
        dueDate: String(values.get("dueDate")),
        status: "Open"
      };
      if (!newAction.store || !newAction.area || !newAction.issue || !newAction.action) {
        throw new Error("Complete the store, area, issue and required action fields.");
      }
      const allActions = actions();
      allActions.push(newAction);
      DB.set(STORAGE_KEYS.actions, allActions);
      badge();
      form.reset();
      const panel = form.closest(".actionWorkspace");
      panel.outerHTML = renderActionPanel();
      showStatus("Action added.");
    } catch (error) {
      showStatus(error.message || "The action could not be saved.", true);
    }
    return;
  }
  if (event.target.id === "issueForm") {
    event.preventDefault();
    addIssueFromForm(event.target);
    return;
  }
  if (event.target.id === "settingsForm") {
    event.preventDefault();
    try {
      DB.set(STORAGE_KEYS.settings, {
        areaManager: $("#settingManager").value.trim(),
        reportBrand: $("#settingBrand").value.trim() || "PnP Clothing"
      });
      showStatus("Settings saved.");
    } catch (error) {
      showStatus(error.message || "Settings could not be saved.", true);
    }
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "statusFilter") {
    actionStatusFilter = event.target.value;
    actionPage();
  }
});

try {
  badge();
  go("visit");
  if (startupError) {
    showStatus(startupError.message || "The saved draft could not be loaded.", true);
  }
} catch (error) {
  showStatus(error.message || "Saved app data could not be loaded.", true);
}
