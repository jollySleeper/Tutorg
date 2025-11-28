# 📧 TutOrg

A browser extension for automatically organizing Tuta Mail emails based on custom rules. Select, trash, archive, and manage emails with powerful filtering rules!

## ✨ Features

- **Rule-Based Email Organization**: Create custom rules to automatically organize your emails
- **Multiple Match Types**:
  - Exact subject match
  - Subject contains text
  - Exact sender match
  - Sender contains text
- **Multiple Actions**:
  - Move to Trash
  - Archive
  - Mark as Read
  - Mark as Unread
  - Select Only (for manual actions)
- **Easy-to-Use Interface**: Clean, modern popup UI for managing rules
- **Real-Time Processing**: Run rules on-demand with one click
- **Rule Management**: Enable/disable rules individually without deleting them

## 🚀 Installation

### Chrome/Edge/Brave

1. **Download or Clone** this repository:
   ```bash
   git clone https://github.com/jollySleeper/TutOrg.git
   cd TutOrg
   ```

2. **Create Extension Icons** (optional, but recommended):
   ```bash
   # Option 1: Using Python (requires Pillow)
   pip install Pillow
   cd icons
   python3 create_icons.py
   
   # Option 2: Open icons/create_icons.html in a browser
   # Icons will auto-download
   ```

3. **Load the Extension**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the `TutOrg` folder
   - The extension icon should appear in your toolbar!

### Firefox

1. **Download or Clone** this repository (same as above)

2. **Create Icons** (same as above, optional)

3. **Load the Extension**:
   - Open Firefox and go to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Navigate to the `TutOrg` folder and select `manifest.json`
   - The extension will be loaded temporarily (removed on browser restart)

   **For permanent installation**, you'll need to package and sign the extension through Mozilla's Add-on store.

## 📖 Usage

### Creating Your First Rule

1. **Open Tuta Mail** in your browser (mail.tuta.com or app.tuta.com)

2. **Click the Extension Icon** in your toolbar to open the popup

3. **Click "Add Rule"** to create a new rule

4. **Configure the Rule**:
   - **Rule Name**: Give it a descriptive name (e.g., "Archive Fedora Summaries")
   - **Match Type**: Choose how to match emails
     - `Subject`: Exact subject match
     - `Subject Contains`: Subject contains text
     - `Sender`: Exact sender match
     - `Sender Contains`: Sender contains text
   - **Match Value**: The text to match (e.g., "[Fedora Discussion] Summary")
   - **Action**: What to do with matching emails
     - `Move to Trash`: Delete the emails
     - `Archive`: Move to archive
     - `Mark as Read`: Mark emails as read
     - `Mark as Unread`: Mark emails as unread
     - `Select Only`: Just select them (no automatic action)
   - **Enabled**: Check to enable the rule immediately

5. **Click "Save Rule"**

6. **Click "Run Rules Now"** to apply all enabled rules to your current inbox view

### Example Rules

**Example 1: Clean Up Discussion Summaries**
```
Rule Name: Delete Fedora Summaries
Match Type: Subject
Match Value: [Fedora Discussion] Summary
Action: Move to Trash
```

**Example 2: Auto-Archive Newsletters**
```
Rule Name: Archive All Newsletters
Match Type: Subject Contains
Match Value: Newsletter
Action: Archive
```

**Example 3: Mark Notifications as Read**
```
Rule Name: Auto-Read Notifications
Match Type: Sender Contains
Match Value: notifications@
Action: Mark as Read
```

### Managing Rules

- **Enable/Disable**: Click the button next to each rule to toggle it
- **Delete**: Click "Delete" to remove a rule permanently
- **Run Rules**: Click "Run Rules Now" to process all enabled rules
- **Refresh Page**: Click "Refresh Page" to reload Tuta Mail

## 🛠️ How It Works

1. **Content Script**: Injects into email client pages to interact with emails
2. **Rule Matching**: Scans visible emails for matches based on your rules
3. **Email Selection**: Automatically checks matching email checkboxes
4. **Action Execution**: Performs the specified action (trash, archive, etc.)

The extension only processes **visible emails** in your current inbox view. Scroll or load more emails to process additional items.

## 🔧 Technical Details

### Project Structure

```
TutOrg/
├── manifest.json       # Extension configuration
├── popup.html          # Extension popup UI
├── popup.css           # Popup styling
├── popup.js            # Popup logic and rule management
├── content.js          # Content script for Tuta Mail interaction
├── background.js       # Background service worker
├── icons/              # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   ├── create_icons.py
│   └── create_icons.html
└── README.md
```

### Permissions

The extension requires:
- `storage`: To save your rules
- `activeTab`: To interact with the current tab
- `host_permissions`: To access Tuta Mail domains

### Storage

Rules are stored using Chrome's `chrome.storage.sync` API, which:
- Syncs across your devices (if signed into Chrome/Firefox)
- Persists even if you close the browser
- Has a limit of ~100KB (plenty for rules)

## 🎯 Tips & Best Practices

1. **Test Rules First**: Use "Select Only" action to preview matches before deleting
2. **Be Specific**: Use exact matches when possible to avoid false positives
3. **Start Simple**: Begin with one or two rules, then expand
4. **Regular Cleanup**: Review and update rules periodically
5. **Scroll to Load**: The extension only processes visible emails, so scroll down to load more

## 🐛 Troubleshooting

### Rules Not Working?

1. **Check Rule is Enabled**: Disabled rules won't run
2. **Verify Match Value**: Case-sensitive for exact matches
3. **Reload Page**: Click "Refresh Page" button
4. **Check Console**: Open browser DevTools (F12) and check for errors
5. **Scroll Down**: Load more emails if needed

### Extension Not Loading?

1. **Check Developer Mode**: Must be enabled in `chrome://extensions/`
2. **Reload Extension**: Click the reload icon in extensions page
3. **Check Tuta Mail URL**: Must be on mail.tuta.com or app.tuta.com
4. **Browser Compatibility**: Tested on Chrome, Edge, Brave, and Firefox

## 🚧 Known Limitations

- Only processes **visible** emails (pagination not automated)
- Actions depend on Tuta Mail's UI structure (may break with major updates)
- No automatic scheduling (must click "Run Rules Now" manually)
- Folder/label selection not yet supported (coming soon!)

## 🔮 Future Enhancements

- [ ] Custom folder/label support
- [ ] Scheduled automatic rule execution
- [ ] Import/export rules
- [ ] Rule templates library
- [ ] Advanced filtering (date, has attachments, etc.)
- [ ] Undo functionality
- [ ] Bulk actions on all pages
- [ ] Statistics and reporting

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

## 📝 License

MIT License - feel free to use and modify as needed!

## 🙏 Acknowledgments

Created for anyone tired of manually organizing Tuta Mail! Special thanks to the Tuta Mail team for building a privacy-focused email service.

## 📧 Support

Having issues? Questions? Suggestions?
- Open an issue on GitHub
- Check the console for error messages (F12 → Console tab)
- Make sure you're using the latest version

---

**Happy Organizing! 🎉**

