/**
 * TutOrg - Popup Main Controller
 * Orchestrates all popup functionality
 */

import { logger, $ } from '../lib/utils.js';
import { tabs } from '../lib/tabs.js';
import { ui } from './ui.js';
import { rulesManager } from './rules.js';

/**
 * Account detection configuration
 */
const ACCOUNT_DETECTION = {
    MAX_RETRIES: 3,
    INITIAL_DELAY: 500,  // ms
    BACKOFF_MULTIPLIER: 1.5
};

/**
 * Popup Controller
 */
class PopupController {
    constructor() {
        this._boundHandlers = {};
        this._currentAccount = 'default';
        this._isDetectingAccount = false;
    }

    /**
     * Initialize the popup
     */
    async init() {
        logger.log('Initializing popup...');
        
        // Check if in window mode and hide the open window button
        if (tabs.isWindowMode()) {
            const openWindowBtn = $('#openWindow');
            if (openWindowBtn) {
                openWindowBtn.style.display = 'none';
            }
            document.body.classList.add('window-mode');
            logger.log('Running in window mode');
        }
        
        // Setup event listeners first (so retry button works)
        this._setupEventListeners();
        this._setupTooltips();
        
        // Detect account with auto-retry
        this._currentAccount = await this._detectAccountWithRetry();
        
        // Initialize rules manager
        await rulesManager.init(this._currentAccount);
        
        // Update UI
        ui.updateAccountDisplay(this._currentAccount);
        rulesManager.renderRules();
        
        logger.log('Popup initialized, account:', this._currentAccount);
    }

    /**
     * Detect account with auto-retry and exponential backoff
     * @returns {Promise<string>} - Account identifier
     */
    async _detectAccountWithRetry() {
        this._setAccountDetecting(true);
        
        let delay = ACCOUNT_DETECTION.INITIAL_DELAY;
        
        for (let attempt = 1; attempt <= ACCOUNT_DETECTION.MAX_RETRIES; attempt++) {
            logger.log(`Account detection attempt ${attempt}/${ACCOUNT_DETECTION.MAX_RETRIES}`);
            
            const account = await this._detectAccount();
            
            if (account !== 'default') {
                this._setAccountDetecting(false);
                return account;
            }
            
            // Wait before retry (except on last attempt)
            if (attempt < ACCOUNT_DETECTION.MAX_RETRIES) {
                await this._sleep(delay);
                delay *= ACCOUNT_DETECTION.BACKOFF_MULTIPLIER;
            }
        }
        
        this._setAccountDetecting(false);
        logger.log('Account detection failed after retries, using default');
        return 'default';
    }

    /**
     * Single attempt to detect account
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
     * Manual retry account detection
     */
    async _retryAccountDetection() {
        if (this._isDetectingAccount) {
            logger.log('Account detection already in progress');
            return;
        }
        
        ui.showStatus('Reconnecting to Tuta Mail...', 'success');
        
        this._currentAccount = await this._detectAccountWithRetry();
        ui.updateAccountDisplay(this._currentAccount);
        
        // Re-initialize rules for new account
        await rulesManager.init(this._currentAccount);
        rulesManager.renderRules();
        
        if (this._currentAccount !== 'default') {
            ui.showStatus('✓ Connected to ' + this._currentAccount, 'success');
        } else {
            ui.showStatus('Could not detect account. Is Tuta Mail open?', 'error');
        }
    }

    /**
     * Update UI to show detection state
     * @param {boolean} detecting - Whether detection is in progress
     */
    _setAccountDetecting(detecting) {
        this._isDetectingAccount = detecting;
        const retryBtn = $('#retryAccount');
        
        if (retryBtn) {
            retryBtn.disabled = detecting;
            retryBtn.classList.toggle('spinning', detecting);
        }
        
        if (detecting) {
            ui.updateAccountDisplay('Detecting...');
        }
    }

    /**
     * Sleep utility
     * @param {number} ms - Milliseconds to sleep
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
        this._addClickHandler('retryAccount', () => this._retryAccountDetection());
        this._addClickHandler('exportRules', () => this._exportRules());
        this._addClickHandler('importRules', () => this._triggerImport());

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

        // File import handler
        const importInput = $('#importFileInput');
        if (importInput) {
            importInput.addEventListener('change', (e) => this._handleImportFile(e));
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

        // Retry Account button tooltip
        const retryBtn = $('#retryAccount');
        if (retryBtn) {
            ui.setupTooltip(retryBtn, 'Retry connecting to Tuta Mail tab');
        }

        // Import/Export tooltips
        const importBtn = $('#importRules');
        if (importBtn) {
            ui.setupTooltip(importBtn, 'Import rules from a JSON file');
        }

        const exportBtn = $('#exportRules');
        if (exportBtn) {
            ui.setupTooltip(exportBtn, 'Export rules to a JSON file for backup');
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

    /**
     * Export rules to JSON file
     */
    _exportRules() {
        const rules = rulesManager.getAllRules();
        
        if (rules.length === 0) {
            ui.showStatus('No rules to export', 'error');
            return;
        }

        const exportData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            account: this._currentAccount,
            rules: rules
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Create download link
        const a = document.createElement('a');
        a.href = url;
        a.download = `tutorg-rules-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        ui.showStatus(`Exported ${rules.length} rule(s)`, 'success');
        logger.log('Exported rules:', rules.length);
    }

    /**
     * Trigger file input for import
     */
    _triggerImport() {
        const importInput = $('#importFileInput');
        if (importInput) {
            importInput.value = ''; // Reset to allow same file
            importInput.click();
        }
    }

    /**
     * Handle imported file
     * @param {Event} event - Change event from file input
     */
    async _handleImportFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Validate import data
            if (!data.rules || !Array.isArray(data.rules)) {
                ui.showStatus('Invalid file format: missing rules array', 'error');
                return;
            }

            // Validate each rule
            const validRules = data.rules.filter(rule => 
                rule.name && 
                rule.matchType && 
                rule.action &&
                (rule.matchValue || (rule.senderValue && rule.subjectValue))
            );

            if (validRules.length === 0) {
                ui.showStatus('No valid rules found in file', 'error');
                return;
            }

            // Ask user how to handle import
            const existingCount = rulesManager.getAllRules().length;
            let mode = 'merge'; // Default: merge
            
            if (existingCount > 0) {
                const replace = confirm(
                    `Found ${validRules.length} rules to import.\n\n` +
                    `You have ${existingCount} existing rules.\n\n` +
                    `Click OK to REPLACE all existing rules.\n` +
                    `Click Cancel to MERGE (add to existing rules).`
                );
                mode = replace ? 'replace' : 'merge';
            }

            // Import rules
            const imported = await rulesManager.importRules(validRules, mode);
            rulesManager.renderRules();

            ui.showStatus(
                `Imported ${imported} rule(s)` + (mode === 'merge' ? ' (merged)' : ' (replaced)'),
                'success'
            );
            logger.log('Imported rules:', imported, 'mode:', mode);

        } catch (error) {
            logger.error('Import error:', error);
            ui.showStatus('Error reading file: ' + error.message, 'error');
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const controller = new PopupController();
    controller.init();
});

