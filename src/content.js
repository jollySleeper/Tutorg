/**
 * TutOrg - Content Script
 * Runs on Tuta Mail pages to interact with emails
 * Supports multi-value matching and folder operations
 */

// ============================================
// Constants
// ============================================
const LOG_PREFIX = '[TutOrg]';

const SELECTORS = {
    emailRow: 'li.list-row',
    subject: '[data-testid="list-row:mail:subject"]',
    badgeLine: '.badge-line-height',
    textEllipsis: '.text-ellipsis',
    teamLabel: '.teamLabel',
    listContainer: '[data-testid="unordered_list"]',
    checkbox: [
        'input[type="checkbox"].list-checkbox',
        'input[type="checkbox"].checkbox',
        'input.checkbox.list-checkbox',
        'input[type="checkbox"]'
    ],
    // Folder related selectors
    moveButton: 'button[data-testid="btn:move_action"]',
    folderDropdown: '[data-testid="dropdown:menu"]',
    folderButton: 'button[data-testid^="btn:dropdown-folder:"]'
};

const BUTTON_TITLES = {
    trash: ['Trash', 'Delete', 'Move to trash'],
    archive: ['Archive', 'Move to archive'],
    move: ['Move'],
    markRead: ['Mark as read', 'Mark read', 'Read'],
    markUnread: ['Mark as unread', 'Mark unread', 'Unread']
};

const TIMING = {
    actionDelay: 1000,      // wait after primary actions (trash/archive/move)
    quickActionDelay: 1000, // wait after lighter actions (mark read/unread)
    folderDelay: 2000,      // wait after selecting a folder in Move dropdown
    indicatorTimeout: 4000,
    rowSettleTimeout: 2000, // max wait for moved/deleted rows to disappear
    scrollResetDelay: 500   // wait after forcing scroll-to-top before reading rows
};

const TUTA_EMAIL_DOMAINS = [
    'tuta.com', 'tutanota.com', 'tuta.io',
    'keemail.me', 'tutamail.com', 'tutanota.de'
];

// ============================================
// Logger
// ============================================
const log = (...args) => console.log(LOG_PREFIX, ...args);
const logError = (...args) => console.error(LOG_PREFIX, ...args);
const logWarn = (...args) => console.warn(LOG_PREFIX, ...args);

// ============================================
// Utility Functions
// ============================================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function resetScrollBeforeCollect() {
    const list = $(SELECTORS.listContainer) || document.querySelector('.list-container.overflow-y-scroll');
    if (list) {
        log('Resetting list scroll to top');
        if (typeof list.scrollTo === 'function') {
            list.scrollTo({ top: 0, behavior: 'instant' });
        } else {
            list.scrollTop = 0;
        }
    } else {
        logWarn('List container not found; cannot reset scroll');
    }
    await sleep(TIMING.scrollResetDelay);
}

/**
 * Wait until all given rows are gone/hidden, or timeout reached.
 */
async function waitForRowsToDisappear(rows, timeout = TIMING.rowSettleTimeout) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const allGone = rows.every(r => !r?.isConnected || r.offsetParent === null);
        if (allGone) return true;
        await sleep(200);
    }
    logWarn('Timeout waiting for rows to disappear after action');
    return false;
}

async function ensureNoSelectionBeforeRun() {
    const attempts = 3;
    for (let i = 0; i < attempts; i++) {
        const checked = document.querySelectorAll(`${SELECTORS.emailRow} input[type="checkbox"]:checked`);
        if (checked.length === 0) return true;
        
        logWarn(`Attempt ${i + 1}/${attempts}: Found ${checked.length} pre-selected email(s); waiting before running rules`);
        if (i < attempts - 1) {
            await sleep(1000);
        }
    }
    
    const finalChecked = document.querySelectorAll(`${SELECTORS.emailRow} input[type="checkbox"]:checked`).length;
    if (finalChecked > 0) {
        logWarn('Aborting rule run: selection still present after retries');
        showIndicator('Please clear current selections, then run rules again');
        return false;
    }
    return true;
}

const $ = (selector, context = document) => {
    try {
        return context.querySelector(selector);
    } catch {
        return null;
    }
};

const $$ = (selector, context = document) => {
    try {
        return context.querySelectorAll(selector);
    } catch {
        return [];
    }
};

/**
 * Get values array from rule property
 * Expects array format: ["val1", "val2"]
 */
function getValuesArray(value) {
    if (!value || !Array.isArray(value)) return [];
    return value.filter(v => v && v.length > 0);
}

/**
 * Check if text matches any of the values (case-insensitive contains)
 */
