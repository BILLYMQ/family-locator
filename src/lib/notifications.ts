import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// Comportement des notifications quand l'app est au premier plan
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null; // Simulateurs non supportés

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('family-locator', {
      name: 'FamilyLocator',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1e40af',
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  return token;
}

export async function savePushToken(userId: string, token: string) {
  await supabase
    .from('profiles')
    .update({ push_token: token } as any)
    .eq('id', userId);
}

// Notifications locales déclenchées en interne (invitation reçue, etc.)
export function notifyInvitationReceived(senderName: string) {
  Notifications.scheduleNotificationAsync({
    content: {
      title: '👨‍👩‍👧 Invitation FamilyLocator',
      body: `${senderName} vous invite à rejoindre sa famille.`,
      sound: true,
      data: { type: 'invitation' },
    },
    trigger: null, // immédiat
  });
}

export function notifyInvitationAccepted(memberName: string) {
  Notifications.scheduleNotificationAsync({
    content: {
      title: '✅ Invitation acceptée',
      body: `${memberName} a rejoint votre famille.`,
      sound: true,
      data: { type: 'invitation_accepted' },
    },
    trigger: null,
  });
}
