/**
 * TutOrg - Tab Management Service
 * Handles tab operations and maintains context for window mode
 */

import { TUTA_URLS } from './constants.js';
import { logger, isTutaUrl } from './utils.js';
import { storage } from './storage.js';

/**
 * Tab service for managing browser tabs
 */
class TabService {
    constructor() {
        this._cachedTutaTabId = null;
        this._contentScriptInjected = new Set(); // Track injected tabs
    }

    /**
     * Check if a tab is a Tuta Mail tab
     * @param {Object} tab - Tab object
     * @returns {boolean}
     */
    isTutaTab(tab) {
        return tab && tab.url && isTutaUrl(tab.url);
    }

    /**
     * Get the current active tab in the current window
     * @returns {Promise<Object|null>} - Tab object or null
     */
    async getActiveTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            return tab || null;
        } catch (error) {
            logger.error('Error getting active tab:', error);
            return null;
        }
    }

    /**
     * Find a Tuta Mail tab (prioritizes stored target, then active, then any)
     * This is the key method for window mode support
     * @returns {Promise<Object|null>} - Tab object or null
     */
    async findTutaTab() {
        try {
            // First, check if we have a stored target tab (from window mode)
            const storedTabId = await storage.getTargetTab();
            if (storedTabId) {
                try {
                    const tab = await chrome.tabs.get(storedTabId);
                    if (this.isTutaTab(tab)) {
                        logger.log('Using stored target tab:', storedTabId);
                        return tab;
                    }
                } catch {
                    // Tab no longer exists, clear it
                    await storage.clearTargetTab();
                }
            }

            // Second, check if active tab is Tuta
            const activeTab = await this.getActiveTab();
            if (this.isTutaTab(activeTab)) {
                this._cachedTutaTabId = activeTab.id;
                return activeTab;
            }

            // Third, find any Tuta tab in all windows
            const allTabs = await chrome.tabs.query({});
            const tutaTab = allTabs.find(tab => this.isTutaTab(tab));
            
            if (tutaTab) {
                this._cachedTutaTabId = tutaTab.id;
                logger.log('Found Tuta tab in background:', tutaTab.id);
                return tutaTab;
            }

            logger.warn('No Tuta Mail tab found');
            return null;
        } catch (error) {
            logger.error('Error finding Tuta tab:', error);
            return null;
        }
    }

    /**
     * Get all Tuta Mail tabs
     * @returns {Promise<Array>} - Array of tab objects
     */
    async getAllTutaTabs() {
        try {
            const allTabs = await chrome.tabs.query({});
            return allTabs.filter(tab => this.isTutaTab(tab));
        } catch (error) {
            logger.error('Error getting Tuta tabs:', error);
            return [];
        }
    }

    /**
     * Store the current Tuta tab as target (for window mode)
     * Call this before opening in window mode
     */
    async storeCurrentTutaTab() {
        const tutaTab = await this.findTutaTab();
        if (tutaTab) {
            await storage.setTargetTab(tutaTab.id);
            this._cachedTutaTabId = tutaTab.id;
            logger.log('Stored Tuta tab as target:', tutaTab.id);
            return tutaTab.id;
        }
        return null;
    }

    /**
     * Send a message to the Tuta tab
     * @param {Object} message - Message to send
     * @param {boolean} retry - Whether this is a retry after injection
     * @returns {Promise<Object|null>} - Response or null
     */
    async sendToTutaTab(message, retry = false) {
        const tab = await this.findTutaTab();
        
        if (!tab) {
            logger.warn('Cannot send message: No Tuta tab found');
            return null;
        }

        try {
            const response = await chrome.tabs.sendMessage(tab.id, message);
            logger.log('Message sent to tab', tab.id, ', response:', response);
            return response;
        } catch (error) {
            // Check if it's a connection error (content script not loaded)
            if (error.message?.includes('Receiving end does not exist') && !retry) {
                logger.log('Content script not responding, attempting to inject...');
                
                const injected = await this._injectContentScript(tab.id);
                if (injected) {
                    // Wait a moment for script to initialize
                    await new Promise(r => setTimeout(r, 500));
                    // Retry once
                    return this.sendToTutaTab(message, true);
                }
            }
            
            logger.error('Error sending message to tab:', error);
            return null;
        }
    }

    /**
     * Inject content script into a tab
     * @param {number} tabId - Tab ID to inject into
     * @returns {Promise<boolean>} - Success status
     */
    async _injectContentScript(tabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['src/content.js']
            });
            
            this._contentScriptInjected.add(tabId);
            logger.log('Content script injected into tab:', tabId);
            return true;
        } catch (error) {
            logger.error('Failed to inject content script:', error);
            return false;
        }
    }

    /**
     * Check if content script is responsive in a tab
     * @param {number} tabId - Tab ID to check
     * @returns {Promise<boolean>} - Whether content script responds
     */
    async _isContentScriptAlive(tabId) {
        try {
            const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
            return response?.pong === true;
        } catch {
            return false;
        }
    }

    /**
     * Reload the Tuta tab
     * @returns {Promise<boolean>} - Success status
     */
    async reloadTutaTab() {
        const tab = await this.findTutaTab();
        
        if (!tab) {
            logger.warn('Cannot reload: No Tuta tab found');
            return false;
        }

        try {
            await chrome.tabs.reload(tab.id);
            logger.log('Reloaded Tuta tab:', tab.id);
            return true;
        } catch (error) {
            logger.error('Error reloading tab:', error);
            return false;
        }
    }

    /**
     * Check if we're running in window mode (detached popup)
     * @returns {boolean}
     */
    isWindowMode() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('mode') === 'window';
    }

    /**
     * Check if we're running in tab mode (browser tab)
     * @returns {boolean}
     */
    isTabMode() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('mode') === 'tab';
    }

    /**
     * Check if we're in popup mode (not window or tab)
     * @returns {boolean}
     */
    isPopupMode() {
        return !this.isWindowMode() && !this.isTabMode();
    }

    /**
     * Open the popup in a new window
     * @returns {Promise<Object|null>} - Window object or null
     */
    async openInWindow() {
        // Store the current Tuta tab before opening window
        await this.storeCurrentTutaTab();
        
        // Add mode=window param so popup knows it's in window mode
        const popupURL = chrome.runtime.getURL('src/popup/popup.html?mode=window');
        
        try {
            const newWindow = await chrome.windows.create({
                url: popupURL,
                type: 'popup',
                width: 480,
                height: 650,
                focused: true
            });
            logger.log('Opened in new window:', newWindow.id);
            return newWindow;
        } catch (error) {
            logger.error('Error opening window:', error);
            return null;
        }
    }

    /**
     * Open the popup as a browser tab (for split-screen usage)
     * @returns {Promise<Object|null>} - Tab object or null
     */
    async openAsTab() {
        // Store the current Tuta tab before opening in new tab
        await this.storeCurrentTutaTab();
        
        // Add mode=tab param so popup knows it's in tab mode
        const popupURL = chrome.runtime.getURL('src/popup/popup.html?mode=tab');
        
        try {
            const newTab = await chrome.tabs.create({
                url: popupURL,
                active: true
            });
            logger.log('Opened as new tab:', newTab.id);
            return newTab;
        } catch (error) {
            logger.error('Error opening as tab:', error);
            return null;
        }
    }
}

// Export singleton instance
export const tabs = new TabService();