function matchesAnyValue(text, values, exact = false) {
    if (!text || !values.length) return false;
    const lowerText = text.toLowerCase();
    
    return values.some(value => {
        const lowerValue = value.toLowerCase();
        return exact ? lowerText === lowerValue : lowerText.includes(lowerValue);
    });
}

// ============================================
// Account Detection
// ============================================
function detectCurrentAccount() {
    const selectors = [
        '[data-testid="account-email"]',
        '.nav-button .text-ellipsis',
        '[class*="account"] [class*="email"]',
        '.folder-column .text-ellipsis'
    ];
    
    for (const selector of selectors) {
        const elements = $$(selector);
        for (const el of elements) {
            const text = el.textContent.trim();
            if (text && text.includes('@') && text.includes('.')) {
                return text;
            }
        }
    }
    
    const emailPattern = new RegExp(
        `([a-zA-Z0-9._-]+@(?:${TUTA_EMAIL_DOMAINS.join('|')}))`, 'i'
    );
    const match = document.body.innerText.match(emailPattern);
    
    if (match) return match[1];
    return null;
}

// ============================================
// Folder Detection (via Move button dropdown)
// ============================================

/**
 * Fetch folders by opening the Move dropdown
 * This simulates clicking Move to reveal all available folders
 */
async function fetchFoldersFromDropdown() {
    log('Fetching folders from Move dropdown...');
    
    // Find the Move button in action bar
    const moveBtn = $('button[data-testid="btn:move_action"]') ||
                    findButton(['Move']);
    
    if (!moveBtn) {
        logWarn('Move button not found - cannot fetch folders');
        return [];
    }
    
    // Click to open dropdown
    moveBtn.click();
    await sleep(300);
    
    // Wait for dropdown to appear
    let dropdown = null;
    for (let i = 0; i < 10; i++) {
        dropdown = $('[data-testid="dropdown:menu"]');
        if (dropdown) break;
        await sleep(100);
    }
    
    if (!dropdown) {
        logWarn('Folder dropdown did not appear');
        return [];
    }
    
    // Parse all folder buttons from dropdown
    const folders = [];
    const folderButtons = $$('button[data-testid^="btn:dropdown-folder:"]', dropdown);
    
    folderButtons.forEach(btn => {
        const testId = btn.getAttribute('data-testid') || '';
        const folderName = testId.replace('btn:dropdown-folder:', '');
        const displayText = btn.textContent?.trim() || folderName;
        
        if (folderName) {
            folders.push({
                name: folderName,
                displayName: displayText.replace(/^\.\s*/, ''), // Remove leading ". " for nested
                testId: testId
            });
        }
    });
    
    log(`Found ${folders.length} folders:`, folders.map(f => f.name));
    
    // Close the dropdown by pressing Escape or clicking elsewhere
    document.body.click();
    await sleep(100);
    
    // Double-check dropdown is closed
    const stillOpen = $('[data-testid="dropdown:menu"]');
    if (stillOpen) {
        const closeBtn = $('button[data-testid="btn:close_alt"]');
        if (closeBtn) closeBtn.click();
    }
    
    return folders;
}

// ============================================
// Email Extraction
// ============================================
function extractSenderFromRow(row) {
    const badgeLine = $(SELECTORS.badgeLine, row);
    if (badgeLine) {
        const candidates = $$(
            `${SELECTORS.textEllipsis}:not(${SELECTORS.teamLabel})`, 
            badgeLine
        );
        
        for (const candidate of candidates) {
            const text = candidate.textContent.trim();
            if (text && !text.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d)/)) {
                return text;
            }
        }
    }
    
    const elements = $$(SELECTORS.textEllipsis, row);
    for (const elem of elements) {
        const text = elem.textContent.trim();
        if (text && 
            !text.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d)/) &&
            !elem.closest(SELECTORS.subject)) {
            return text;
        }
    }
    
    return '';
}

function extractSubjectFromRow(row) {
    const subjectEl = $(SELECTORS.subject, row);
    return subjectEl?.textContent?.trim() || '';
}

// ============================================
// Rule Matching (with multi-value support)
// ============================================

/**
 * Collect all visible emails with their data
 * Called ONCE before processing all rules
 */
function collectAllEmails() {
    const rows = $$(SELECTORS.emailRow);
    const emails = [];
    
    log(`Collecting ${rows.length} visible emails`);
    
    rows.forEach((row, index) => {
        emails.push({
            row,
            index,
            sender: extractSenderFromRow(row),
            subject: extractSubjectFromRow(row),
            processed: false // Track if already processed by a rule
        });
    });
    
    return emails;
}

/**
 * Find matching emails from pre-collected data
 */
function findMatchingEmails(rule, emailsData) {
    const matches = [];
    
    emailsData.forEach(email => {
        // Skip already processed emails
        if (email.processed) return;
        
        if (matchesRuleWithData(email, rule)) {
            matches.push(email);
            log(`Match found: "${email.subject}" from "${email.sender}"`);
        }
    });
    
    return matches;
}

