import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Storage from '@/utils/storage';

const isExpoGo = Constants.appOwnership === 'expo';

let Notifications: typeof import('expo-notifications') | null = null;
let Device: typeof import('expo-device') | null = null;

if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
    Device = require('expo-device');
  } catch {
  }
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
  if (initialized || !Notifications) return;
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
      Notifications.setNotificationChannelAsync('floodtrack', {
        name: 'FloodTrack Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1F6FBF',
        sound: 'default',
      });
    }
  } catch {
  }
}

export async function getExpoPushToken(): Promise<string | null> {
  if (!Notifications || !Device || isExpoGo) return null;

  try {
    if (!Device.isDevice) return null;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId
      ?? Constants.easConfig?.projectId;

    if (!projectId) return null;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch {
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
