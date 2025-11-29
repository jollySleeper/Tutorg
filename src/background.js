// Background service worker for TutOrg
console.log('[TutOrg] Background script loaded');

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
    console.log('[TutOrg] Extension installed/updated:', details.reason);
    
    if (details.reason === 'install') {
        // Set default rules on first install
        initializeDefaultRules();
    }
});

// Initialize with some example rules
async function initializeDefaultRules() {
    const defaultRules = [
        {
            id: Date.now().toString(),
            name: 'Example: Archive Newsletters',
            matchType: 'subject-contains',
            matchValue: 'Newsletter',
            action: 'archive',
            enabled: false,
            account: 'default'
        }
    ];

    // Save to both legacy key and new default key
    await chrome.storage.sync.set({ 
        emailRules: defaultRules,
        emailRules_default: defaultRules 
    });
    console.log('[TutOrg] Default rules initialized');
}

// Listen for messages from other parts of the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[TutOrg] Background received message:', request.action);
    
    if (request.action === 'getRules') {
        getRules(request.account).then(sendResponse);
        return true;
    }
    
    if (request.action === 'saveRules') {
        saveRules(request.rules, request.account).then(sendResponse);
        return true;
    }
});

// Get rules from storage for a specific account
async function getRules(account = 'default') {
    const storageKey = `emailRules_${account}`;
    const result = await chrome.storage.sync.get([storageKey, 'emailRules']);
    
    // Try account-specific first, then fall back to legacy global rules
    return result[storageKey] || result.emailRules || [];
}

// Save rules to storage for a specific account
async function saveRules(rules, account = 'default') {
    const storageKey = `emailRules_${account}`;
    await chrome.storage.sync.set({ [storageKey]: rules });
    console.log('[TutOrg] Saved rules for account:', account);
    await updateBadge();
    return { success: true };
}

// Badge to show number of active rules across all accounts
async function updateBadge() {
    try {
        const allStorage = await chrome.storage.sync.get(null);
        let totalEnabled = 0;
        
        // Count enabled rules across all accounts
        for (const [key, value] of Object.entries(allStorage)) {
            if (key.startsWith('emailRules') && Array.isArray(value)) {
                totalEnabled += value.filter(r => r.enabled).length;
            }
        }
        
        if (totalEnabled > 0) {
            chrome.action.setBadgeText({ text: totalEnabled.toString() });
            chrome.action.setBadgeBackgroundColor({ color: '#840b2a' });
        } else {
            chrome.action.setBadgeText({ text: '' });
        }
        
        console.log('[TutOrg] Badge updated, total enabled rules:', totalEnabled);
    } catch (error) {
        console.error('[TutOrg] Error updating badge:', error);
    }
}

// Update badge when rules change
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync') {
        const hasRuleChanges = Object.keys(changes).some(key => key.startsWith('emailRules'));
        if (hasRuleChanges) {
            console.log('[TutOrg] Storage changed, updating badge');
            updateBadge();
        }
    }
});

// Listen for keyboard shortcut commands
chrome.commands.onCommand.addListener(async (command) => {
    console.log('[TutOrg] Command received:', command);
    
    if (command === 'run-rules') {
        await runRulesViaShortcut();
    }
});

// Run rules via keyboard shortcut
async function runRulesViaShortcut() {
    try {
        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.url) {
            showNotification('TutOrg', 'No active tab found');
            return;
        }
        
        // Check if we're on Tuta Mail
        if (!tab.url.includes('mail.tuta.com') && !tab.url.includes('app.tuta.com')) {
            showNotification('TutOrg', 'Please open Tuta Mail to run rules');
            return;
        }
        
        // Get enabled rules (try to detect account first)
        const rules = await getRules('default');
        const enabledRules = rules.filter(r => r.enabled);
        
        if (enabledRules.length === 0) {
            showNotification('TutOrg', 'No enabled rules to run');
            return;
        }
        
        // Send rules to content script
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'runRules',
            rules: enabledRules
        });
        
        console.log('[TutOrg] Shortcut execution result:', response);
        
        if (response && response.success) {
            showNotification('TutOrg', response.message);
        } else {
            showNotification('TutOrg', response ? response.message : 'Failed to run rules');
        }
    } catch (error) {
        console.error('[TutOrg] Error running rules via shortcut:', error);
        showNotification('TutOrg', 'Error: ' + error.message);
    }
}

// Show notification
function showNotification(title, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: title,
        message: message
    });
}

// Initialize badge on startup
updateBadge();
