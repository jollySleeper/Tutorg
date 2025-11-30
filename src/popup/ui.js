/**
 * TutOrg - UI Service
 * Handles all UI operations, tooltips, status messages, and DOM manipulation
 */

import { TIMING, MATCH_TYPES, ACTION_TYPES } from '../lib/constants.js';
import { escapeHtml, $, createElement } from '../lib/utils.js';

/**
 * UI Service for popup interface
 */
class UIService {
    constructor() {
        this._statusTimeout = null;
        this._tooltipElement = null;
        this._initTooltipSystem();
    }

    /**
     * Initialize custom tooltip system
     * Native tooltips don't work well in extension popups
     */
    _initTooltipSystem() {
        // Create tooltip container
        this._tooltipElement = createElement('div', {
            className: 'custom-tooltip',
            id: 'customTooltip'
        });
        
        // Add to body when DOM is ready
        if (document.body) {
            document.body.appendChild(this._tooltipElement);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                document.body.appendChild(this._tooltipElement);
            });
        }
    }

    /**
     * Setup tooltip for an element
     * @param {HTMLElement} element - Element to add tooltip to
     * @param {string} text - Tooltip text
     */
    setupTooltip(element, text) {
        if (!element || !text) return;

        element.addEventListener('mouseenter', (e) => {
            this._showTooltip(e.target, text);
        });

        element.addEventListener('mouseleave', () => {
            this._hideTooltip();
        });

        element.addEventListener('focus', (e) => {
            this._showTooltip(e.target, text);
        });

        element.addEventListener('blur', () => {
            this._hideTooltip();
        });
    }

    /**
     * Show tooltip near an element
     * @param {HTMLElement} target - Target element
     * @param {string} text - Tooltip text
     */
    _showTooltip(target, text) {
        if (!this._tooltipElement) return;

        this._tooltipElement.textContent = text;
        this._tooltipElement.classList.add('visible');

        // Position tooltip
        const rect = target.getBoundingClientRect();
        const tooltipRect = this._tooltipElement.getBoundingClientRect();
        
        let top = rect.bottom + 8;
        let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

        // Keep within viewport
        if (left < 10) left = 10;
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }

        this._tooltipElement.style.top = `${top}px`;
        this._tooltipElement.style.left = `${left}px`;
    }

    /**
     * Hide tooltip
     */
    _hideTooltip() {
        if (this._tooltipElement) {
            this._tooltipElement.classList.remove('visible');
        }
    }

    /**
     * Show status message
     * @param {string} message - Message to display
     * @param {string} type - Message type ('success' or 'error')
     */
    showStatus(message, type = 'success') {
        const statusElement = $('#status');
        if (!statusElement) return;

        // Clear existing timeout
        if (this._statusTimeout) {
            clearTimeout(this._statusTimeout);
        }

        statusElement.textContent = message;
        statusElement.className = `status-message ${type}`;

        // Auto-clear after timeout
        this._statusTimeout = setTimeout(() => {
            statusElement.textContent = '';
            statusElement.className = 'status-message';
        }, TIMING.STATUS_TIMEOUT);
    }

    /**
     * Update account display
     * @param {string} account - Account identifier
     */
    updateAccountDisplay(account) {
        const accountDisplay = $('#currentAccount');
        if (accountDisplay) {
            accountDisplay.textContent = account === 'default' 
                ? 'Not detected (using global rules)' 
                : account;
        }
    }

    /**
     * Get match type help text
     * @param {string} matchType - Match type key
     * @returns {string} - Help text
     */
    getMatchTypeHelp(matchType) {
        return MATCH_TYPES[matchType]?.help || '';
    }

    /**
     * Check if match type is complex (requires multiple fields)
     * @param {string} matchType - Match type key
     * @returns {boolean}
     */
    isComplexMatchType(matchType) {
        return MATCH_TYPES[matchType]?.isComplex || false;
    }

    /**
     * Format match type for display
     * @param {string} matchType - Match type key
     * @returns {string} - Display name
     */
    formatMatchType(matchType) {
        return MATCH_TYPES[matchType]?.displayName || matchType;
    }

    /**
     * Format action for display
     * @param {string} action - Action key
     * @param {Object} rule - Optional rule object for extra info
     * @returns {string} - Display name
     */
    formatAction(action, rule = {}) {
        if (action === 'move-to-folder' && rule.targetFolder) {
            return `📁 ${rule.targetFolder}`;
        }
        return ACTION_TYPES[action] || action;
    }

    /**
     * Count values (handles both array and comma-separated string)
     * @param {string|Array} value - Array or comma-separated string
     * @returns {number} - Number of values
     */
    _countValues(value) {
        if (!value) return 0;
        if (Array.isArray(value)) {
            return value.filter(v => v).length;
        }
        return value.split(',').map(v => v.trim()).filter(v => v).length;
    }

    /**
     * Truncate text with ellipsis
     * @param {string} text - Text to truncate
     * @param {number} maxLen - Max length
     * @returns {string} - Truncated text
     */
    _truncate(text, maxLen = 20) {
        if (!text || text.length <= maxLen) return text;
        return text.substring(0, maxLen) + '...';
    }

    /**
     * Convert value to display string (handles array or string)
     */
    _toDisplayString(value) {
        if (Array.isArray(value)) {
            return value.join(', ');
        }
        return value || '';
    }

    /**
     * Format rule match for display (handles complex rules and multi-values)
     * Supports both new array format and old string format
     * @param {Object} rule - Rule object
     * @returns {string} - HTML string
     */
    formatRuleMatch(rule) {
        if (rule.matchType === 'sender-and-subject') {
            // Support both new (senderValues) and old (senderValue) formats
            const senderVal = rule.senderValues || rule.senderValue;
            const subjectVal = rule.subjectValues || rule.subjectValue;
            
            const senderStr = this._toDisplayString(senderVal);
            const subjectStr = this._toDisplayString(subjectVal);
            
            const senderCount = this._countValues(senderVal);
            const subjectCount = this._countValues(subjectVal);
            
            return `
                <span class="rule-match rule-match-complex" title="${escapeHtml(senderStr)}">
                    Sender: ${this._truncate(escapeHtml(senderStr))}
                    ${senderCount > 1 ? `<span class="rule-match-count">${senderCount}</span>` : ''}
                </span>
                <span class="rule-match-and">AND</span>
                <span class="rule-match rule-match-complex" title="${escapeHtml(subjectStr)}">
                    Subject: ${this._truncate(escapeHtml(subjectStr))}
                    ${subjectCount > 1 ? `<span class="rule-match-count">${subjectCount}</span>` : ''}
                </span>
            `;
        }
        
        // Support both new (matchValues) and old (matchValue) formats
        const matchVal = rule.matchValues || rule.matchValue;
        const matchStr = this._toDisplayString(matchVal);
        
        const valueCount = this._countValues(matchVal);
        const displayValue = this._truncate(escapeHtml(matchStr));
        const fullValue = escapeHtml(matchStr);
        
        return `
            <span class="rule-match" title="${fullValue}">
                ${this.formatMatchType(rule.matchType)}: ${displayValue}
                ${valueCount > 1 ? `<span class="rule-match-count">${valueCount}</span>` : ''}
            </span>
        `;
    }

    /**
     * Show/hide element by ID
     * @param {string} id - Element ID
     * @param {boolean} show - Show or hide
     */
    toggleElement(id, show) {
        const element = $(`#${id}`);
        if (element) {
            element.classList.toggle('hidden', !show);
        }
    }

    /**
     * Enable/disable button by ID
     * @param {string} id - Element ID
     * @param {boolean} enabled - Enable or disable
     */
    setButtonEnabled(id, enabled) {
        const element = $(`#${id}`);
        if (element) {
            element.disabled = !enabled;
        }
    }

    /**
     * Get form field value
     * @param {string} id - Element ID
     * @returns {string} - Trimmed value
     */
    getFieldValue(id) {
        const element = $(`#${id}`);
        return element ? element.value.trim() : '';
    }

    /**
     * Set form field value
     * @param {string} id - Element ID
     * @param {string} value - Value to set
     */
    setFieldValue(id, value) {
        const element = $(`#${id}`);
        if (element) {
            element.value = value;
        }
    }

    /**
     * Get checkbox state
     * @param {string} id - Element ID
     * @returns {boolean}
     */
    getCheckboxValue(id) {
        const element = $(`#${id}`);
        return element ? element.checked : false;
    }

    /**
     * Set checkbox state
     * @param {string} id - Element ID
     * @param {boolean} checked - Checked state
     */
    setCheckboxValue(id, checked) {
        const element = $(`#${id}`);
        if (element) {
            element.checked = checked;
        }
    }

    /**
     * Set element text content
     * @param {string} id - Element ID
     * @param {string} text - Text content
     */
    setText(id, text) {
        const element = $(`#${id}`);
        if (element) {
            element.textContent = text;
        }
    }

    /**
     * Set element innerHTML (use carefully!)
     * @param {string} id - Element ID
     * @param {string} html - HTML content
     */
    setHtml(id, html) {
        const element = $(`#${id}`);
        if (element) {
            element.innerHTML = html;
        }
    }
}

// Export singleton instance
export const ui = new UIService();

