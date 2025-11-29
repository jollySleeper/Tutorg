// Content script for interacting with email clients
console.log('[TutOrg] Content script loaded on:', window.location.href);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[TutOrg] Received message:', request.action);
    
    if (request.action === 'runRules') {
        runRulesOnPage(request.rules)
            .then(result => {
                console.log('[TutOrg] Rules execution result:', result);
                sendResponse(result);
            })
            .catch(error => {
                console.error('[TutOrg] Rules execution error:', error);
                sendResponse({ success: false, message: error.message });
            });
        return true; // Keep message channel open for async response
    }
    
    if (request.action === 'getAccountInfo') {
        const account = detectCurrentAccount();
        console.log('[TutOrg] Account info requested, detected:', account);
        sendResponse({ account });
        return true;
    }
});

// Detect the current logged-in account
function detectCurrentAccount() {
    // Try multiple selectors to find the account email
    const selectors = [
        // Account email in sidebar
        '[data-testid="account-email"]',
        // Email address in header/navigation
        '.nav-button .text-ellipsis',
        // Try to find email pattern in the page
        '[class*="account"] [class*="email"]',
        // Sidebar account section
        '.folder-column .text-ellipsis'
    ];
    
    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
            const text = el.textContent.trim();
            // Check if it looks like an email address
            if (text && text.includes('@') && text.includes('.')) {
                console.log('[TutOrg] Found account email via selector:', selector, '->', text);
                return text;
            }
        }
    }
    
    // Try to find email in page text that looks like account info
    const allText = document.body.innerText;
    const emailMatch = allText.match(/([a-zA-Z0-9._-]+@(?:tuta\.com|tutanota\.com|tuta\.io|keemail\.me|tutamail\.com|tutanota\.de))/i);
    if (emailMatch) {
        console.log('[TutOrg] Found account email via regex:', emailMatch[1]);
        return emailMatch[1];
    }
    
    console.log('[TutOrg] Could not detect account email');
    return null;
}

// Main function to run rules on the current page
async function runRulesOnPage(rules) {
    console.log('[TutOrg] Starting rule execution with', rules.length, 'rules');
    
    try {
        // First, log the current page state for debugging
        debugPageState();
        
        let totalProcessed = 0;
        const results = [];

        for (const rule of rules) {
            console.log('[TutOrg] Processing rule:', rule.name, rule);
            const count = await processRule(rule);
            totalProcessed += count;
            results.push({ rule: rule.name, count });
            console.log('[TutOrg] Rule result:', rule.name, '-> matched', count, 'emails');
        }

        const message = totalProcessed > 0 
            ? `Processed ${totalProcessed} email(s) across ${results.filter(r => r.count > 0).length} rule(s)`
            : 'No emails matched the rules';

        console.log('[TutOrg] Final result:', message, results);
        showProcessingIndicator(message);
        
        return { success: true, message, results };
    } catch (error) {
        console.error('[TutOrg] Error running rules:', error);
        return { success: false, message: error.message };
    }
}

// Debug function to log page state
function debugPageState() {
    const emailRows = document.querySelectorAll('li.list-row');
    console.log('[TutOrg] DEBUG - Found', emailRows.length, 'email rows');
    
    if (emailRows.length > 0) {
        // Log first email for debugging
        const firstRow = emailRows[0];
        const subject = firstRow.querySelector('[data-testid="list-row:mail:subject"]');
        const sender = firstRow.querySelector('.text-ellipsis:not(.teamLabel):not([data-testid])');
        
        console.log('[TutOrg] DEBUG - First email:');
        console.log('  Subject element:', subject);
        console.log('  Subject text:', subject?.textContent?.trim());
        console.log('  Sender element:', sender);
        console.log('  Sender text:', sender?.textContent?.trim());
    }
    
    // Log available selectors
    console.log('[TutOrg] DEBUG - Available elements:');
    console.log('  ul.list:', document.querySelectorAll('ul.list').length);
    console.log('  li.list-row:', document.querySelectorAll('li.list-row').length);
    console.log('  [data-testid*="mail"]:', document.querySelectorAll('[data-testid*="mail"]').length);
    console.log('  .list-checkbox:', document.querySelectorAll('.list-checkbox').length);
    console.log('  .checkbox.list-checkbox:', document.querySelectorAll('.checkbox.list-checkbox').length);
}

