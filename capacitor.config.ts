import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ztasks.app',
  appName: 'ZTasks',
  webDir: 'dist',
  server: {
    // Allow loading from your Supabase backend
    allowNavigation: ['*.supabase.co', '*.supabase.in'],
  },
  plugins: {
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0a0a0a',
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#0a0a0a',
      showSpinner: true,
      spinnerColor: '#7c3aed',
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
    },
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
