// Popup script for managing rules and UI
let rules = [];
let currentAccount = null;
let editingRuleId = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    await detectCurrentAccount();
    await loadRules();
    renderRules();
    setupEventListeners();
    console.log('[TutOrg] Popup initialized, account:', currentAccount);
});

// Detect current Tuta account from the active tab
async function detectCurrentAccount() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tab.url && (tab.url.includes('mail.tuta.com') || tab.url.includes('app.tuta.com'))) {
            // Try to get account info from content script
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'getAccountInfo' });
            if (response && response.account) {
                currentAccount = response.account;
                console.log('[TutOrg] Detected account:', currentAccount);
            }
        }
    } catch (error) {
        console.log('[TutOrg] Could not detect account:', error.message);
    }
    
    // Fallback to 'default' if no account detected
    if (!currentAccount) {
        currentAccount = 'default';
    }
    
    updateAccountDisplay();
}

// Update account display in UI
function updateAccountDisplay() {
    const accountDisplay = document.getElementById('currentAccount');
    if (accountDisplay) {
        accountDisplay.textContent = currentAccount === 'default' 
            ? 'Not detected (using global rules)' 
            : currentAccount;
    }
}

// Load rules from storage (per account)
async function loadRules() {
    try {
        const storageKey = `emailRules_${currentAccount}`;
        const result = await chrome.storage.sync.get([storageKey, 'emailRules']);
        
        // First try account-specific rules, then fallback to global rules
        rules = result[storageKey] || result.emailRules || [];
        console.log('[TutOrg] Loaded rules for account', currentAccount, ':', rules.length, 'rules');
    } catch (error) {
        console.error('[TutOrg] Error loading rules:', error);
        rules = [];
    }
}

// Save rules to storage (per account)
async function saveRules() {
    try {
        const storageKey = `emailRules_${currentAccount}`;
        await chrome.storage.sync.set({ [storageKey]: rules });
        console.log('[TutOrg] Saved', rules.length, 'rules for account:', currentAccount);
    } catch (error) {
        console.error('[TutOrg] Error saving rules:', error);
    }
}

// Setup event listeners using event delegation
function setupEventListeners() {
    document.getElementById('addRule').addEventListener('click', showAddRuleForm);
    document.getElementById('saveRule').addEventListener('click', saveOrUpdateRule);
    document.getElementById('cancelRule').addEventListener('click', hideAddRuleForm);
    document.getElementById('runRules').addEventListener('click', runRules);
    document.getElementById('refreshPage').addEventListener('click', refreshPage);
    document.getElementById('openWindow').addEventListener('click', openInWindow);
    
    // Event delegation for rule actions (toggle, delete, edit)
    document.getElementById('rulesList').addEventListener('click', handleRuleAction);
}

// Open extension in a new window (like Bitwarden)
function openInWindow() {
    const popupURL = chrome.runtime.getURL('src/popup.html');
    chrome.windows.create({
        url: popupURL,
        type: 'popup',
        width: 450,
        height: 600,
        focused: true
    }, (window) => {
        console.log('[TutOrg] Opened in new window:', window.id);
        // Close the popup after opening the window
        window.close();
    });
}

// Handle rule actions via event delegation
function handleRuleAction(event) {
    const button = event.target.closest('button');
    if (!button) return;
    
    const ruleItem = button.closest('.rule-item');
    if (!ruleItem) return;
    
    const ruleId = ruleItem.dataset.ruleId;
    console.log('[TutOrg] Rule action clicked:', button.dataset.action, 'for rule:', ruleId);
    
    if (button.dataset.action === 'toggle') {
        toggleRule(ruleId);
    } else if (button.dataset.action === 'delete') {
        deleteRule(ruleId);
    } else if (button.dataset.action === 'edit') {
        editRule(ruleId);
    }
}

// Show add rule form
function showAddRuleForm() {
    editingRuleId = null;
    document.getElementById('formTitle').textContent = 'Add New Rule';
    document.getElementById('saveRule').textContent = 'Save Rule';
    document.getElementById('addRuleForm').classList.remove('hidden');
    document.getElementById('addRule').disabled = true;
    clearForm();
}

// Hide add rule form
function hideAddRuleForm() {
    document.getElementById('addRuleForm').classList.add('hidden');
    document.getElementById('addRule').disabled = false;
    editingRuleId = null;
    clearForm();
}

// Clear form
function clearForm() {
    document.getElementById('ruleName').value = '';
    document.getElementById('matchType').value = 'subject';
    document.getElementById('matchValue').value = '';
    document.getElementById('action').value = 'trash';
    document.getElementById('enabled').checked = true;
}

// Edit existing rule
function editRule(ruleId) {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) {
        console.error('[TutOrg] Rule not found:', ruleId);
        return;
    }
    
    console.log('[TutOrg] Editing rule:', rule);
    
    editingRuleId = ruleId;
    document.getElementById('formTitle').textContent = 'Edit Rule';
    document.getElementById('saveRule').textContent = 'Update Rule';
    
    // Populate form with rule data
    document.getElementById('ruleName').value = rule.name;
    document.getElementById('matchType').value = rule.matchType;
    document.getElementById('matchValue').value = rule.matchValue;
    document.getElementById('action').value = rule.action;
    document.getElementById('enabled').checked = rule.enabled;
    
    document.getElementById('addRuleForm').classList.remove('hidden');
    document.getElementById('addRule').disabled = true;
}

