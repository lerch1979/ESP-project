import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import DashboardScreen from '../screens/DashboardScreen';
import TicketStackNavigator from './TicketStackNavigator';
import EmployeeStackNavigator from './EmployeeStackNavigator';
import ChatbotStackNavigator from './ChatbotStackNavigator';
import MoreStackNavigator from './MoreStackNavigator';
import { colors } from '../constants/colors';

const Tab = createBottomTabNavigator();

const tabIcons = {
  Dashboard: 'home',
  Tickets: 'ticket',
  Employees: 'people',
  Chatbot: 'chatbubble-ellipses',
  More: 'ellipsis-horizontal',
};

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const iconName = tabIcons[route.name] + (focused ? '' : '-outline');
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.white,
        },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '600' },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Kezdőlap' }}
      />
      <Tab.Screen
        name="Tickets"
        component={TicketStackNavigator}
        options={{ headerShown: false, title: 'Hibajegyek' }}
      />
      <Tab.Screen
        name="Employees"
        component={EmployeeStackNavigator}
        options={{ headerShown: false, title: 'Munkavállalók' }}
      />
      <Tab.Screen
        name="Chatbot"
        component={ChatbotStackNavigator}
        options={{ headerShown: false, title: 'Segitseg' }}
      />
      <Tab.Screen
        name="More"
        component={MoreStackNavigator}
        options={{ headerShown: false, title: 'Tovabbiak' }}
      />
    </Tab.Navigator>
  );
}