// Process a single rule
async function processRule(rule) {
    console.log(`[TutOrg] Processing rule: ${rule.name}`);
    if (rule.matchType === 'sender-and-subject') {
        console.log(`[TutOrg] Match type: ${rule.matchType}, Sender: "${rule.senderValue}", Subject: "${rule.subjectValue}"`);
    } else {
        console.log(`[TutOrg] Match type: ${rule.matchType}, Match value: "${rule.matchValue}"`);
    }
    
    // Find matching emails
    const matchingEmails = findMatchingEmails(rule);
    
    if (matchingEmails.length === 0) {
        console.log(`[TutOrg] No emails matched rule: ${rule.name}`);
        return 0;
    }

    console.log(`[TutOrg] Found ${matchingEmails.length} matching email(s) for rule: ${rule.name}`);

    // Select the matching emails
    selectEmails(matchingEmails);

    // Wait a bit for UI to update
    await sleep(500);

    // Perform the action if not "select-only"
    if (rule.action !== 'select-only') {
        await performAction(rule.action, matchingEmails.length);
    }

    return matchingEmails.length;
}

// Find emails matching the rule criteria
function findMatchingEmails(rule) {
    const matchingElements = [];

    // Get all email rows
    const emailRows = document.querySelectorAll('li.list-row');
    console.log(`[TutOrg] Scanning ${emailRows.length} email rows for rule: ${rule.name}`);

    emailRows.forEach((row, index) => {
        let matches = false;
        let debugInfo = {};

        switch (rule.matchType) {
            case 'subject': {
                const subjectDiv = row.querySelector('[data-testid="list-row:mail:subject"]');
                const subjectText = subjectDiv?.textContent?.trim() || '';
                debugInfo.subject = subjectText;
                
                if (subjectText === rule.matchValue) {
                    matches = true;
                    console.log(`[TutOrg] EXACT SUBJECT MATCH at row ${index}: "${subjectText}"`);
                }
                break;
            }

            case 'subject-contains': {
                const subjectDiv = row.querySelector('[data-testid="list-row:mail:subject"]');
                const subjectText = subjectDiv?.textContent?.trim() || '';
                debugInfo.subject = subjectText;
                
                if (subjectText.toLowerCase().includes(rule.matchValue.toLowerCase())) {
                    matches = true;
                    console.log(`[TutOrg] SUBJECT CONTAINS MATCH at row ${index}: "${subjectText}" contains "${rule.matchValue}"`);
                }
                break;
            }

            case 'sender': {
                // Find sender - it's in a text-ellipsis div (may or may not have .b class)
                const senderText = extractSenderFromRow(row);
                debugInfo.sender = senderText;
                
                if (senderText === rule.matchValue) {
                    matches = true;
                    console.log(`[TutOrg] EXACT SENDER MATCH at row ${index}: "${senderText}"`);
                }
                break;
            }

            case 'sender-contains': {
                const senderText = extractSenderFromRow(row);
                debugInfo.sender = senderText;
                
                if (senderText.toLowerCase().includes(rule.matchValue.toLowerCase())) {
                    matches = true;
                    console.log(`[TutOrg] SENDER CONTAINS MATCH at row ${index}: "${senderText}" contains "${rule.matchValue}"`);
                }
                break;
            }

            case 'sender-and-subject': {
                // Complex rule: both sender AND subject must match
                const subjectDiv = row.querySelector('[data-testid="list-row:mail:subject"]');
                const subjectText = subjectDiv?.textContent?.trim() || '';
                const senderText = extractSenderFromRow(row);
                
                debugInfo.subject = subjectText;
                debugInfo.sender = senderText;
                
                const senderMatches = senderText.toLowerCase().includes((rule.senderValue || '').toLowerCase());
                const subjectMatches = subjectText.toLowerCase().includes((rule.subjectValue || '').toLowerCase());
                
                if (senderMatches && subjectMatches) {
                    matches = true;
                    console.log(`[TutOrg] SENDER+SUBJECT MATCH at row ${index}: sender "${senderText}" contains "${rule.senderValue}" AND subject "${subjectText}" contains "${rule.subjectValue}"`);
                }
                break;
            }
        }

        if (matches) {
            matchingElements.push(row);
        }
        
        // Log first few emails for debugging
        if (index < 3) {
            console.log(`[TutOrg] Row ${index} debug:`, debugInfo);
        }
    });

    return matchingElements;
}

// Extract sender name/email from email row
function extractSenderFromRow(row) {
    // The sender is typically in the first .text-ellipsis div that's not a teamLabel
    // and not the subject line
    const badgeLine = row.querySelector('.badge-line-height');
    if (badgeLine) {
        // Find text-ellipsis that's not teamLabel
        const senderCandidates = badgeLine.querySelectorAll('.text-ellipsis:not(.teamLabel)');
        for (const candidate of senderCandidates) {
            const text = candidate.textContent.trim();
            // Sender typically comes before the date
            if (text && !text.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d)/)) {
                return text;
            }
        }
    }
    
    // Fallback: try older selector
    const senderElements = row.querySelectorAll('.text-ellipsis');
    for (const elem of senderElements) {
        const text = elem.textContent.trim();
        // Skip if it's a date or looks like subject
        if (text && 
            !text.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d)/) &&
            !elem.closest('[data-testid="list-row:mail:subject"]')) {
            return text;
        }
    }
    
    return '';
}

