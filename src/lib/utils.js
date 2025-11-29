/**
 * TutOrg - Utility Functions
 * Common helper functions used across the extension
 */

import { LOG_PREFIX } from './constants.js';

/**
 * Logger utility with consistent prefix
 */
export const logger = {
    log: (...args) => console.log(LOG_PREFIX, ...args),
    error: (...args) => console.error(LOG_PREFIX, ...args),
    warn: (...args) => console.warn(LOG_PREFIX, ...args),
    debug: (...args) => console.log(LOG_PREFIX, 'DEBUG -', ...args)
};

/**
 * Sleep/delay utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} - Escaped HTML string
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Generate unique ID
 * @returns {string} - Unique identifier
 */
export function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if URL is a Tuta Mail URL
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export function isTutaUrl(url) {
    if (!url) return false;
    return url.includes('mail.tuta.com') || url.includes('app.tuta.com');
}

/**
 * Debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} - Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Safe JSON parse with fallback
 * @param {string} str - JSON string
 * @param {*} fallback - Fallback value if parse fails
 * @returns {*} - Parsed value or fallback
 */
export function safeJsonParse(str, fallback = null) {
    try {
        return JSON.parse(str);
    } catch {
        return fallback;
    }
}

/**
 * Create DOM element with attributes and children
 * @param {string} tag - Element tag name
 * @param {Object} attrs - Attributes object
 * @param {Array|string} children - Child elements or text
 * @returns {HTMLElement}
 */
export function createElement(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);
    
    Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(element.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'dataset' && typeof value === 'object') {
            Object.entries(value).forEach(([k, v]) => {
                element.dataset[k] = v;
            });
        } else {
            element.setAttribute(key, value);
        }
    });
    
    const childArray = Array.isArray(children) ? children : [children];
    childArray.forEach(child => {
        if (typeof child === 'string') {
            element.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            element.appendChild(child);
        }
    });
    
    return element;
}

/**
 * Query selector with error handling
 * @param {string} selector - CSS selector
 * @param {Element} context - Context element
 * @returns {Element|null}
 */
export function $(selector, context = document) {
    try {
        return context.querySelector(selector);
    } catch (e) {
        logger.error('Invalid selector:', selector);
        return null;
    }
}

/**
 * Query selector all with error handling
 * @param {string} selector - CSS selector
 * @param {Element} context - Context element
 * @returns {NodeList}
 */
export function $$(selector, context = document) {
    try {
        return context.querySelectorAll(selector);
    } catch (e) {
        logger.error('Invalid selector:', selector);
        return [];
    }
}

