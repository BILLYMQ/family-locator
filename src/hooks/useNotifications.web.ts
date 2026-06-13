// expo-notifications requires native modules unavailable on web.
// Metro selects this stub automatically when bundling for web.
export function useNotifications(_userId: string | undefined): void {}
