/**
 * TutOrg - Rules Manager
 * Handles rule CRUD operations and rendering
 */

import { storage } from '../lib/storage.js';
import { logger, escapeHtml } from '../lib/utils.js';
import { ui } from './ui.js';

/**
 * Rules Manager for handling rule operations
 */
class RulesManager {
    constructor() {
        this.rules = [];
        this.currentAccount = 'default';
        this.editingRuleId = null;
    }

    /**
     * Initialize rules manager
     * @param {string} account - Account identifier
     */
    async init(account = 'default') {
        this.currentAccount = account;
        await this.loadRules();
    }

    /**
     * Load rules from storage
     */
    async loadRules() {
        this.rules = await storage.getRules(this.currentAccount);
        logger.log('Loaded', this.rules.length, 'rules');
    }

    /**
     * Save rules to storage
     */
    async saveRules() {
        await storage.saveRules(this.rules, this.currentAccount);
    }

    /**
     * Get enabled rules
     * @returns {Array} - Array of enabled rules
     */
    getEnabledRules() {
        return this.rules.filter(r => r.enabled);
    }

    /**
     * Get rule by ID
     * @param {string} id - Rule ID
     * @returns {Object|undefined} - Rule object
     */
    getRule(id) {
        return this.rules.find(r => r.id === id);
    }

    /**
     * Add a new rule
     * @param {Object} ruleData - Rule data
     * @returns {Object} - Created rule
     */
    async addRule(ruleData) {
        const newRule = storage.createRule(ruleData, this.currentAccount);
        this.rules.push(newRule);
        await this.saveRules();
        logger.log('Added new rule:', newRule.name);
        return newRule;
    }

    /**
     * Update an existing rule
     * @param {string} id - Rule ID
     * @param {Object} ruleData - Updated rule data
     * @returns {boolean} - Success status
     */
    async updateRule(id, ruleData) {
        const index = this.rules.findIndex(r => r.id === id);
        if (index === -1) {
            logger.error('Rule not found:', id);
            return false;
        }

        this.rules[index] = {
            ...this.rules[index],
            ...ruleData,
            updatedAt: Date.now()
        };

        await this.saveRules();
        logger.log('Updated rule:', this.rules[index].name);
        return true;
    }

    /**
     * Delete a rule
     * @param {string} id - Rule ID
     * @returns {boolean} - Success status
     */
    async deleteRule(id) {
        const originalLength = this.rules.length;
        this.rules = this.rules.filter(r => r.id !== id);
        
        if (this.rules.length < originalLength) {
            await this.saveRules();
            logger.log('Deleted rule:', id);
            return true;
        }
        return false;
    }

    /**
     * Toggle rule enabled state
     * @param {string} id - Rule ID
     * @returns {boolean|null} - New enabled state or null if failed
     */
    async toggleRule(id) {
        const rule = this.getRule(id);
        if (!rule) return null;

        rule.enabled = !rule.enabled;
        await this.saveRules();
        logger.log('Toggled rule:', rule.name, 'enabled:', rule.enabled);
        return rule.enabled;
    }

    /**
     * Render rules list
     * @param {string} containerId - Container element ID
     */
    renderRules(containerId = 'rulesList') {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (this.rules.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <div class="empty-state-text">No rules yet. Click "+ Add Rule" to get started!</div>
                </div>
            `;
            return;
        }

        container.innerHTML = this.rules.map(rule => this._renderRuleItem(rule)).join('');
        logger.log('Rendered', this.rules.length, 'rules');
    }

    /**
     * Render a single rule item
     * @param {Object} rule - Rule object
     * @returns {string} - HTML string
     */
    _renderRuleItem(rule) {
        const disabledClass = rule.enabled ? '' : 'disabled';
        const toggleBtnClass = rule.enabled ? 'btn-secondary' : 'btn-primary';
        const toggleBtnText = rule.enabled ? 'Disable' : 'Enable';

        return `
            <div class="rule-item ${disabledClass}" data-rule-id="${escapeHtml(rule.id)}">
                <div class="rule-header">
                    <div class="rule-name">${escapeHtml(rule.name)}</div>
                    <div class="rule-toggle">
                        <button class="btn btn-small btn-edit" data-action="edit" title="Edit rule">
                            ✏️
                        </button>
                        <button class="btn btn-small ${toggleBtnClass}" data-action="toggle">
                            ${toggleBtnText}
                        </button>
                        <button class="btn btn-small btn-danger" data-action="delete" title="Delete rule">
                            Delete
                        </button>
                    </div>
                </div>
                <div class="rule-details">
                    ${ui.formatRuleMatch(rule)}
                    <span class="rule-action">→ ${ui.formatAction(rule.action)}</span>
                </div>
            </div>
        `;
    }

    /**
     * Start editing a rule
     * @param {string} id - Rule ID
     */
    startEditing(id) {
        this.editingRuleId = id;
    }

    /**
     * Stop editing
     */
    stopEditing() {
        this.editingRuleId = null;
    }

    /**
     * Check if currently editing
     * @returns {boolean}
     */
    isEditing() {
        return this.editingRuleId !== null;
    }

    /**
     * Get the rule being edited
     * @returns {Object|null}
     */
    getEditingRule() {
        if (!this.editingRuleId) return null;
        return this.getRule(this.editingRuleId);
    }
}

// Export singleton instance
export const rulesManager = new RulesManager();

