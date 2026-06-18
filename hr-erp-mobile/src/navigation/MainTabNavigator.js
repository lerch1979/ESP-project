import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DashboardScreen from '../screens/DashboardScreen';
import ResidentHomeScreen from '../screens/ResidentHomeScreen';
import ResidentCalendarScreen from '../screens/calendar/ResidentCalendarScreen';
import TicketStackNavigator from './TicketStackNavigator';
import EmployeeStackNavigator from './EmployeeStackNavigator';
import WellbeingStackNavigator from './WellbeingStackNavigator';
import MoreStackNavigator from './MoreStackNavigator';
import { colors } from '../constants/colors';
import { useAuth } from '../contexts/AuthContext';
import { isResident } from '../utils/roles';

const Tab = createBottomTabNavigator();

const tabIcons = {
  Home: 'home',
  Dashboard: 'home',
  Calendar: 'calendar',
  Tickets: 'ticket',
  Employees: 'people',
  Wellbeing: 'heart',
  More: 'ellipsis-horizontal',
};

export default function MainTabNavigator() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Residents (accommodated_employee) get a trimmed tab set — only Tickets
  // (their own, via /my) + More (room, notifications, profile). Staff keep
  // the full set. This hides ~3 staff tabs and avoids 403-ing screens.
  const resident = isResident(user);

  return (
    <Tab.Navigator
      initialRouteName={resident ? 'Home' : 'Dashboard'}
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
      {resident && (
        <Tab.Screen
          name="Home"
          component={ResidentHomeScreen}
          options={{ title: t('nav.home') }}
        />
      )}
      {!resident && (
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ title: t('nav.home') }}
        />
      )}
      {resident && (
        <Tab.Screen
          name="Calendar"
          component={ResidentCalendarScreen}
          options={{ title: t('nav.calendar') }}
        />
      )}
      <Tab.Screen
        name="Tickets"
        component={TicketStackNavigator}
        options={{ headerShown: false, title: t('nav.tickets') }}
      />
      {!resident && (
        <Tab.Screen
          name="Wellbeing"
          component={WellbeingStackNavigator}
          options={{ headerShown: false, title: t('nav.wellbeing') }}
        />
      )}
      {!resident && (
        <Tab.Screen
          name="Employees"
          component={EmployeeStackNavigator}
          options={{ headerShown: false, title: t('nav.employees') }}
        />
      )}
      <Tab.Screen
        name="More"
        component={MoreStackNavigator}
        options={{ headerShown: false, title: t('nav.more') }}
      />
    </Tab.Navigator>
  );
}
