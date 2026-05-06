import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.deity2026.charactervoice',
  appName: 'CharacterVoice',
  webDir: 'dist/public',
  // On device, the React app loads from a local bundle and points
  // its API calls at the deployed Render backend.
  server: {
    androidScheme: 'https',
    // Allow the deployed backend to be reached from the mobile webview.
    allowNavigation: ['character-voice.onrender.com'],
  },
  ios: {
    contentInset: 'automatic',
    // Required for "scrolls under the home bar" feel on iPhone X+.
  },
  android: {
    // Allow http during dev only; production uses https.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0F1115',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      // Match the dark navy hero used in the web app.
      style: 'DARK',
      backgroundColor: '#0F1115',
    },
  },
};

export default config;
