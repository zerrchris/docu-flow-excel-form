import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.9e9137075b2b41be9c863541992b5349',
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