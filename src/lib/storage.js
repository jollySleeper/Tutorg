/**
 * TutOrg - Storage Service
 * Centralized storage operations following Single Responsibility Principle
 */

import { STORAGE_KEYS } from './constants.js';
import { logger, generateId } from './utils.js';

/**
 * Storage service for managing extension data
 */
class StorageService {
    /**
     * Get rules for a specific account
     * @param {string} account - Account identifier
     * @returns {Promise<Array>} - Array of rules
     */
    async getRules(account = 'default') {
        try {
            const storageKey = `${STORAGE_KEYS.RULES_PREFIX}${account}`;
            const result = await chrome.storage.sync.get([storageKey, STORAGE_KEYS.LEGACY_RULES]);
            
            // Try account-specific first, then fallback to legacy
            const rules = result[storageKey] || result[STORAGE_KEYS.LEGACY_RULES] || [];
            logger.log('Loaded rules for account', account, ':', rules.length, 'rules');
            return rules;
        } catch (error) {
            logger.error('Error loading rules:', error);
            return [];
        }
    }

    /**
     * Save rules for a specific account
     * @param {Array} rules - Rules array
     * @param {string} account - Account identifier
     * @returns {Promise<boolean>} - Success status
     */
    async saveRules(rules, account = 'default') {
        try {
            const storageKey = `${STORAGE_KEYS.RULES_PREFIX}${account}`;
            await chrome.storage.sync.set({ [storageKey]: rules });
            logger.log('Saved', rules.length, 'rules for account:', account);
            return true;
        } catch (error) {
            logger.error('Error saving rules:', error);
            return false;
        }
    }

    /**
     * Create a new rule object
     * @param {Object} ruleData - Rule data
     * @param {string} account - Account identifier
     * @returns {Object} - New rule object
     */
    createRule(ruleData, account = 'default') {
        return {
            id: generateId(),
            name: ruleData.name,
            matchType: ruleData.matchType,
            // Use array format for match values
            matchValues: ruleData.matchValues || [],
            senderValues: ruleData.senderValues || [],
            subjectValues: ruleData.subjectValues || [],
            targetFolder: ruleData.targetFolder || null,
            action: ruleData.action,
            enabled: ruleData.enabled ?? true,
            account,
            createdAt: Date.now()
        };
    }

    /**
     * Get enabled rules count across all accounts
     * @returns {Promise<number>} - Count of enabled rules
     */
    async getEnabledRulesCount() {
        try {
            const allStorage = await chrome.storage.sync.get(null);
            let count = 0;
            
            for (const [key, value] of Object.entries(allStorage)) {
                if (key.startsWith(STORAGE_KEYS.RULES_PREFIX) && Array.isArray(value)) {
                    count += value.filter(r => r.enabled).length;
                }
            }
            
            return count;
        } catch (error) {
            logger.error('Error counting enabled rules:', error);
            return 0;
        }
    }

    /**
     * Store the target tab ID for window mode
     * @param {number} tabId - Tab ID
     */
    async setTargetTab(tabId) {
        try {
            await chrome.storage.local.set({ [STORAGE_KEYS.TARGET_TAB]: tabId });
            logger.log('Stored target tab:', tabId);
        } catch (error) {
            logger.error('Error storing target tab:', error);
        }
    }

    /**
     * Get the stored target tab ID
     * @returns {Promise<number|null>} - Tab ID or null
     */
    async getTargetTab() {
        try {
            const result = await chrome.storage.local.get(STORAGE_KEYS.TARGET_TAB);
            return result[STORAGE_KEYS.TARGET_TAB] || null;
        } catch (error) {
            logger.error('Error getting target tab:', error);
            return null;
        }
    }

    /**
     * Clear the target tab
     */
    async clearTargetTab() {
        try {
            await chrome.storage.local.remove(STORAGE_KEYS.TARGET_TAB);
        } catch (error) {
            logger.error('Error clearing target tab:', error);
        }
    }

    /**
     * Get extension settings
     * @returns {Promise<Object>} - Settings object
     */
    async getSettings() {
        try {
            const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
            return result[STORAGE_KEYS.SETTINGS] || {};
        } catch (error) {
            logger.error('Error getting settings:', error);
            return {};
        }
    }

    /**
     * Save extension settings
     * @param {Object} settings - Settings object
     */
    async saveSettings(settings) {
        try {
            await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings });
            logger.log('Saved settings');
        } catch (error) {
            logger.error('Error saving settings:', error);
        }
    }
}

// Export singleton instance
export const storage = new StorageService();

