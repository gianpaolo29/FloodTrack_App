// app.config.js takes precedence over app.json when both exist.
// Environment variables (EXPO_PUBLIC_*) are loaded from .env automatically by Expo CLI.

/** @type {import('expo/config').ExpoConfig} */
export default {
  name: 'FloodTrack',
  slug: 'FloodTrack',
  owner: 'gianpaolo29',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/floodtrack-badge-primary.png',
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
      LSApplicationQueriesSchemes: ['fbapi', 'fb-messenger-share-api', 'fbauth2', 'fbshareextension'],
    },
  },

  android: {
    package: 'com.gianpaolo29.floodtrack',
    googleServicesFile: './google-services.json',
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID,
      },
    },
    adaptiveIcon: {
      backgroundColor: '#0B2F52',
      foregroundImage: './assets/images/floodtrack-badge-primary.png',
      monochromeImage: './assets/images/floodtrack-badge-primary.png',
    },
    queries: {
      schemes: ['fb', 'fbapi', 'fbauth2'],
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },

  web: {
    output: 'static',
    favicon: './assets/images/floodtrack-badge-primary.png',
  },

  plugins: [
    'expo-router',
    'expo-av',
    '@react-native-google-signin/google-signin',
    [
      'expo-splash-screen',
      {
        image: './assets/images/floodtrack-badge-primary.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        dark: { backgroundColor: '#000000' },
      },
    ],
    'expo-secure-store',
    [
      'expo-notifications',
      {
        icon: './assets/images/floodtrack-badge-primary.png',
        color: '#1F6FBF',
        defaultChannel: 'floodtrack',
        sounds: [],
      },
    ],
  ],

  extra: {
    eas: {
      projectId: 'dfa8f980-bd25-4f27-bcf6-8c4245fc1ae1',
    },
  },

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};