/**
 * Match rule against pre-extracted email data
 * Uses array format: matchValues, senderValues, subjectValues
 */
function matchesRuleWithData(email, rule) {
    const { sender, subject } = email;
    
    switch (rule.matchType) {
        case 'subject': {
            return matchesAnyValue(subject, getValuesArray(rule.matchValues), true);
        }
        case 'subject-contains': {
            return matchesAnyValue(subject, getValuesArray(rule.matchValues), false);
        }
        case 'sender': {
            return matchesAnyValue(sender, getValuesArray(rule.matchValues), true);
        }
        case 'sender-contains': {
            return matchesAnyValue(sender, getValuesArray(rule.matchValues), false);
        }
        case 'sender-and-subject': {
            return matchesAnyValue(sender, getValuesArray(rule.senderValues), false) && 
                   matchesAnyValue(subject, getValuesArray(rule.subjectValues), false);
        }
        default:
            return false;
    }
}

// ============================================
// Email Selection
// ============================================
function selectEmails(rows) {
    log(`Selecting ${rows.length} emails`);
    
    rows.forEach((row, index) => {
        let checkbox = null;
        for (const selector of SELECTORS.checkbox) {
            checkbox = $(selector, row);
            if (checkbox) break;
        }
        
        if (!checkbox) {
            logWarn(`No checkbox found for row ${index}`);
            return;
        }
        
        if (checkbox.checked) return;
        
                checkbox.click();
                
                if (!checkbox.checked) {
                    checkbox.checked = true;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
}

// ============================================
// Actions
// ============================================
function findButton(titles) {
    for (const title of titles) {
        let btn = $(`button[title="${title}"]`) || 
                  $(`button[aria-label="${title}"]`);
        if (btn) return btn;
        
        const allButtons = $$('button');
        for (const b of allButtons) {
            const t = b.getAttribute('title') || b.getAttribute('aria-label') || '';
            if (t.toLowerCase().includes(title.toLowerCase())) {
                return b;
            }
        }
    }
    return null;
}

/**
 * Move emails to a specific folder
 */
async function moveToFolder(folderName) {
    log(`Moving to folder: ${folderName}`);
    
    // Click the Move button
    const moveBtn = findButton(BUTTON_TITLES.move) || $(SELECTORS.moveButton);
    if (!moveBtn) {
        logWarn('Move button not found');
        return false;
    }
    
    moveBtn.click();
    await sleep(TIMING.actionDelay);
    
    // Wait for dropdown to appear
    const dropdown = $(SELECTORS.folderDropdown);
    if (!dropdown) {
        logWarn('Folder dropdown not found');
        return false;
    }
    
    // Find the folder button
    const folderBtn = $(`button[data-testid="btn:dropdown-folder:${folderName}"]`) ||
                      $(`button[title*="${folderName}"]`, dropdown);
    
    if (!folderBtn) {
        // Try finding by text content
        const allFolderBtns = $$(SELECTORS.folderButton);
        for (const btn of allFolderBtns) {
            if (btn.textContent?.includes(folderName)) {
                btn.click();
                await sleep(TIMING.folderDelay);
                return true;
            }
        }
        logWarn(`Folder "${folderName}" not found`);
        return false;
    }
    
    folderBtn.click();
    await sleep(TIMING.folderDelay);
    return true;
}

async function performAction(action, count, rule = {}) {
    log(`Performing action: ${action} on ${count} email(s)`);
    
    const actions = {
        trash: async () => {
            const btn = findButton(BUTTON_TITLES.trash);
            if (btn) {
                btn.click();
                await sleep(TIMING.actionDelay);
                return true;
            }
            return false;
        },
        archive: async () => {
            const btn = findButton(BUTTON_TITLES.archive);
            if (btn) {
                btn.click();
                await sleep(TIMING.actionDelay);
                return true;
            }
            return false;
        },
        'move-to-folder': async () => {
            if (rule.targetFolder) {
                return await moveToFolder(rule.targetFolder);
            }
            return false;
        },
        'mark-read': async () => {
            const btn = findButton(BUTTON_TITLES.markRead);
            if (btn) {
                btn.click();
                await sleep(TIMING.quickActionDelay);
                return true;
            }
            return false;
        },
        'mark-unread': async () => {
            const btn = findButton(BUTTON_TITLES.markUnread);
            if (btn) {
                btn.click();
                await sleep(TIMING.quickActionDelay);
                return true;
            }
            return false;
        }
    };
    
    const actionFn = actions[action];
    if (actionFn) {
        return await actionFn();
    }
    return false;
}

// ============================================
// Rule Processing
// ============================================

/**
 * Process a single rule against pre-collected emails
 * @param {Object} rule - The rule to process
 * @param {Array} emailsData - Pre-collected email data
 * @returns {Promise<number>} - Number of emails processed
 */
async function processRule(rule, emailsData) {
    log(`Processing rule: ${rule.name}`);
    
    if (rule.matchType === 'sender-and-subject') {
        const senders = getValuesArray(rule.senderValues);
        const subjects = getValuesArray(rule.subjectValues);
        log(`  Sender values: ${senders.join(' | ') || '(none)'}, Subject values: ${subjects.join(' | ') || '(none)'}`);
    } else {
        const matches = getValuesArray(rule.matchValues);
        log(`  Match values: ${matches.join(' | ') || '(none)'}`);
    }
    
    // Find matches from pre-collected data
    const matches = findMatchingEmails(rule, emailsData);
    
    if (matches.length === 0) {
        log(`  No matches found`);
        return 0;
    }
    
    log(`  Found ${matches.length} match(es)`);
    log(`  Rule "${rule.name}", Matches:`, matches.map(m => `${m.sender} | ${m.subject}`));
    
    // Get actual row elements
    const rows = matches.map(m => m.row);
    
    selectEmails(rows);
    await sleep(TIMING.actionDelay);
    
    if (rule.action !== 'select-only') {
        const actionOk = await performAction(rule.action, matches.length, rule);
        
        // Mark these emails as processed (they've been moved/deleted)
        matches.forEach(m => m.processed = true);

        // Wait for the selected rows to disappear/clear to ensure the move/trash finished
        if (actionOk && ['trash', 'archive', 'move-to-folder'].includes(rule.action)) {
            await waitForRowsToDisappear(rows);
        }
    }
    
    return matches.length;
}

/**
 * Run all rules on current page
 * Collects emails fresh before each rule to avoid stale/stale-reused rows
 */
async function runRulesOnPage(rules) {
    log(`Starting rule execution with ${rules.length} rules`);
    
    try {
        let totalProcessed = 0;
        const results = [];
        
        for (const rule of rules) {
            const okRule = await ensureNoSelectionBeforeRun();
            if (!okRule) {
                return { success: false, message: `Selections present before rule "${rule.name}". Clear selection and retry.` };
            }
            // Reset scroll so we collect the full visible list (UI may have scrolled down)
            await resetScrollBeforeCollect();

            const emailsData = collectAllEmails();
            log(`Collected ${emailsData.length} emails for rule "${rule.name}"`);

            if (emailsData.length === 0) {
                log('No emails visible; stopping rule execution');
                break;
            }

            const count = await processRule(rule, emailsData);
            totalProcessed += count;
            results.push({ rule: rule.name, count });
        }
        
        const message = totalProcessed > 0
            ? `Processed ${totalProcessed} email(s)`
            : 'No emails matched';
        
        showIndicator(message);
        
        return { success: true, message, results };
    } catch (error) {
        logError('Error running rules:', error);
        return { success: false, message: error.message };
    }
}

// ============================================
// Visual Indicator
// ============================================
function showIndicator(message) {
    const existing = $('#tuta-organizer-indicator');
    if (existing) existing.remove();

    const indicator = document.createElement('div');
    indicator.id = 'tuta-organizer-indicator';
    indicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #840b2a 0%, #6b1e3a 100%);
        color: white;
        padding: 12px 18px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        animation: tutorg-slide 0.3s ease;
    `;
    indicator.textContent = '📧 ' + message;
    
    if (!$('#tutorg-styles')) {
        const style = document.createElement('style');
        style.id = 'tutorg-styles';
        style.textContent = `
            @keyframes tutorg-slide {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(indicator);

    setTimeout(() => {
        if (indicator.parentNode) {
            indicator.style.animation = 'tutorg-slide 0.3s ease reverse';
            setTimeout(() => indicator.remove(), 300);
        }
    }, TIMING.indicatorTimeout);
}

// ============================================
// Message Handling
// ============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('Received message:', request.action);
    
    switch (request.action) {
        case 'runRules':
            runRulesOnPage(request.rules)
                .then(sendResponse)
                .catch(error => sendResponse({ success: false, message: error.message }));
            return true;
            
        case 'getAccountInfo':
            sendResponse({ account: detectCurrentAccount() });
            return true;
            
        case 'getFolders':
            fetchFoldersFromDropdown()
                .then(folders => sendResponse({ folders }))
                .catch(error => sendResponse({ folders: [], error: error.message }));
            return true;
            
        case 'ping':
            sendResponse({ pong: true });
            return true;
    }
});

// ============================================
// Initialization
// ============================================
log('Content script loaded on:', window.location.href);
