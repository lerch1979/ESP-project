import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import TicketListScreen from '../screens/tickets/TicketListScreen';
import TicketDetailScreen from '../screens/tickets/TicketDetailScreen';
import CreateTicketScreen from '../screens/tickets/CreateTicketScreen';
import { colors } from '../constants/colors';

const Stack = createNativeStackNavigator();

export default function TicketStackNavigator() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="TicketList" component={TicketListScreen} options={{ title: t('nav.tickets') }} />
      <Stack.Screen name="TicketDetail" component={TicketDetailScreen} options={{ title: t('ticket.detail') }} />
      <Stack.Screen name="CreateTicket" component={CreateTicketScreen} options={{ title: t('ticket.newTicket') }} />
    </Stack.Navigator>
  );
}
