import React, { useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../contexts/AuthContext';
import LoadingScreen from '../components/LoadingScreen';
import LoginScreen from '../screens/LoginScreen';
import MainTabNavigator from './MainTabNavigator';
import { routeForNotification } from '../services/push';

const Stack = createNativeStackNavigator();
export const navigationRef = createNavigationContainerRef();

// Navigate from a tapped push. Retries briefly because a cold start may tap
// before the container (or the Main tabs after login) has mounted.
function navigateFromData(data, attempt = 0) {
  const route = routeForNotification(data);
  if (!route) return;
  if (!navigationRef.isReady()) {
    if (attempt < 10) setTimeout(() => navigateFromData(data, attempt + 1), 300);
    return;
  }
  if (route.nested) {
    navigationRef.navigate('Main', { screen: route.tab, params: route.nested });
  } else {
    navigationRef.navigate('Main', { screen: route.tab });
  }
}

export default function AppNavigator() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    // Tapped while the app is running/backgrounded.
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      navigateFromData(resp?.notification?.request?.content?.data);
    });
    // Tapped while the app was killed (cold start).
    Notifications.getLastNotificationResponseAsync().then((resp) => {
      if (resp) navigateFromData(resp.notification.request.content.data);
    }).catch(() => {});
    return () => sub.remove();
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainTabNavigator} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
