import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MoreMenuScreen from '../screens/more/MoreMenuScreen';
import AccommodationListScreen from '../screens/more/AccommodationListScreen';
import AccommodationDetailScreen from '../screens/more/AccommodationDetailScreen';
import ProfileScreen from '../screens/more/ProfileScreen';
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
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
    </Stack.Navigator>
  );
}
