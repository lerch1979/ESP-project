import React, { useEffect, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../contexts/AuthContext';
import { getItem, setItem } from '../services/storage';
import LoadingScreen from '../components/LoadingScreen';
import LoginScreen from '../screens/LoginScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import MainTabNavigator from './MainTabNavigator';
import { routeForNotification } from '../services/push';

const ONBOARDING_FLAG = 'hasSeenOnboarding';

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
  // null = not yet determined; true/false once the flag is read.
  const [needsOnboarding, setNeedsOnboarding] = useState(null);

  useEffect(() => {
    if (!user) { setNeedsOnboarding(null); return; }
    getItem(ONBOARDING_FLAG)
      .then((v) => setNeedsOnboarding(v !== '1'))
      .catch(() => setNeedsOnboarding(false));
  }, [user]);

  const finishOnboarding = () => {
    setItem(ONBOARDING_FLAG, '1').catch(() => {});
    setNeedsOnboarding(false);
  };

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

  // Wait for auth, and (once logged in) for the onboarding flag, to avoid a
  // flash of Main before the welcome.
  if (isLoading || (user && needsOnboarding === null)) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : needsOnboarding ? (
          <Stack.Screen name="Onboarding">
            {(props) => <OnboardingScreen {...props} onDone={finishOnboarding} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Main" component={MainTabNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
