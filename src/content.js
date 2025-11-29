/**
 * TutOrg - Content Script
 * Runs on Tuta Mail pages to interact with emails
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
    checkbox: [
        'input[type="checkbox"].list-checkbox',
        'input[type="checkbox"].checkbox',
        'input.checkbox.list-checkbox',
        'input[type="checkbox"]'
    ]
};

const BUTTON_TITLES = {
    trash: ['Trash', 'Delete', 'Move to trash'],
    archive: ['Archive', 'Move to archive'],
    markRead: ['Mark as read', 'Mark read', 'Read'],
    markUnread: ['Mark as unread', 'Mark unread', 'Unread']
};

const TIMING = {
    actionDelay: 500,
    quickActionDelay: 300,
    indicatorTimeout: 4000
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
const logDebug = (...args) => console.log(LOG_PREFIX, 'DEBUG -', ...args);

// ============================================
// Utility Functions
// ============================================

/**
 * Sleep/delay utility
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Safe query selector
 */
const $ = (selector, context = document) => {
    try {
        return context.querySelector(selector);
    } catch {
        return null;
    }
};

/**
 * Safe query selector all
 */
const $$ = (selector, context = document) => {
    try {
        return context.querySelectorAll(selector);
    } catch {
        return [];
    }
};

// ============================================
// Account Detection
// ============================================

/**
 * Detect current logged-in account
 */
function detectCurrentAccount() {
    // Try multiple selectors
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
                log('Found account via selector:', selector, '->', text);
                return text;
            }
        }
    }
    
    // Try regex match in page text
    const emailPattern = new RegExp(
        `([a-zA-Z0-9._-]+@(?:${TUTA_EMAIL_DOMAINS.join('|')}))`, 'i'
    );
    const match = document.body.innerText.match(emailPattern);
    
    if (match) {
        log('Found account via regex:', match[1]);
        return match[1];
    }
    
    log('Could not detect account email');
    return null;
}

// ============================================
// Email Extraction
// ============================================

/**
 * Extract sender name from email row
 */
function extractSenderFromRow(row) {
    // Try badge line first
    const badgeLine = $(SELECTORS.badgeLine, row);
    if (badgeLine) {
        const candidates = $$(
            `${SELECTORS.textEllipsis}:not(${SELECTORS.teamLabel})`, 
            badgeLine
        );
        
        for (const candidate of candidates) {
            const text = candidate.textContent.trim();
            // Skip dates
            if (text && !text.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d)/)) {
                return text;
            }
        }
    }
    
    // Fallback to text-ellipsis elements
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

/**
 * Extract subject from email row
 */
function extractSubjectFromRow(row) {
    const subjectEl = $(SELECTORS.subject, row);
    return subjectEl?.textContent?.trim() || '';
}

// ============================================
// Rule Matching
// ============================================

/**
 * Check if email row matches a rule
 */
function matchesRule(row, rule) {
    const sender = extractSenderFromRow(row);
    const subject = extractSubjectFromRow(row);
    
    switch (rule.matchType) {
        case 'subject':
            return subject === rule.matchValue;
            
        case 'subject-contains':
            return subject.toLowerCase().includes(rule.matchValue.toLowerCase());
            
        case 'sender':
            return sender === rule.matchValue;
            
        case 'sender-contains':
            return sender.toLowerCase().includes(rule.matchValue.toLowerCase());
            
        case 'sender-and-subject': {
            const senderMatch = sender.toLowerCase().includes(
                (rule.senderValue || '').toLowerCase()
            );
            const subjectMatch = subject.toLowerCase().includes(
                (rule.subjectValue || '').toLowerCase()
            );
            return senderMatch && subjectMatch;
        }
            
        default:
            return false;
    }
}

/**
 * Find all emails matching a rule
 */
function findMatchingEmails(rule) {
    const rows = $$(SELECTORS.emailRow);
    const matches = [];
    
    log(`Scanning ${rows.length} emails for rule: ${rule.name}`);
    
    rows.forEach((row, index) => {
        if (matchesRule(row, rule)) {
            matches.push(row);
            log(`Match found at row ${index}`);
        }
    });
    
    return matches;
}

// ============================================
// Email Selection
// ============================================

/**
 * Select emails by checking their checkboxes
 */
