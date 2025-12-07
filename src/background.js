/**
 * TutOrg - Background Service Worker
 * Handles extension lifecycle, keyboard shortcuts, and messaging
 */

// ============================================
// Constants (duplicated since SW can't use modules)
// ============================================
const LOG_PREFIX = '[TutOrg]';
const STORAGE_KEYS = {
    RULES_PREFIX: 'emailRules_',
    LEGACY_RULES: 'emailRules',
    TARGET_TAB: 'targetTabId'
};
const TUTA_URLS = ['mail.tuta.com', 'app.tuta.com'];

function getRuleKeys(account = 'default') {
    return {
        accountKey: `${STORAGE_KEYS.RULES_PREFIX}${account}`,
        defaultKey: `${STORAGE_KEYS.RULES_PREFIX}default`,
        legacyKey: STORAGE_KEYS.LEGACY_RULES
    };
}

// ============================================
// Logger
// ============================================
const log = (...args) => console.log(LOG_PREFIX, ...args);
const logError = (...args) => console.error(LOG_PREFIX, ...args);

// ============================================
// Utility Functions
// ============================================

/**
 * Check if URL is a Tuta Mail URL
 */
function isTutaUrl(url) {
    if (!url) return false;
    return TUTA_URLS.some(domain => url.includes(domain));
}

/**
 * Find a Tuta Mail tab (with priority for stored target)
 */
async function findTutaTab() {
    try {
        // First check stored target tab
        const result = await chrome.storage.local.get(STORAGE_KEYS.TARGET_TAB);
        const storedTabId = result[STORAGE_KEYS.TARGET_TAB];
        
        if (storedTabId) {
            try {
                const tab = await chrome.tabs.get(storedTabId);
                if (isTutaUrl(tab.url)) {
                    log('Using stored target tab:', storedTabId);
                    return tab;
                }
            } catch {
                // Tab no longer exists, clear it
                await chrome.storage.local.remove(STORAGE_KEYS.TARGET_TAB);
            }
        }

        // Then check active tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab && isTutaUrl(activeTab.url)) {
            return activeTab;
        }

        // Finally, find any Tuta tab
        const allTabs = await chrome.tabs.query({});
        return allTabs.find(tab => isTutaUrl(tab.url)) || null;
    } catch (error) {
        logError('Error finding Tuta tab:', error);
        return null;
    }
}

// ============================================
// Storage Operations
// ============================================

/**
 * Get rules for a specific account
 */
async function getRules(account = 'default') {
    try {
        const { accountKey, defaultKey, legacyKey } = getRuleKeys(account);
        const keys = [accountKey, defaultKey, legacyKey];

        const [localResult, syncResult] = await Promise.all([
            chrome.storage.local.get(keys),
            chrome.storage.sync.get(keys)
        ]);

        const rules =
            localResult[accountKey] ||
            localResult[defaultKey] ||
            localResult[legacyKey] ||
            syncResult[accountKey] ||
            syncResult[defaultKey] ||
            syncResult[legacyKey] ||
            [];

        // Migrate to local if we only found data in sync
        if (!localResult[accountKey] && rules.length > 0) {
            await chrome.storage.local.set({ [accountKey]: rules });
        }

        return rules;
    } catch (error) {
        logError('Error loading rules:', error);
        return [];
    }
}

/**
 * Save rules for a specific account
 */