// Save new rule or update existing
async function saveOrUpdateRule() {
    const ruleName = document.getElementById('ruleName').value.trim();
    const matchType = document.getElementById('matchType').value;
    const matchValue = document.getElementById('matchValue').value.trim();
    const action = document.getElementById('action').value;
    const enabled = document.getElementById('enabled').checked;

    if (!ruleName || !matchValue) {
        showStatus('Please fill in all required fields', 'error');
        return;
    }

    if (editingRuleId) {
        // Update existing rule
        const ruleIndex = rules.findIndex(r => r.id === editingRuleId);
        if (ruleIndex !== -1) {
            rules[ruleIndex] = {
                ...rules[ruleIndex],
                name: ruleName,
                matchType,
                matchValue,
                action,
                enabled
            };
            console.log('[TutOrg] Updated rule:', rules[ruleIndex]);
            showStatus('Rule updated successfully!', 'success');
        }
    } else {
        // Add new rule
        const newRule = {
            id: Date.now().toString(),
            name: ruleName,
            matchType,
            matchValue,
            action,
            enabled,
            account: currentAccount
        };

        rules.push(newRule);
        console.log('[TutOrg] Added new rule:', newRule);
        showStatus('Rule added successfully!', 'success');
    }

    await saveRules();
    renderRules();
    hideAddRuleForm();
}

// Render rules list
function renderRules() {
    const rulesList = document.getElementById('rulesList');
    
    if (rules.length === 0) {
        rulesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <div class="empty-state-text">No rules yet. Click "+ Add Rule" to get started!</div>
            </div>
        `;
        return;
    }

    rulesList.innerHTML = rules.map(rule => `
        <div class="rule-item ${rule.enabled ? '' : 'disabled'}" data-rule-id="${escapeHtml(rule.id)}">
            <div class="rule-header">
                <div class="rule-name">${escapeHtml(rule.name)}</div>
                <div class="rule-toggle">
                    <button class="btn btn-small btn-edit" data-action="edit" title="Edit rule">
                        ✏️
                    </button>
                    <button class="btn btn-small ${rule.enabled ? 'btn-secondary' : 'btn-primary'}" data-action="toggle">
                        ${rule.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn btn-small btn-danger" data-action="delete" title="Delete rule">
                        Delete
                    </button>
                </div>
            </div>
            <div class="rule-details">
                <span class="rule-match">${formatMatchType(rule.matchType)}: ${escapeHtml(rule.matchValue)}</span>
                <span class="rule-action">→ ${formatAction(rule.action)}</span>
            </div>
        </div>
    `).join('');
    
    console.log('[TutOrg] Rendered', rules.length, 'rules');
}

// Toggle rule enabled/disabled
async function toggleRule(ruleId) {
    const rule = rules.find(r => r.id === ruleId);
    if (rule) {
        rule.enabled = !rule.enabled;
        console.log('[TutOrg] Toggled rule:', rule.name, 'enabled:', rule.enabled);
        await saveRules();
        renderRules();
        showStatus(`Rule ${rule.enabled ? 'enabled' : 'disabled'}`, 'success');
    } else {
        console.error('[TutOrg] Rule not found for toggle:', ruleId);
    }
}

// Delete rule
async function deleteRule(ruleId) {
    const rule = rules.find(r => r.id === ruleId);
    const confirmed = confirm(`Are you sure you want to delete the rule "${rule?.name || ruleId}"?`);
    
    if (!confirmed) {
        console.log('[TutOrg] Delete cancelled for rule:', ruleId);
        return;
    }
    
    const originalLength = rules.length;
    rules = rules.filter(r => r.id !== ruleId);
    
    console.log('[TutOrg] Deleted rule:', ruleId, 'Rules before:', originalLength, 'after:', rules.length);
    
    await saveRules();
    renderRules();
    showStatus('Rule deleted', 'success');
}

// Run rules
async function runRules() {
    const enabledRules = rules.filter(r => r.enabled);
    
    if (enabledRules.length === 0) {
        showStatus('No enabled rules to run', 'error');
        return;
    }

    showStatus('Running rules...', 'success');
    console.log('[TutOrg] Running', enabledRules.length, 'enabled rules');
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab.url || !(tab.url.includes('mail.tuta.com') || tab.url.includes('app.tuta.com'))) {
            showStatus('Please open your email client to run rules', 'error');
            return;
        }

        // Send rules to content script
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'runRules',
            rules: enabledRules
        });

        console.log('[TutOrg] Response from content script:', response);

        if (response && response.success) {
            showStatus(`✓ ${response.message}`, 'success');
        } else {
            showStatus(response ? response.message : 'Failed to run rules', 'error');
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
        console.error('[TutOrg] Error running rules:', error);
    }
}

// Refresh page
async function refreshPage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.reload(tab.id);
        showStatus('Page refreshed', 'success');
    } catch (error) {
        showStatus('Error refreshing page', 'error');
    }
}

// Show status message
function showStatus(message, type = 'success') {
    const statusElement = document.getElementById('status');
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;
    
    setTimeout(() => {
        statusElement.textContent = '';
        statusElement.className = 'status-message';
    }, 5000);
}

// Format match type for display
function formatMatchType(matchType) {
    const types = {
        'subject': 'Subject',
        'sender': 'Sender',
        'subject-contains': 'Subject Contains',
        'sender-contains': 'Sender Contains'
    };
    return types[matchType] || matchType;
}

// Format action for display
function formatAction(action) {
    const actions = {
        'trash': 'Move to Trash',
        'archive': 'Archive',
        'mark-read': 'Mark as Read',
        'mark-unread': 'Mark as Unread',
        'select-only': 'Select Only'
    };
    return actions[action] || action;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
