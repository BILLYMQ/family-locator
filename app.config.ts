import { ExpoConfig, ConfigContext } from 'expo/config';

// Ce fichier remplace app.json au runtime pour injecter les variables d'env
// dynamiquement selon le profil EAS (development / preview / production).
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'FamilyLocator',
  slug: 'family-locator',
  extra: {
    supabaseUrl:     process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    appEnv:          process.env.APP_ENV ?? 'development',
    eas: {
      projectId: 'f49acd09-e6a3-4e1c-9859-daa2aadb4879',
    },
  },
});
