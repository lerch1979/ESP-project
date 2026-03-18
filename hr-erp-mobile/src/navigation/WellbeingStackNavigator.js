import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../constants/colors';

// WellMind screens
import WellMindDashboard from '../screens/WellMind/WellMindDashboard';
import DailyPulseScreen from '../screens/WellMind/DailyPulseScreen';
import PulseHistoryScreen from '../screens/WellMind/PulseHistoryScreen';
import AssessmentScreen from '../screens/WellMind/AssessmentScreen';
import AssessmentResultsScreen from '../screens/WellMind/AssessmentResultsScreen';
import InterventionsScreen from '../screens/WellMind/InterventionsScreen';
import CoachingSessionsScreen from '../screens/WellMind/CoachingSessionsScreen';
import OvertimeTrackerScreen from '../screens/WellMind/OvertimeTrackerScreen';

// Housing screens
import HousingFeedbackScreen from '../screens/Housing/HousingFeedbackScreen';

// CarePath screens
import CarePathDashboard from '../screens/CarePath/CarePathDashboard';
import ServiceCategoriesScreen from '../screens/CarePath/ServiceCategoriesScreen';
import CreateCaseScreen from '../screens/CarePath/CreateCaseScreen';
import MyCasesScreen from '../screens/CarePath/MyCasesScreen';
import CaseDetailsScreen from '../screens/CarePath/CaseDetailsScreen';
import ProviderSearchScreen from '../screens/CarePath/ProviderSearchScreen';
import ProviderDetailsScreen from '../screens/CarePath/ProviderDetailsScreen';
import BookingScreen from '../screens/CarePath/BookingScreen';

// Gamification screens
import BadgeCollectionScreen from '../screens/Gamification/BadgeCollectionScreen';
import LeaderboardScreen from '../screens/Gamification/LeaderboardScreen';

// Hub screen
import WellbeingHubScreen from '../screens/WellbeingHubScreen';

const Stack = createNativeStackNavigator();

export default function WellbeingStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="WellbeingHub" component={WellbeingHubScreen} options={{ title: 'Jóllét' }} />

      {/* WellMind */}
      <Stack.Screen name="WellMindDashboard" component={WellMindDashboard} options={{ title: 'WellMind' }} />
      <Stack.Screen name="DailyPulse" component={DailyPulseScreen} options={{ title: 'Napi hangulat' }} />
      <Stack.Screen name="PulseHistory" component={PulseHistoryScreen} options={{ title: 'Hangulat előzmények' }} />
      <Stack.Screen name="Assessment" component={AssessmentScreen} options={{ title: 'Felmérés' }} />
      <Stack.Screen name="AssessmentResults" component={AssessmentResultsScreen} options={{ title: 'Eredmények' }} />
      <Stack.Screen name="Interventions" component={InterventionsScreen} options={{ title: 'Beavatkozások' }} />
      <Stack.Screen name="CoachingSessions" component={CoachingSessionsScreen} options={{ title: 'Coaching' }} />
      <Stack.Screen name="OvertimeTracker" component={OvertimeTrackerScreen} options={{ title: 'Túlóra' }} />

      {/* Gamification */}
      <Stack.Screen name="BadgeCollection" component={BadgeCollectionScreen} options={{ title: 'Jelvények' }} />
      <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: 'Ranglista' }} />

      {/* Housing */}
      <Stack.Screen name="HousingFeedback" component={HousingFeedbackScreen} options={{ title: 'Szállás visszajelzés' }} />

      {/* CarePath */}
      <Stack.Screen name="CarePathDashboard" component={CarePathDashboard} options={{ title: 'CarePath' }} />
      <Stack.Screen name="ServiceCategories" component={ServiceCategoriesScreen} options={{ title: 'Szolgáltatások' }} />
      <Stack.Screen name="CreateCase" component={CreateCaseScreen} options={{ title: 'Új ügy' }} />
      <Stack.Screen name="MyCases" component={MyCasesScreen} options={{ title: 'Ügyeim' }} />
      <Stack.Screen name="CaseDetails" component={CaseDetailsScreen} options={{ title: 'Ügy részletei' }} />
      <Stack.Screen name="ProviderSearch" component={ProviderSearchScreen} options={{ title: 'Szolgáltató keresés' }} />
      <Stack.Screen name="ProviderDetails" component={ProviderDetailsScreen} options={{ title: 'Szolgáltató' }} />
      <Stack.Screen name="Booking" component={BookingScreen} options={{ title: 'Időpont foglalás' }} />
    </Stack.Navigator>
  );
}