function selectEmails(rows) {
    log(`Selecting ${rows.length} emails`);
    
    rows.forEach((row, index) => {
        // Try multiple checkbox selectors
        let checkbox = null;
        for (const selector of SELECTORS.checkbox) {
            checkbox = $(selector, row);
            if (checkbox) break;
        }
        
        if (!checkbox) {
            logWarn(`No checkbox found for row ${index}`);
            return;
        }
        
        if (checkbox.checked) {
            log(`Row ${index} already selected`);
            return;
        }
        
        // Try direct click first
        checkbox.click();
        
        // Fallback to event dispatch if needed
        if (!checkbox.checked) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            checkbox.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        log(`Selected row ${index}`);
    });
}

// ============================================
// Actions
// ============================================

/**
 * Find a button by title/aria-label
 */
function findButton(titles) {
    for (const title of titles) {
        // Exact match
        let btn = $(`button[title="${title}"]`) || 
                  $(`button[aria-label="${title}"]`);
        if (btn) return btn;
        
        // Partial match
        const allButtons = $$('button');
        for (const b of allButtons) {
            const t = b.getAttribute('title') || b.getAttribute('aria-label') || '';
            if (t.toLowerCase().includes(title.toLowerCase())) {
                return b;
            }
        }
    }
    
    logWarn('Button not found for:', titles);
    return null;
}

/**
 * Perform action on selected emails
 */
async function performAction(action, count) {
    log(`Performing action: ${action} on ${count} email(s)`);
    
    const actions = {
        trash: async () => {
            const btn = findButton(BUTTON_TITLES.trash);
            if (btn) {
                btn.click();
                await sleep(TIMING.actionDelay);
            }
        },
        archive: async () => {
            const btn = findButton(BUTTON_TITLES.archive);
            if (btn) {
                btn.click();
                await sleep(TIMING.actionDelay);
            }
        },
        'mark-read': async () => {
            const btn = findButton(BUTTON_TITLES.markRead);
            if (btn) {
                btn.click();
                await sleep(TIMING.quickActionDelay);
            }
        },
        'mark-unread': async () => {
            const btn = findButton(BUTTON_TITLES.markUnread);
            if (btn) {
                btn.click();
                await sleep(TIMING.quickActionDelay);
            }
        }
    };
    
    const actionFn = actions[action];
    if (actionFn) {
        await actionFn();
    }
}

// ============================================
// Rule Processing
// ============================================

/**
 * Process a single rule
 */
async function processRule(rule) {
    log(`Processing rule: ${rule.name}`);
    
    if (rule.matchType === 'sender-and-subject') {
        log(`  Sender: "${rule.senderValue}", Subject: "${rule.subjectValue}"`);
    } else {
        log(`  Match: "${rule.matchValue}"`);
    }
    
    const matches = findMatchingEmails(rule);
    
    if (matches.length === 0) {
        log(`  No matches found`);
        return 0;
    }
    
    log(`  Found ${matches.length} match(es)`);
    
    selectEmails(matches);
    await sleep(TIMING.actionDelay);
    
    if (rule.action !== 'select-only') {
        await performAction(rule.action, matches.length);
    }
    
    return matches.length;
}

/**
 * Run all rules on the page
 */
async function runRulesOnPage(rules) {
    log(`Starting rule execution with ${rules.length} rules`);
    
    try {
        let totalProcessed = 0;
        const results = [];
        
        for (const rule of rules) {
            const count = await processRule(rule);
            totalProcessed += count;
            results.push({ rule: rule.name, count });
        }
        
        const message = totalProcessed > 0
            ? `Processed ${totalProcessed} email(s) across ${results.filter(r => r.count > 0).length} rule(s)`
            : 'No emails matched the rules';
        
        log('Final result:', message);
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

/**
 * Show processing result indicator
 */
function showIndicator(message) {
    const existingIndicator = $('#tuta-organizer-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    const indicator = document.createElement('div');
    indicator.id = 'tuta-organizer-indicator';
    indicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #840b2a 0%, #6b1e3a 100%);
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        max-width: 300px;
        animation: tutorg-slide-in 0.3s ease;
    `;
    indicator.textContent = '📧 ' + message;
    
    // Add animation keyframes
    if (!$('#tutorg-styles')) {
        const style = document.createElement('style');
        style.id = 'tutorg-styles';
        style.textContent = `
            @keyframes tutorg-slide-in {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(indicator);
    
    setTimeout(() => {
        if (indicator.parentNode) {
            indicator.style.animation = 'tutorg-slide-in 0.3s ease reverse';
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
                .catch(error => {
                    logError('Rules execution error:', error);
                    sendResponse({ success: false, message: error.message });
                });
            return true; // Keep channel open for async
            
        case 'getAccountInfo':
            const account = detectCurrentAccount();
            log('Account info requested:', account);
            sendResponse({ account });
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
log('Page title:', document.title);
