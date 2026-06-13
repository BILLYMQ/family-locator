import React from 'react';
import { View, ActivityIndicator, Platform, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { enableScreens } from 'react-native-screens';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import LoginScreen    from '@/screens/auth/LoginScreen';
import RegisterScreen from '@/screens/auth/RegisterScreen';
import MapScreen      from '@/screens/map/MapScreen';
import FamilyScreen   from '@/screens/family/FamilyScreen';
import ProfileScreen  from '@/screens/profile/ProfileScreen';

// react-native-screens rend les écrans non-cliquables sur web sans ce flag
if (Platform.OS === 'web') {
  enableScreens(false);
}

export type AuthStackParams = {
  Login: undefined;
  Register: undefined;
};

export type AppTabParams = {
  Map: undefined;
  Family: undefined;
  Profile: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParams>();
const AppTab    = createBottomTabNavigator<AppTabParams>();

// ---- Error boundary pour isoler un crash de MapScreen (react-leaflet) ----
class ScreenErrorBoundary extends React.Component<
  { children: React.ReactNode; name: string },
  { crashed: boolean; message: string }
> {
  state = { crashed: false, message: '' };

  static getDerivedStateFromError(error: Error) {
    return { crashed: true, message: error.message };
  }

  render() {
    if (this.state.crashed) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 32, marginBottom: 12 }}>⚠️</Text>
          <Text style={{ fontWeight: '700', fontSize: 16, color: '#1f2937', marginBottom: 8 }}>
            Erreur — {this.props.name}
          </Text>
          <Text style={{ color: '#6b7280', textAlign: 'center', fontSize: 13 }}>
            {this.state.message}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function SafeMapScreen()     { return <ScreenErrorBoundary name="Carte"><MapScreen /></ScreenErrorBoundary>; }
function SafeFamilyScreen()  { return <ScreenErrorBoundary name="Famille"><FamilyScreen /></ScreenErrorBoundary>; }
function SafeProfileScreen() { return <ScreenErrorBoundary name="Profil"><ProfileScreen /></ScreenErrorBoundary>; }

// ---- Navigateurs ----

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login"    component={LoginWithNav} />
      <AuthStack.Screen name="Register" component={RegisterWithNav} />
    </AuthStack.Navigator>
  );
}

function LoginWithNav({ navigation }: any) {
  return <LoginScreen onNavigateToRegister={() => navigation.navigate('Register')} />;
}
function RegisterWithNav({ navigation }: any) {
  return <RegisterScreen onNavigateToLogin={() => navigation.navigate('Login')} />;
}

function AppNavigatorTabs() {
  const { user } = useAuth();
  useNotifications(user?.id);

  return (
    <AppTab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Map:     focused ? 'map'     : 'map-outline',
            Family:  focused ? 'people'  : 'people-outline',
            Profile: focused ? 'person'  : 'person-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
        tabBarActiveTintColor:   '#1e40af',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          borderTopWidth: 0,
          elevation: 10,
          shadowOpacity: 0.1,
          height: 60,
          paddingBottom: 8,
        },
        headerStyle:      { backgroundColor: '#1e40af' },
        headerTintColor:  'white',
        headerTitleStyle: { fontWeight: '700' },
      })}
    >
      <AppTab.Screen
        name="Map"
        component={SafeMapScreen}
        options={{ title: 'Carte', tabBarLabel: 'Carte' }}
      />
      <AppTab.Screen
        name="Family"
        component={SafeFamilyScreen}
        options={{ title: 'Ma Famille', tabBarLabel: 'Famille' }}
      />
      <AppTab.Screen
        name="Profile"
        component={SafeProfileScreen}
        options={{ title: 'Mon Profil', tabBarLabel: 'Profil' }}
      />
    </AppTab.Navigator>
  );
}

export default function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-primary-800">
        <ActivityIndicator size="large" color="white" />
      </View>
    );
  }

  // Pas de linking config : une config plate est incompatible avec des navigateurs
  // conditionnels (auth ↔ app). Sans linking, navigation.navigate() fonctionne
  // normalement — seule la synchronisation URL est absente.
  return (
    <NavigationContainer>
      {session ? <AppNavigatorTabs /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
