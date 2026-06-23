// app.config.js takes precedence over app.json when both exist.
// Environment variables (EXPO_PUBLIC_*) are loaded from .env automatically by Expo CLI.

/** @type {import('expo/config').ExpoConfig} */
export default {
  name: 'FloodTrack',
  slug: 'FloodTrack',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'floodtrack',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,

  ios: {
    supportsTablet: true,
    config: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS,
    },
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'FloodTrack needs your location to show nearby hazards and auto-fill your report location.',
    },
  },

  android: {
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID,
      },
    },
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },

  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        dark: { backgroundColor: '#000000' },
      },
    ],
    'expo-secure-store',
  ],

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};
