/**
 * TutOrg - Popup Main Controller
 * Orchestrates all popup functionality
 */

import { logger, $ } from '../lib/utils.js';
import { tabs } from '../lib/tabs.js';
import { ui } from './ui.js';
import { rulesManager } from './rules.js';

/**
 * Popup Controller
 */
class PopupController {
    constructor() {
        this._boundHandlers = {};
    }

    /**
     * Initialize the popup
     */
    async init() {
        logger.log('Initializing popup...');
        
        // Detect account
        const account = await this._detectAccount();
        
        // Initialize rules manager
        await rulesManager.init(account);
        
        // Update UI
        ui.updateAccountDisplay(account);
        rulesManager.renderRules();
        
        // Setup event listeners
        this._setupEventListeners();
        this._setupTooltips();
        
        logger.log('Popup initialized, account:', account);
    }

    /**
     * Detect current Tuta account
     * @returns {Promise<string>} - Account identifier
     */
    async _detectAccount() {
        try {
            const response = await tabs.sendToTutaTab({ action: 'getAccountInfo' });
            if (response?.account) {
                return response.account;
            }
        } catch (error) {
            logger.log('Could not detect account:', error.message);
        }
        return 'default';
    }

    /**
     * Setup all event listeners
     */
    _setupEventListeners() {
        // Button clicks
        this._addClickHandler('addRule', () => this._showAddForm());
        this._addClickHandler('saveRule', () => this._saveRule());
        this._addClickHandler('cancelRule', () => this._hideForm());
        this._addClickHandler('runRules', () => this._runRules());
        this._addClickHandler('refreshPage', () => this._refreshPage());
        this._addClickHandler('openWindow', () => this._openInWindow());

        // Match type change
        const matchType = $('#matchType');
        if (matchType) {
            matchType.addEventListener('change', () => this._updateMatchTypeHelp());
        }

        // Rule list actions (event delegation)
        const rulesList = $('#rulesList');
        if (rulesList) {
            rulesList.addEventListener('click', (e) => this._handleRuleAction(e));
        }
    }

    /**
     * Setup custom tooltips
     */
    _setupTooltips() {
        // Run Rules button tooltip
        const runRulesBtn = $('#runRules');
        if (runRulesBtn) {
            ui.setupTooltip(runRulesBtn, 'Run all enabled rules on visible emails');
        }

        // Refresh Page button tooltip with warning
        const refreshBtn = $('#refreshPage');
        if (refreshBtn) {
            ui.setupTooltip(refreshBtn, '⚠️ Warning: Refreshing may log you out of Tuta Mail');
        }

        // Open Window button tooltip
        const openWindowBtn = $('#openWindow');
        if (openWindowBtn) {
            ui.setupTooltip(openWindowBtn, 'Open in a separate window');
        }
    }

    /**
     * Add click handler to element
     * @param {string} id - Element ID
     * @param {Function} handler - Click handler
     */
    _addClickHandler(id, handler) {
        const element = $(`#${id}`);
        if (element) {
            this._boundHandlers[id] = handler;
            element.addEventListener('click', handler);
        }
    }

    /**
     * Show add rule form
     */
    _showAddForm() {
        rulesManager.stopEditing();
        ui.setText('formTitle', 'Add New Rule');
        ui.setText('saveRule', 'Save Rule');
        ui.toggleElement('addRuleForm', true);
        ui.setButtonEnabled('addRule', false);
        this._clearForm();
        this._updateMatchTypeHelp();
    }

    /**
     * Hide rule form
     */
    _hideForm() {
        ui.toggleElement('addRuleForm', false);
        ui.setButtonEnabled('addRule', true);
        rulesManager.stopEditing();
        this._clearForm();
    }

    /**
     * Clear form fields
     */
    _clearForm() {
        ui.setFieldValue('ruleName', '');
        ui.setFieldValue('matchType', 'subject');
        ui.setFieldValue('matchValue', '');
        ui.setFieldValue('senderValue', '');
        ui.setFieldValue('subjectValue', '');
        ui.setFieldValue('action', 'trash');
        ui.setCheckboxValue('enabled', true);
    }

    /**
     * Update match type help text and form visibility
     */
    _updateMatchTypeHelp() {
        const matchType = ui.getFieldValue('matchType');
        const helpText = ui.getMatchTypeHelp(matchType);
        const isComplex = ui.isComplexMatchType(matchType);

        ui.setText('matchTypeHelp', helpText);
        ui.toggleElement('simpleMatchGroup', !isComplex);
        ui.toggleElement('complexMatchGroup', isComplex);
    }

