import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TicketListScreen from '../screens/tickets/TicketListScreen';
import TicketDetailScreen from '../screens/tickets/TicketDetailScreen';
import CreateTicketScreen from '../screens/tickets/CreateTicketScreen';
import { colors } from '../constants/colors';

const Stack = createNativeStackNavigator();

export default function TicketStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="TicketList" component={TicketListScreen} options={{ title: 'Hibajegyek' }} />
      <Stack.Screen name="TicketDetail" component={TicketDetailScreen} options={{ title: 'Hibajegy' }} />
      <Stack.Screen name="CreateTicket" component={CreateTicketScreen} options={{ title: 'Új hibajegy' }} />
    </Stack.Navigator>
  );
}
