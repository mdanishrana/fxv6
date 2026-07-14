import { useState, useEffect } from 'react';

const VAPID_PUBLIC_KEY = 'BLadfaEWIh_G8hjHI2tMMlegsSU6sextaEZqYfgp6Vb8cy8biF_yY6tcxHsATfjNlwbKNu0JxeOR1Q87Tr_tz1Y';

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function usePushNotifications() {
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if ('Notification' in window) {
            setPermission(Notification.permission);
            checkSubscription();
        }
    }, []);

    const checkSubscription = async () => {
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            setIsSubscribed(!!subscription);
        }
    };

    const subscribeParams = {
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    };

    const subscribeToPush = async () => {
        setLoading(true);
        setError(null);
        try {
            const registration = await navigator.serviceWorker.ready;

            // Request permission if not granted
            if (Notification.permission !== 'granted') {
                const result = await Notification.requestPermission();
                setPermission(result);
                if (result !== 'granted') {
                    throw new Error('Notification permission denied');
                }
            }

            // Subscribe to push mnager
            const subscription = await registration.pushManager.subscribe(subscribeParams);

            // Send subscription to backend
            const token = localStorage.getItem('farmxpert_token');
            const response = await fetch('/api/notifications/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(subscription)
            });

            if (!response.ok) {
                throw new Error('Failed to save subscription to server');
            }

            setIsSubscribed(true);
            console.log('Push subscription successful:', subscription);
        } catch (err: any) {
            console.error('Push subscription failed:', err);
            setError(err.message || 'Failed to subscribe');
        } finally {
            setLoading(false);
        }
    };

    // Optional: Unsubscribe
    const unsubscribeFromPush = async () => {
        // Logic to remove subscription from Service Worker and Backend (if needed)
        console.log('Unsubscribe feature pending');
    };

    return {
        permission,
        isSubscribed,
        subscribeToPush,
        loading,
        error
    };
}
