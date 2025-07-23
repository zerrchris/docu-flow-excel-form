# DocuFlow Safari Extension

A Safari Web Extension that adds runsheet functionality to any webpage, allowing users to capture documents and data while browsing in Safari on macOS and iOS.

## Features

- **Cross-Browser Compatibility**: Same functionality as Firefox extension, optimized for Safari
- **Bottom Panel**: Persistent runsheet interface at the bottom of every webpage
- **Screen Capture**: Capture specific areas of any webpage (with Safari limitations)
- **Text Selection**: Add selected text from any page to your runsheet
- **Data Sync**: Sync captured data with the main DocuFlow web application
- **iOS Support**: Works on both macOS Safari and iOS Safari

## Safari-Specific Differences

### Screen Capture Limitations
- Safari has more restrictive screen capture APIs
- Uses `tabs.captureVisibleTab()` with fallback messaging
- May prompt users to use the main web app for full capture functionality

### Distribution Requirements
- **Must be distributed through Mac App Store**
- **Cannot be manually installed like Firefox extensions**
- Requires Apple Developer account for submission

## Development Setup

### Prerequisites
- macOS with Xcode installed
- Apple Developer account (for App Store submission)
- Safari 14+ for testing

### Xcode Project Setup

1. **Create Xcode Project**:
   ```bash
   # In Xcode, create new project
   # Choose "App" template
   # Enable "Safari Extension" capability
   ```

2. **Configure Extension**:
   - Set bundle identifier: `com.docuflow.safari-extension`
   - Add Safari Extension target to your app
   - Copy extension files to the Safari Extension target

3. **Update Info.plist**:
   ```xml
   <key>NSExtension</key>
   <dict>
       <key>NSExtensionPointIdentifier</key>
       <string>com.apple.Safari.extension</string>
       <key>NSExtensionMainStoryboard</key>
       <string>Main</string>
   </dict>
   ```

## File Structure

```
safari-extension/
├── manifest.json          # Safari Web Extension manifest
├── background.js          # Background script with Safari compatibility
├── content.js            # Content script with Safari optimizations
├── content.css           # Styles for injected content
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
└── README.md             # This file
```

## Key Safari Adaptations

### 1. API Compatibility
- Uses `browser` namespace instead of `chrome`
- Added Safari-specific error handling for restricted APIs
- Enhanced mobile Safari responsive design

### 2. Content Security Policy
- Added CSP header for Safari compliance
- Restricted inline scripts and styles

### 3. Mobile Safari Support
- Responsive CSS for iOS Safari
- Touch-friendly interface elements
- Optimized for mobile viewport

## Testing in Safari

### Development Testing
1. Enable Safari Developer menu
2. Go to Safari → Preferences → Advanced → Show Develop menu
3. Develop → Allow Unsigned Extensions
4. Open Safari Extension Builder
5. Load extension folder

### Production Testing
1. Build Xcode project
2. Install app on device/simulator
3. Enable extension in Safari preferences
4. Test on various websites

## App Store Submission

### Requirements
- Complete Xcode app wrapper
- App Store screenshots and metadata
- Privacy policy (required for extensions)
- App review compliance

### Submission Steps
1. **Prepare Xcode Project**:
   - Add app icon and metadata
   - Configure provisioning profiles
   - Set up App Store Connect entry

2. **Submit for Review**:
   - Upload via Xcode or Transporter
   - Complete App Store Connect information
   - Submit for Apple review

3. **Review Process**:
   - Apple reviews both app and extension
   - Address any feedback or rejections
   - Extension must follow Safari Extension guidelines

## Usage Instructions

### For End Users
1. Download "DocuFlow" app from Mac App Store
2. Install and launch the app
3. Go to Safari → Preferences → Extensions
4. Enable "DocuFlow Runsheet Assistant"
5. Visit any webpage to see the DocuFlow panel

### Extension Features
- Click the 📋 floating button to toggle the panel
- Use "Capture Area" to screenshot page sections
- Select text and click "Add Text" to save to runsheet
- Click "Save Row" to store current data
- Use popup to sync with main DocuFlow application

## Authentication Setup

The extension requires authentication with the main DocuFlow web application:

1. **Shared Session**: When logged into DocuFlow, the extension automatically inherits authentication
2. **Manual Auth**: Use the popup to manually authenticate if needed
3. **Token Storage**: Auth tokens stored securely in Safari's extension storage

## Privacy and Security

- All data stored locally until synced
- No external tracking or analytics
- Authentication required for web app sync
- Complies with Apple's privacy guidelines
- No data collection without user consent

## Support and Troubleshooting

### Common Issues
- **Screen capture not working**: Safari has restrictions, use main web app
- **Sync failing**: Check authentication in popup
- **Panel not appearing**: Refresh page and check extension is enabled

### Debug Mode
- Enable Safari Developer tools
- Check extension console for errors
- Verify permissions in Safari preferences

## Development Notes

### Cross-Browser Compatibility
- Shares core functionality with Firefox extension
- Uses WebExtensions API standard
- Platform-specific optimizations for Safari

### Future Enhancements
- iOS-specific gesture support
- Enhanced mobile Safari integration
- Advanced capture techniques within Safari limitations