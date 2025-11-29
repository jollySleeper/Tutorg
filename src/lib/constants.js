/**
 * TutOrg - Shared Constants
 * Single source of truth for all constants used across the extension
 */

// Extension metadata
export const APP_NAME = 'TutOrg';
export const LOG_PREFIX = '[TutOrg]';

// Tuta Mail URLs
export const TUTA_URLS = [
    'mail.tuta.com',
    'app.tuta.com'
];

// Tuta email domains for account detection
export const TUTA_EMAIL_DOMAINS = [
    'tuta.com',
    'tutanota.com', 
    'tuta.io',
    'keemail.me',
    'tutamail.com',
    'tutanota.de'
];

// Storage keys
export const STORAGE_KEYS = {
    RULES_PREFIX: 'emailRules_',
    LEGACY_RULES: 'emailRules',
    TARGET_TAB: 'targetTabId',
    SETTINGS: 'settings'
};

// Match types with display names and help text
export const MATCH_TYPES = {
    'subject': {
        label: 'Subject (exact match)',
        displayName: 'Subject',
        help: 'Matches the exact email subject line.',
        isComplex: false
    },
    'subject-contains': {
        label: 'Subject Contains',
        displayName: 'Subject Contains',
        help: 'Matches if the subject contains this text (case-insensitive).',
        isComplex: false
    },
    'sender': {
        label: 'Sender Name (exact match)',
        displayName: 'Sender Name',
        help: '⚠️ Matches the sender\'s display name (e.g., "John Doe"), not their email address.',
        isComplex: false
    },
    'sender-contains': {
        label: 'Sender Name Contains',
        displayName: 'Sender Name Contains',
        help: '⚠️ Matches if sender\'s display name contains this text (case-insensitive). Note: This is the name shown, not the email address.',
        isComplex: false
    },
    'sender-and-subject': {
        label: 'Sender + Subject (both must match)',
        displayName: 'Sender + Subject',
        help: '🔗 Complex rule: Both sender name AND subject must match (case-insensitive contains).',
        isComplex: true
    }
};

// Action types with display names
export const ACTION_TYPES = {
    'trash': 'Move to Trash',
    'archive': 'Archive',
    'mark-read': 'Mark as Read',
    'mark-unread': 'Mark as Unread',
    'select-only': 'Select Only'
};

// Button titles for finding action buttons in Tuta
export const BUTTON_TITLES = {
    trash: ['Trash', 'Delete', 'Move to trash'],
    archive: ['Archive', 'Move to archive'],
    markRead: ['Mark as read', 'Mark read', 'Read'],
    markUnread: ['Mark as unread', 'Mark unread', 'Unread']
};

// CSS selectors for Tuta Mail elements
export const SELECTORS = {
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
    ],
    accountEmail: [
        '[data-testid="account-email"]',
        '.nav-button .text-ellipsis',
        '[class*="account"] [class*="email"]',
        '.folder-column .text-ellipsis'
    ]
};

// Timing constants
export const TIMING = {
    STATUS_TIMEOUT: 5000,
    ACTION_DELAY: 500,
    QUICK_ACTION_DELAY: 300,
    INDICATOR_TIMEOUT: 4000
};

// Theme colors
export const COLORS = {
    primary: '#840b2a',
    primaryDark: '#6b1e3a',
    success: '#28a745',
    danger: '#dc3545',
    warning: '#ffc107'
};

