import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Storage from '@/utils/storage';

const isExpoGo = Constants.appOwnership === 'expo';

let Notifications: typeof import('expo-notifications') | null = null;
let Device: typeof import('expo-device') | null = null;

try {
  Notifications = require('expo-notifications');
  Device = require('expo-device');
  console.log('[Notifications] modules loaded successfully (expoGo:', isExpoGo, ')');
} catch (e) {
  console.warn('[Notifications] failed to load modules:', e);
}

export interface NotificationPrefs {
  critical: boolean;
  advisory: boolean;
  myReports: boolean;
}

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const [nc, na, nr] = await Promise.all([
    Storage.getItem('ft_notif_critical'),
    Storage.getItem('ft_notif_advisory'),
    Storage.getItem('ft_notif_reports'),
  ]);
  return {
    critical:  nc !== 'false',
    advisory:  na !== 'false',
    myReports: nr !== 'false',
  };
}

function shouldShowNotification(data: any, prefs: NotificationPrefs): boolean {
  if (!data?.type) return true;

  if (data.type === 'alert') {
    if (data.kind === 'critical') return prefs.critical;
    if (data.kind === 'advisory') return prefs.advisory;
    return true;
  }

  if (data.type === 'status_update') return prefs.myReports;

  // incident_assigned, incident_message — always show
  return true;
}

let initialized = false;

export function initNotifications() {
  if (initialized || !Notifications) {
    console.log('[Notifications] initNotifications skipped:', { initialized, hasNotifications: !!Notifications });
    return;
  }
  initialized = true;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data;
        const prefs = await getNotificationPrefs();
        const show = shouldShowNotification(data, prefs);

        return {
          shouldShowAlert: show,
          shouldPlaySound: show,
          shouldSetBadge: show,
          shouldShowBanner: show,
          shouldShowList: show,
        };
      },
    });

    if (Platform.OS === 'android') {
      // Critical alerts — highest priority, persistent, custom vibration
      Notifications.setNotificationChannelAsync('floodtrack-critical', {
        name: 'Emergency Alerts',
        description: 'Critical flood warnings and emergency notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 200, 500, 200, 500],
        lightColor: '#D32F2F',
        sound: 'default',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        enableLights: true,
        enableVibrate: true,
      });

      // Advisory alerts — high priority
      Notifications.setNotificationChannelAsync('floodtrack-advisory', {
        name: 'Advisories',
        description: 'Weather advisories and flood warnings',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 300, 150, 300],
        lightColor: '#EA6A0C',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
      });

      // General updates — default priority
      Notifications.setNotificationChannelAsync('floodtrack-updates', {
        name: 'Updates',
        description: 'Report status updates and general notifications',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#1F6FBF',
        sound: 'default',
        enableVibrate: true,
      });

      // Messages — default priority
      Notifications.setNotificationChannelAsync('floodtrack-messages', {
        name: 'Messages',
        description: 'Chat messages from responders',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 150, 100, 150],
        lightColor: '#0FA896',
        sound: 'default',
        enableVibrate: true,
      });

      // Remove old unified channel
      Notifications.deleteNotificationChannelAsync('floodtrack').catch(() => {});
    }

    // iOS notification categories with action buttons
    if (Platform.OS === 'ios') {
      Notifications.setNotificationCategoryAsync('critical_alert', [
        { identifier: 'view', buttonTitle: 'View Details', options: { opensAppToForeground: true } },
        { identifier: 'dismiss', buttonTitle: 'Dismiss', options: { isDestructive: true } },
      ]);
      Notifications.setNotificationCategoryAsync('report_update', [
        { identifier: 'view', buttonTitle: 'View Report', options: { opensAppToForeground: true } },
      ]);
    }

    console.log('[Notifications] channels and categories configured');
  } catch (e) {
    console.error('[Notifications] initNotifications failed:', e);
  }
}

export async function getExpoPushToken(): Promise<string | null> {
  if (!Notifications || !Device) {
    console.warn('[Notifications] getExpoPushToken skipped:', { hasNotifications: !!Notifications, hasDevice: !!Device });
    return null;
  }

  try {
    if (!Device.isDevice) {
      console.warn('[Notifications] not a physical device');
      return null;
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[Notifications] permission not granted:', finalStatus);
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId
      ?? Constants.easConfig?.projectId;

    if (!projectId) {
      console.error('[Notifications] no EAS projectId found. expoConfig:', JSON.stringify(Constants.expoConfig?.extra), 'easConfig:', JSON.stringify(Constants.easConfig));
      return null;
    }

    console.log('[Notifications] requesting push token with projectId:', projectId);
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('[Notifications] push token obtained:', tokenData.data);
    return tokenData.data;
  } catch (e) {
    console.error('[Notifications] getExpoPushToken failed:', e);
    return null;
  }
}

const noop = { remove: () => {} };

export function onNotificationReceived(callback: (notification: any) => void) {
  if (!Notifications) return noop;
  try { return Notifications.addNotificationReceivedListener(callback); }
  catch { return noop; }
}

export function onNotificationResponse(callback: (response: any) => void) {
  if (!Notifications) return noop;
  try { return Notifications.addNotificationResponseReceivedListener(callback); }
  catch { return noop; }
}