    /**
     * Save or update rule
     */
    async _saveRule() {
        const matchType = ui.getFieldValue('matchType');
        const isComplex = ui.isComplexMatchType(matchType);

        const ruleData = {
            name: ui.getFieldValue('ruleName'),
            matchType,
            action: ui.getFieldValue('action'),
            enabled: ui.getCheckboxValue('enabled')
        };

        // Get appropriate match values
        if (isComplex) {
            ruleData.senderValue = ui.getFieldValue('senderValue');
            ruleData.subjectValue = ui.getFieldValue('subjectValue');
            ruleData.matchValue = '';

            if (!ruleData.name || !ruleData.senderValue || !ruleData.subjectValue) {
                ui.showStatus('Please fill in all required fields', 'error');
                return;
            }
        } else {
            ruleData.matchValue = ui.getFieldValue('matchValue');
            ruleData.senderValue = '';
            ruleData.subjectValue = '';

            if (!ruleData.name || !ruleData.matchValue) {
                ui.showStatus('Please fill in all required fields', 'error');
                return;
            }
        }

        try {
            if (rulesManager.isEditing()) {
                await rulesManager.updateRule(rulesManager.editingRuleId, ruleData);
                ui.showStatus('Rule updated successfully!', 'success');
            } else {
                await rulesManager.addRule(ruleData);
                ui.showStatus('Rule added successfully!', 'success');
            }

            rulesManager.renderRules();
            this._hideForm();
        } catch (error) {
            ui.showStatus('Error saving rule: ' + error.message, 'error');
        }
    }

    /**
     * Handle rule action click (edit, toggle, delete)
     * @param {Event} event - Click event
     */
    async _handleRuleAction(event) {
        const button = event.target.closest('button');
        if (!button) return;

        const ruleItem = button.closest('.rule-item');
        if (!ruleItem) return;

        const ruleId = ruleItem.dataset.ruleId;
        const action = button.dataset.action;

        logger.log('Rule action:', action, 'for rule:', ruleId);

        switch (action) {
            case 'toggle':
                await this._toggleRule(ruleId);
                break;
            case 'delete':
                await this._deleteRule(ruleId);
                break;
            case 'edit':
                this._editRule(ruleId);
                break;
        }
    }

    /**
     * Toggle rule enabled state
     * @param {string} ruleId - Rule ID
     */
    async _toggleRule(ruleId) {
        const newState = await rulesManager.toggleRule(ruleId);
        if (newState !== null) {
            rulesManager.renderRules();
            ui.showStatus(`Rule ${newState ? 'enabled' : 'disabled'}`, 'success');
        }
    }

    /**
     * Delete a rule
     * @param {string} ruleId - Rule ID
     */
    async _deleteRule(ruleId) {
        const rule = rulesManager.getRule(ruleId);
        const confirmed = confirm(`Are you sure you want to delete the rule "${rule?.name || ruleId}"?`);
        
        if (!confirmed) return;

        const success = await rulesManager.deleteRule(ruleId);
        if (success) {
            rulesManager.renderRules();
            ui.showStatus('Rule deleted', 'success');
        }
    }

    /**
     * Edit a rule
     * @param {string} ruleId - Rule ID
     */
    _editRule(ruleId) {
        const rule = rulesManager.getRule(ruleId);
        if (!rule) {
            logger.error('Rule not found:', ruleId);
            return;
        }

        rulesManager.startEditing(ruleId);
        
        ui.setText('formTitle', 'Edit Rule');
        ui.setText('saveRule', 'Update Rule');

        // Populate form
        ui.setFieldValue('ruleName', rule.name);
        ui.setFieldValue('matchType', rule.matchType);
        ui.setFieldValue('action', rule.action);
        ui.setCheckboxValue('enabled', rule.enabled);

        if (rule.matchType === 'sender-and-subject') {
            ui.setFieldValue('senderValue', rule.senderValue || '');
            ui.setFieldValue('subjectValue', rule.subjectValue || '');
            ui.setFieldValue('matchValue', '');
        } else {
            ui.setFieldValue('matchValue', rule.matchValue || '');
            ui.setFieldValue('senderValue', '');
            ui.setFieldValue('subjectValue', '');
        }

        ui.toggleElement('addRuleForm', true);
        ui.setButtonEnabled('addRule', false);
        this._updateMatchTypeHelp();
    }

    /**
     * Run rules on Tuta tab
     */
    async _runRules() {
        const enabledRules = rulesManager.getEnabledRules();

        if (enabledRules.length === 0) {
            ui.showStatus('No enabled rules to run', 'error');
            return;
        }

        ui.showStatus('Running rules...', 'success');
        logger.log('Running', enabledRules.length, 'enabled rules');

        try {
            const response = await tabs.sendToTutaTab({
                action: 'runRules',
                rules: enabledRules
            });

            if (response?.success) {
                ui.showStatus(`✓ ${response.message}`, 'success');
            } else if (response) {
                ui.showStatus(response.message || 'Failed to run rules', 'error');
            } else {
                ui.showStatus('No Tuta Mail tab found. Please open Tuta Mail.', 'error');
            }
        } catch (error) {
            ui.showStatus('Error: ' + error.message, 'error');
            logger.error('Error running rules:', error);
        }
    }

    /**
     * Refresh Tuta page
     */
    async _refreshPage() {
        try {
            const success = await tabs.reloadTutaTab();
            if (success) {
                ui.showStatus('Page refreshed', 'success');
            } else {
                ui.showStatus('No Tuta Mail tab found to refresh', 'error');
            }
        } catch (error) {
            ui.showStatus('Error refreshing page', 'error');
        }
    }

    /**
     * Open popup in a new window
     */
    async _openInWindow() {
        const newWindow = await tabs.openInWindow();
        if (newWindow) {
            // Close the popup
            window.close();
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const controller = new PopupController();
    controller.init();
});

