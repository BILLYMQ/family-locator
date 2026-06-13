import React, { useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import LoginScreen    from '@/screens/auth/LoginScreen';
import RegisterScreen from '@/screens/auth/RegisterScreen';
import MapScreen      from '@/screens/map/MapScreen';
import FamilyScreen   from '@/screens/family/FamilyScreen';
import ProfileScreen  from '@/screens/profile/ProfileScreen';

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
        component={MapScreen}
        options={{ title: 'Carte', tabBarLabel: 'Carte' }}
      />
      <AppTab.Screen
        name="Family"
        component={FamilyScreen}
        options={{ title: 'Ma Famille', tabBarLabel: 'Famille' }}
      />
      <AppTab.Screen
        name="Profile"
        component={ProfileScreen}
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

  return (
    <NavigationContainer>
      {session ? <AppNavigatorTabs /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
