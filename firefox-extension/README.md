# DocuFlow Firefox Extension

A Firefox browser extension that adds runsheet functionality to any webpage, allowing users to capture documents and data while browsing.

## Features

- **Bottom Panel**: Persistent runsheet interface at the bottom of every webpage
- **Screen Capture**: Capture specific areas of any webpage 
- **Text Selection**: Add selected text from any page to your runsheet
- **Data Sync**: Sync captured data with the main DocuFlow web application
- **Cross-Site Functionality**: Works on any website while maintaining runsheet context

## Installation

### Development Installation

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on"
4. Navigate to the extension folder and select `manifest.json`

### Production Installation

1. Package the extension into a `.xpi` file
2. Submit to Firefox Add-ons store
3. Users can install from the store

## File Structure

```
firefox-extension/
├── manifest.json          # Extension configuration and permissions
├── background.js          # Background script for screenshots and sync
├── content.js            # Content script injected into all pages
├── content.css           # Styles for injected content
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
└── icons/                # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Key Components

### Content Script (`content.js`)
- Injects a collapsible bottom panel on every webpage
- Provides capture and text selection functionality
- Maintains runsheet context across page navigation

### Background Script (`background.js`)
- Handles screen capture using `tabs.captureVisibleTab()`
- Manages data storage and sync with web application
- Processes messages between content scripts and popup

### Popup Interface (`popup.html/js`)
- Main extension control panel
- Displays current runsheet status and session data
- Provides sync and management controls

## Usage

1. **Activate Panel**: Click the floating toggle button or use the extension popup
2. **Capture Areas**: Click "Capture Area" to screenshot specific regions
3. **Add Text**: Select text on any page and click "Add Text"
4. **Save Rows**: Click "Save Row" to store current data to your runsheet
5. **Sync Data**: Use the popup to sync all data with the main web app

## Permissions

- `activeTab`: Access current tab for screenshots
- `storage`: Store runsheet data locally
- `tabs`: Manage browser tabs and capture content
- Web app domains: Sync data with DocuFlow application

## Development

### Testing
1. Load the extension in Firefox developer mode
2. Navigate to any webpage to see the panel
3. Test capture and text selection features
4. Verify data persistence and sync functionality

### Integration with Web App
- Shares Supabase backend with main application
- Uses same authentication system
- Syncs data to existing runsheet structure

## Security Considerations

- All data stored locally until synced
- Authentication required for web app sync
- Captures stored as base64 data URLs
- No external API calls without user consent