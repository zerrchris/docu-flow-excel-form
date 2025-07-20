import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lovable.docuflowexcelform',
  appName: 'docu-flow-excel-form',
  webDir: 'dist',
  server: {
    url: 'https://9e913707-5b2b-41be-9c86-3541992b5349.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    Camera: {
      permissions: [
        'camera',
        'photos'
      ]
    }
  }
};

export default config;