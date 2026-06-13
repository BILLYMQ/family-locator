import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { registerForPushNotifications, savePushToken } from '@/lib/notifications';

export function useNotifications(userId: string | undefined) {
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener     = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    if (!userId) return;

    registerForPushNotifications().then(token => {
      if (token) savePushToken(userId, token);
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(
      notification => {
        console.log('[Notification reçue]', notification.request.content.title);
      }
    );

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      response => {
        const data = response.notification.request.content.data;
        console.log('[Notification tapée]', data);
        // Navigation vers l'écran famille si invitation
      }
    );

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [userId]);
}
