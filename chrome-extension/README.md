# RunsheetPro Chrome Extension

A comprehensive Chrome extension for capturing documents and integrating them with the RunsheetPro application.

## Features

- 🔐 **Secure Authentication** - Sign in directly through the extension
- 📋 **Runsheet Management** - Select and manage active runsheets
- 📷 **Document Capture** - Screenshot and snip documents from any webpage
- 🤖 **AI Analysis** - Automatic data extraction from captured documents
- 📊 **Real-time Sync** - Instant synchronization with the main application
- 🔄 **Error Handling** - Robust error detection and user feedback

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `chrome-extension` folder
4. The extension should now appear in your Chrome toolbar

## Usage

### Getting Started

1. **Activate Extension**: Click the extension icon and press "Activate Extension"
2. **Sign In**: If not authenticated, sign in with your RunsheetPro credentials
3. **Select Runsheet**: Choose an active runsheet or create a new one
4. **Start Capturing**: Use the floating button or extension popup to capture documents

### Document Capture

The extension supports multiple capture modes:

- **Single Snip**: Capture a specific area of the page
- **Full Page**: Capture the entire page
- **Multiple Snips**: Capture multiple areas in sequence

### Navigation

- **Float Button**: Access runsheet interface from any page
- **Extension Popup**: Quick controls and settings
- **View Modes**: Switch between single-entry and full-view modes

## Testing

### Manual Testing

1. **Load Extension**: Install the extension in Chrome
2. **Open Test Page**: Navigate to any webpage with documents
3. **Run Tests**: Open browser console and run `ExtensionTester.runAllTests()`
4. **Check Results**: Review test results in the test UI

### Test Coverage

The extension includes comprehensive tests for:

- ✅ Authentication validation
- ✅ Runsheet selection and management
- ✅ Document capture functionality
- ✅ Data extraction and AI analysis
- ✅ Error handling and recovery
- ✅ UI responsiveness and styling

### Debugging

Enable debug logging by opening browser console:

```javascript
// View all extension logs
console.log('Extension logs available with prefix: 🔧 RunsheetPro Extension')

// Test specific functionality
ExtensionTester.runAllTests()

// Check authentication status
chrome.storage.local.get(['supabase_session'], console.log)

// Check active runsheet
chrome.storage.local.get(['activeRunsheet'], console.log)
```

## Architecture

### Core Components

```
chrome-extension/
├── manifest.json           # Extension configuration
├── popup.html             # Extension popup interface
├── popup.js               # Popup functionality
├── content.js             # Main content script (4600+ lines)
├── content.css            # Extension styling
├── background.js          # Service worker
├── enhanced-snip-workflow.js  # AI-powered document processing
├── error-handler.js       # Error handling utilities
├── extension-tester.js    # Testing suite
└── persistent-state.js    # State management
```

### Key Features

1. **Enhanced Snip Workflow**
   - AI-powered document analysis
   - Automatic data extraction
   - Real-time processing feedback
   - Error recovery mechanisms

2. **Error Handling System**
   - User-friendly error messages
   - Automatic retry mechanisms
   - File validation
   - Network error detection

3. **Testing Suite**
   - Comprehensive test coverage
   - Visual test results
   - Performance monitoring
   - Real-time feedback

### API Integration

The extension integrates with these Supabase edge functions:

- `extension-document-link` - Upload and link documents
- `enhanced-document-analysis` - AI document analysis
- `populate-runsheet-data` - Populate extracted data
- `create-quick-runsheet` - Create new runsheets
- `extension-sync` - Synchronize data

### Security

- 🔒 Secure token storage using Chrome storage API
- 🔐 HTTPS-only API communications
- 🛡️ Input validation and sanitization
- 🔑 User authentication verification
- 📝 Audit logging for debugging

## Troubleshooting

### Common Issues

**Extension not appearing:**
- Check if developer mode is enabled
- Verify extension is loaded and enabled
- Check for manifest.json errors in extensions page

**Authentication fails:**
- Clear extension storage: `chrome.storage.local.clear()`
- Check network connectivity
- Verify Supabase API credentials

**Capture not working:**
- Check browser permissions
- Verify activeTab permission granted
- Test with different websites

**Data not syncing:**
- Check authentication status at `/auth-status`
- Verify runsheet is selected
- Check browser console for errors

### Debug Commands

```javascript
// Clear all extension data
chrome.storage.local.clear()

// Check extension status
chrome.storage.local.get(null, console.log)

// Test capture functionality
window.EnhancedSnipWorkflow.blobToBase64(new Blob(['test']))

// Validate error handling
window.ExtensionErrorHandler.showError('Test error message')

// Run full test suite
ExtensionTester.runAllTests()
```

### Performance Monitoring

The extension includes performance monitoring:

- Document processing time tracking
- API response time measurement
- Memory usage monitoring
- Error rate tracking

## Development

### Making Changes

1. Edit the relevant files in the `chrome-extension` folder
2. Reload the extension in `chrome://extensions/`
3. Test changes thoroughly
4. Run the test suite to verify functionality

### Adding New Features

1. Update `manifest.json` if new permissions needed
2. Add functionality to appropriate component files
3. Update error handling in `error-handler.js`
4. Add tests to `extension-tester.js`
5. Update this README

### Best Practices

- Always test changes across multiple websites
- Verify authentication flows work correctly
- Check error handling for edge cases
- Ensure responsive design on different screen sizes
- Test with various document types and sizes

## Support

For issues or questions:

1. Check browser console for error messages
2. Run the test suite for diagnostic information
3. Check the `/auth-status` page for authentication issues
4. Review the troubleshooting section above

## Version History

- **v1.0.0** - Initial release with basic capture functionality
- **v1.1.0** - Added AI document analysis
- **v1.2.0** - Enhanced error handling and testing
- **v1.3.0** - Improved UI responsiveness and performance