import './global.css';
import 'react-native-url-polyfill/auto';
import React from 'react';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import RootNavigator from '@/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <RootNavigator />
    </SafeAreaProvider>
  );
}
