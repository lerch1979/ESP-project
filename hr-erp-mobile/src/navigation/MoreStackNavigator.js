import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MoreMenuScreen from '../screens/more/MoreMenuScreen';
import AccommodationListScreen from '../screens/more/AccommodationListScreen';
import AccommodationDetailScreen from '../screens/more/AccommodationDetailScreen';
import DocumentListScreen from '../screens/more/DocumentListScreen';
import DocumentDetailScreen from '../screens/more/DocumentDetailScreen';
import ProfileScreen from '../screens/more/ProfileScreen';
import GoogleCalendarScreen from '../screens/more/GoogleCalendarScreen';
import { colors } from '../constants/colors';

const Stack = createNativeStackNavigator();

export default function MoreStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="MoreMenu" component={MoreMenuScreen} options={{ title: 'Továbbiak' }} />
      <Stack.Screen name="AccommodationList" component={AccommodationListScreen} options={{ title: 'Szálláshelyek' }} />
      <Stack.Screen name="AccommodationDetail" component={AccommodationDetailScreen} options={{ title: 'Szálláshely' }} />
      <Stack.Screen name="DocumentList" component={DocumentListScreen} options={{ title: 'Dokumentumok' }} />
      <Stack.Screen name="DocumentDetail" component={DocumentDetailScreen} options={{ title: 'Dokumentum' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
      <Stack.Screen name="GoogleCalendar" component={GoogleCalendarScreen} options={{ title: 'Google Naptár' }} />
    </Stack.Navigator>
  );
}