async function saveRules(rules, account = 'default') {
    try {
        const { accountKey, defaultKey } = getRuleKeys(account);
        const payload = { [accountKey]: rules, [defaultKey]: rules };

        await chrome.storage.local.set(payload);
        await chrome.storage.sync.set(payload);

        log('Saved', rules.length, 'rules for account:', account);
        await updateBadge();
        return { success: true };
    } catch (error) {
        logError('Error saving rules:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get enabled rules count
 */
async function getEnabledRulesCount() {
    try {
        const [localAll, syncAll] = await Promise.all([
            chrome.storage.local.get(null),
            chrome.storage.sync.get(null)
        ]);
        const allStorage = { ...syncAll, ...localAll }; // local wins
        let count = 0;
        
        for (const [key, value] of Object.entries(allStorage)) {
            if (key.startsWith(STORAGE_KEYS.RULES_PREFIX) && Array.isArray(value)) {
                count += value.filter(r => r.enabled).length;
            }
        }
        
        return count;
    } catch (error) {
        logError('Error counting rules:', error);
        return 0;
    }
}

// ============================================
// Badge Management
// ============================================

/**
 * Update extension badge with enabled rules count
 */
async function updateBadge() {
    try {
        const count = await getEnabledRulesCount();
        
        if (count > 0) {
            await chrome.action.setBadgeText({ text: count.toString() });
            await chrome.action.setBadgeBackgroundColor({ color: '#840b2a' });
        } else {
            await chrome.action.setBadgeText({ text: '' });
        }
        
        log('Badge updated, enabled rules:', count);
    } catch (error) {
        logError('Error updating badge:', error);
    }
}

// ============================================
// Notifications
// ============================================

/**
 * Show a notification
 */
function showNotification(title, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title,
        message
    });
}

// ============================================
// Rule Execution
// ============================================

/**
 * Run rules via keyboard shortcut
 */
async function runRulesViaShortcut() {
    try {
        const tab = await findTutaTab();
        
        if (!tab) {
            showNotification('TutOrg', 'No Tuta Mail tab found. Please open Tuta Mail.');
            return;
        }
        
        const rules = await getRules('default');
        const enabledRules = rules.filter(r => r.enabled);
        
        if (enabledRules.length === 0) {
            showNotification('TutOrg', 'No enabled rules to run');
            return;
        }
        
        log('Running', enabledRules.length, 'rules via shortcut');
        
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'runRules',
            rules: enabledRules
        });
        
        log('Shortcut execution result:', response);
        
        const message = response?.success 
            ? response.message 
            : (response?.message || 'Failed to run rules');
        
        showNotification('TutOrg', message);
    } catch (error) {
        logError('Error running rules via shortcut:', error);
        showNotification('TutOrg', 'Error: ' + error.message);
    }
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize default rules on first install
 */
async function initializeDefaultRules() {
    const defaultRules = [{
        id: Date.now().toString(),
        name: 'Example: Archive Newsletters',
        matchType: 'subject-contains',
        matchValue: 'Newsletter',
        action: 'archive',
        enabled: false,
        account: 'default'
    }];

    const payload = { 
        [STORAGE_KEYS.LEGACY_RULES]: defaultRules,
        [`${STORAGE_KEYS.RULES_PREFIX}default`]: defaultRules 
    };

    await chrome.storage.local.set(payload);
    await chrome.storage.sync.set(payload);
    
    log('Default rules initialized');
}

// ============================================
// Event Listeners
// ============================================

// Extension installed/updated
chrome.runtime.onInstalled.addListener((details) => {
    log('Extension installed/updated:', details.reason);
    
    if (details.reason === 'install') {
        initializeDefaultRules();
    }
});

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('Received message:', request.action);
    
    switch (request.action) {
        case 'getRules':
            getRules(request.account).then(sendResponse);
            return true;
            
        case 'saveRules':
            saveRules(request.rules, request.account).then(sendResponse);
            return true;
            
        case 'findTutaTab':
            findTutaTab().then(tab => sendResponse({ tab }));
            return true;
            
        case 'runRulesBackground':
            runRulesViaShortcut().then(() => sendResponse({ success: true }));
            return true;
    }
});

// Keyboard shortcut commands
chrome.commands.onCommand.addListener((command) => {
    log('Command received:', command);
    
    if (command === 'run-rules') {
        runRulesViaShortcut();
    }
});

// Storage changes (for badge updates)
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' || areaName === 'local') {
        const hasRuleChanges = Object.keys(changes).some(key => 
            key.startsWith(STORAGE_KEYS.RULES_PREFIX)
        );
        
        if (hasRuleChanges) {
            log('Rules changed, updating badge');
            updateBadge();
        }
    }
});

// Initialize badge on startup
log('Background script loaded');
updateBadge();
