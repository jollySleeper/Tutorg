/**
 * TutOrg - Popup Main Controller
 * Orchestrates all popup functionality with modal-based UI
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
    INITIAL_DELAY: 500,
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
        this._availableFolders = [];
    }

    /**
     * Initialize the popup
     */
    async init() {
        logger.log('Initializing popup...');
        
        // Check if in window mode
        if (tabs.isWindowMode()) {
            const openWindowBtn = $('#openWindow');
            if (openWindowBtn) {
                openWindowBtn.style.display = 'none';
            }
            document.body.classList.add('window-mode');
        }
        
        // Setup event listeners
        this._setupEventListeners();
        this._setupTooltips();
        
        // Detect account
        this._currentAccount = await this._detectAccountWithRetry();
        
        // Initialize rules manager
        await rulesManager.init(this._currentAccount);
        
        // Update UI
        ui.updateAccountDisplay(this._currentAccount);
        rulesManager.renderRules();
        
        // Load available folders in background
        this._loadFolders();
        
        logger.log('Popup initialized, account:', this._currentAccount);
    }

    /**
     * Detect account with auto-retry
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
            
            if (attempt < ACCOUNT_DETECTION.MAX_RETRIES) {
                await this._sleep(delay);
                delay *= ACCOUNT_DETECTION.BACKOFF_MULTIPLIER;
            }
        }
        
        this._setAccountDetecting(false);
        return 'default';
    }

    /**
     * Single attempt to detect account
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
        if (this._isDetectingAccount) return;
        
        ui.showStatus('Reconnecting...', 'success');
        
        this._currentAccount = await this._detectAccountWithRetry();
        ui.updateAccountDisplay(this._currentAccount);
        
        await rulesManager.init(this._currentAccount);
        rulesManager.renderRules();
        
        if (this._currentAccount !== 'default') {
            ui.showStatus('✓ Connected to ' + this._currentAccount, 'success');
        } else {
            ui.showStatus('Could not detect account', 'error');
        }
    }

    /**
     * Update account detection UI state
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
     * Load available folders from Tuta
     */
    async _loadFolders() {
        const select = $('#targetFolder');
        if (select) {
            select.innerHTML = '<option value="">Loading folders...</option>';
            select.disabled = true;
        }
        
        try {
            const response = await tabs.sendToTutaTab({ action: 'getFolders' });
            if (response?.folders && response.folders.length > 0) {
                this._availableFolders = response.folders;
                this._populateFolderSelect();
                logger.log('Loaded', response.folders.length, 'folders');
            } else {
                this._populateFolderSelect(); // Shows empty state
                logger.log('No folders returned from Tuta');
            }
        } catch (error) {
            logger.log('Could not load folders:', error.message);
            if (select) {
                select.innerHTML = '<option value="">Failed to load folders</option>';
            }
        }
    }

    /**
     * Populate folder select dropdown
     */
    _populateFolderSelect() {
        const select = $('#targetFolder');
        if (!select) return;
        
        select.disabled = false;
        select.innerHTML = '<option value="">Select folder...</option>';
        
        if (this._availableFolders.length === 0) {
            select.innerHTML = '<option value="">No folders available</option>';
            return;
        }
        
        this._availableFolders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.name;
            // Use displayName if available, fallback to name
            option.textContent = folder.displayName || folder.name;
            select.appendChild(option);
        });
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Setup event listeners
     */
    _setupEventListeners() {
        // Main buttons
        this._addClickHandler('addRule', () => this._showModal());
        this._addClickHandler('saveRule', () => this._saveRule());
        this._addClickHandler('cancelRule', () => this._hideModal());
        this._addClickHandler('closeModal', () => this._hideModal());
        this._addClickHandler('runRules', () => this._runRules());
        this._addClickHandler('refreshPage', () => this._refreshPage());
        this._addClickHandler('openWindow', () => this._openInWindow());
        this._addClickHandler('retryAccount', () => this._retryAccountDetection());
        this._addClickHandler('exportRules', () => this._exportRules());
        this._addClickHandler('importRules', () => this._triggerImport());

        // Match type change - show/hide complex fields
        const matchType = $('#matchType');
        if (matchType) {
            matchType.addEventListener('change', () => this._updateMatchTypeHelp());
        }

        // Action change - show/hide folder selector
        const actionSelect = $('#action');
        if (actionSelect) {
            actionSelect.addEventListener('change', () => this._updateActionFields());
        }

        // Rule list actions (delegation)
        const rulesList = $('#rulesList');
        if (rulesList) {
            rulesList.addEventListener('click', (e) => this._handleRuleAction(e));
        }

        // File import
        const importInput = $('#importFileInput');
        if (importInput) {
            importInput.addEventListener('change', (e) => this._handleImportFile(e));
        }

        // Modal overlay click to close
        const modal = $('#ruleModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this._hideModal();
                }
            });
        }

        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this._hideModal();
            }
        });
    }

    /**
     * Setup tooltips
     */
    _setupTooltips() {
        const tooltips = {
            'runRules': 'Run all enabled rules on visible emails',
            'refreshPage': '⚠️ Warning: Refreshing may log you out',
            'openWindow': 'Open in a separate window',
            'retryAccount': 'Retry connecting to Tuta Mail',
            'importRules': 'Import rules from JSON file',
            'exportRules': 'Export rules to JSON file'
        };

        Object.entries(tooltips).forEach(([id, text]) => {
            const el = $(`#${id}`);
            if (el) ui.setupTooltip(el, text);
        });
    }

    /**
     * Add click handler
     */
    _addClickHandler(id, handler) {
        const element = $(`#${id}`);
        if (element) {
            element.addEventListener('click', handler);
        }
    }

    /**
     * Show add/edit modal
     */
    _showModal(editRule = null) {
        rulesManager.stopEditing();
        
        if (editRule) {
            ui.setText('formTitle', 'Edit Rule');
            ui.setText('saveRule', 'Update Rule');
            rulesManager.startEditing(editRule.id);
            this._populateForm(editRule);
        } else {
            ui.setText('formTitle', 'Add New Rule');
            ui.setText('saveRule', 'Save Rule');
            this._clearForm();
        }
        
        this._updateMatchTypeHelp();
        this._updateActionFields();
        ui.toggleElement('ruleModal', true);
    }

    /**
     * Hide modal
     */
    _hideModal() {
        ui.toggleElement('ruleModal', false);
        rulesManager.stopEditing();
        this._clearForm();
    }

    /**
     * Clear form
     */
    _clearForm() {
        ui.setFieldValue('ruleName', '');
        ui.setFieldValue('matchType', 'subject-contains');
        ui.setFieldValue('matchValue', '');
        ui.setFieldValue('senderValue', '');
        ui.setFieldValue('subjectValue', '');
        ui.setFieldValue('action', 'select-only');
        ui.setFieldValue('targetFolder', '');
        ui.setCheckboxValue('enabled', true);
    }

    /**
     * Populate form with rule data
     */
    _populateForm(rule) {
        ui.setFieldValue('ruleName', rule.name);
        ui.setFieldValue('matchType', rule.matchType);
        ui.setFieldValue('action', rule.action);
        ui.setCheckboxValue('enabled', rule.enabled);
        
        if (rule.targetFolder) {
            ui.setFieldValue('targetFolder', rule.targetFolder);
        }

        if (rule.matchType === 'sender-and-subject') {
            ui.setFieldValue('senderValue', rule.senderValue || '');
            ui.setFieldValue('subjectValue', rule.subjectValue || '');
        } else {
            ui.setFieldValue('matchValue', rule.matchValue || '');
        }
    }

    /**
     * Update match type help and visibility
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
     * Update action-specific fields
     */
    _updateActionFields() {
        const action = ui.getFieldValue('action');
        const isMoveToFolder = action === 'move-to-folder';
        
        ui.toggleElement('folderSelectGroup', isMoveToFolder);
        
        // Reload folders if needed
        if (isMoveToFolder && this._availableFolders.length === 0) {
            this._loadFolders();
        }
    }

    /**
     * Save rule
     */
    async _saveRule() {
        const matchType = ui.getFieldValue('matchType');
        const isComplex = ui.isComplexMatchType(matchType);
        const action = ui.getFieldValue('action');

        const ruleData = {
            name: ui.getFieldValue('ruleName'),
            matchType,
            action,
            enabled: ui.getCheckboxValue('enabled')
        };

        // Handle move-to-folder
        if (action === 'move-to-folder') {
            ruleData.targetFolder = ui.getFieldValue('targetFolder');
            if (!ruleData.targetFolder) {
                ui.showStatus('Please select a target folder', 'error');
                return;
            }
        }

        // Handle match values
        if (isComplex) {
            ruleData.senderValue = ui.getFieldValue('senderValue');
            ruleData.subjectValue = ui.getFieldValue('subjectValue');

            if (!ruleData.name || !ruleData.senderValue || !ruleData.subjectValue) {
                ui.showStatus('Please fill in all required fields', 'error');
                return;
            }
        } else {
            ruleData.matchValue = ui.getFieldValue('matchValue');

            if (!ruleData.name || !ruleData.matchValue) {
                ui.showStatus('Please fill in all required fields', 'error');
                return;
            }
        }

        try {
            if (rulesManager.isEditing()) {
                await rulesManager.updateRule(rulesManager.editingRuleId, ruleData);
                ui.showStatus('Rule updated!', 'success');
            } else {
                await rulesManager.addRule(ruleData);
                ui.showStatus('Rule added!', 'success');
            }

            rulesManager.renderRules();
            this._hideModal();
        } catch (error) {
            ui.showStatus('Error: ' + error.message, 'error');
        }
    }

    /**
     * Handle rule action click
     */
    async _handleRuleAction(event) {
        const button = event.target.closest('button');
        if (!button) return;

        const ruleItem = button.closest('.rule-item');
        if (!ruleItem) return;

        const ruleId = ruleItem.dataset.ruleId;
        const action = button.dataset.action;

        switch (action) {
            case 'toggle':
                await this._toggleRule(ruleId);
                break;
            case 'delete':
                await this._deleteRule(ruleId);
                break;
            case 'edit':
                const rule = rulesManager.getRule(ruleId);
                if (rule) this._showModal(rule);
                break;
        }
    }

    async _toggleRule(ruleId) {
        const newState = await rulesManager.toggleRule(ruleId);
        if (newState !== null) {
            rulesManager.renderRules();
            ui.showStatus(`Rule ${newState ? 'enabled' : 'disabled'}`, 'success');
        }
    }

    async _deleteRule(ruleId) {
        const rule = rulesManager.getRule(ruleId);
        if (!confirm(`Delete rule "${rule?.name}"?`)) return;

        if (await rulesManager.deleteRule(ruleId)) {
            rulesManager.renderRules();
            ui.showStatus('Rule deleted', 'success');
        }
    }

    /**
     * Run rules
     */
    async _runRules() {
        const enabledRules = rulesManager.getEnabledRules();

        if (enabledRules.length === 0) {
            ui.showStatus('No enabled rules', 'error');
            return;
        }

        ui.showStatus('Running...', 'success');

        try {
            const response = await tabs.sendToTutaTab({
                action: 'runRules',
                rules: enabledRules
            });

            if (response?.success) {
                ui.showStatus(`✓ ${response.message}`, 'success');
            } else {
                ui.showStatus(response?.message || 'Failed', 'error');
            }
        } catch (error) {
            ui.showStatus('Error: ' + error.message, 'error');
        }
    }

    async _refreshPage() {
        const success = await tabs.reloadTutaTab();
        ui.showStatus(success ? 'Page refreshed' : 'No Tuta tab found', success ? 'success' : 'error');
    }

    async _openInWindow() {
        const newWindow = await tabs.openInWindow();
        if (newWindow) window.close();
    }

    /**
     * Export rules
     */
    _exportRules() {
        const rules = rulesManager.getAllRules();
        
        if (rules.length === 0) {
            ui.showStatus('No rules to export', 'error');
            return;
        }

        const exportData = {
            version: '1.1',
            exportedAt: new Date().toISOString(),
            account: this._currentAccount,
            rules
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `tutorg-rules-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        ui.showStatus(`Exported ${rules.length} rules`, 'success');
    }

    _triggerImport() {
        const input = $('#importFileInput');
        if (input) {
            input.value = '';
            input.click();
        }
    }

    async _handleImportFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const data = JSON.parse(await file.text());

            if (!data.rules?.length) {
                ui.showStatus('No rules found in file', 'error');
                return;
            }

            const validRules = data.rules.filter(r => 
                r.name && r.matchType && r.action &&
                (r.matchValue || (r.senderValue && r.subjectValue))
            );

            if (validRules.length === 0) {
                ui.showStatus('No valid rules in file', 'error');
                return;
            }

            const existingCount = rulesManager.getAllRules().length;
            let mode = 'merge';
            
            if (existingCount > 0) {
                mode = confirm(
                    `Import ${validRules.length} rules?\n\n` +
                    `OK = Replace existing\nCancel = Merge`
                ) ? 'replace' : 'merge';
            }

            const imported = await rulesManager.importRules(validRules, mode);
            rulesManager.renderRules();
            ui.showStatus(`Imported ${imported} rules`, 'success');

        } catch (error) {
            ui.showStatus('Error: ' + error.message, 'error');
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new PopupController().init();
});