// Select emails by checking their checkboxes
function selectEmails(emailRows) {
    console.log(`[TutOrg] Selecting ${emailRows.length} emails`);
    
    emailRows.forEach((row, index) => {
        // Try multiple checkbox selectors
        const checkbox = row.querySelector('input[type="checkbox"].list-checkbox') ||
                         row.querySelector('input[type="checkbox"].checkbox') ||
                         row.querySelector('input.checkbox.list-checkbox') ||
                         row.querySelector('input[type="checkbox"]');
        
        if (checkbox) {
            if (!checkbox.checked) {
                console.log(`[TutOrg] Checking checkbox for row ${index}`);
                
                // Method 1: Direct click
                checkbox.click();
                
                // Method 2: Dispatch events if click didn't work
                if (!checkbox.checked) {
                    checkbox.checked = true;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                    checkbox.dispatchEvent(new Event('input', { bubbles: true }));
                    checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                }
            } else {
                console.log(`[TutOrg] Checkbox already checked for row ${index}`);
            }
        } else {
            console.warn(`[TutOrg] No checkbox found for row ${index}`);
        }
    });
}

// Perform the specified action on selected emails
async function performAction(action, count) {
    console.log(`[TutOrg] Performing action: ${action} on ${count} email(s)`);

    switch (action) {
        case 'trash': {
            const trashButton = findButtonByTitle(['Trash', 'Delete', 'Move to trash']);
            if (trashButton) {
                console.log('[TutOrg] Found trash button, clicking...');
                trashButton.click();
                await sleep(500);
            } else {
                console.warn('[TutOrg] Trash button not found, trying keyboard shortcut');
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
            }
            break;
        }

        case 'archive': {
            const archiveButton = findButtonByTitle(['Archive', 'Move to archive']);
            if (archiveButton) {
                console.log('[TutOrg] Found archive button, clicking...');
                archiveButton.click();
                await sleep(500);
            } else {
                console.warn('[TutOrg] Archive button not found, trying keyboard shortcut');
                const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                document.dispatchEvent(new KeyboardEvent('keydown', { 
                    key: 'e', 
                    [isMac ? 'metaKey' : 'ctrlKey']: true,
                    bubbles: true 
                }));
            }
            break;
        }

        case 'mark-read': {
            const markReadButton = findButtonByTitle(['Mark as read', 'Mark read', 'Read']);
            if (markReadButton) {
                console.log('[TutOrg] Found mark-read button, clicking...');
                markReadButton.click();
                await sleep(300);
            } else {
                console.warn('[TutOrg] Mark-read button not found');
            }
            break;
        }

        case 'mark-unread': {
            const markUnreadButton = findButtonByTitle(['Mark as unread', 'Mark unread', 'Unread']);
            if (markUnreadButton) {
                console.log('[TutOrg] Found mark-unread button, clicking...');
                markUnreadButton.click();
                await sleep(300);
            } else {
                console.warn('[TutOrg] Mark-unread button not found');
            }
            break;
        }
    }
}

// Find button by title or aria-label
function findButtonByTitle(titles) {
    console.log('[TutOrg] Looking for button with titles:', titles);
    
    for (const title of titles) {
        // Try title attribute
        let button = document.querySelector(`button[title="${title}"]`);
        if (button) {
            console.log(`[TutOrg] Found button by title: "${title}"`);
            return button;
        }

        // Try aria-label
        button = document.querySelector(`button[aria-label="${title}"]`);
        if (button) {
            console.log(`[TutOrg] Found button by aria-label: "${title}"`);
            return button;
        }

        // Try case-insensitive search
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
            const btnTitle = btn.getAttribute('title') || btn.getAttribute('aria-label') || '';
            if (btnTitle.toLowerCase().includes(title.toLowerCase())) {
                console.log(`[TutOrg] Found button by partial match: "${btnTitle}"`);
                return btn;
            }
        }
    }
    
    console.warn('[TutOrg] No button found for titles:', titles);
    return null;
}

// Helper function to sleep
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Add a visual indicator when rules are being processed
function showProcessingIndicator(message) {
    const existingIndicator = document.getElementById('tuta-organizer-indicator');
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
    `;
    indicator.textContent = '📧 ' + message;
    document.body.appendChild(indicator);

    setTimeout(() => {
        if (indicator.parentNode) {
            indicator.remove();
        }
    }, 4000);
}

// Initial debug log
console.log('[TutOrg] Content script ready. Page:', document.title);
