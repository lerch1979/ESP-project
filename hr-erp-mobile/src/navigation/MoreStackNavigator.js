import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MoreMenuScreen from '../screens/more/MoreMenuScreen';
import CalendarScreen from '../screens/CalendarScreen';
import AccommodationListScreen from '../screens/more/AccommodationListScreen';
import AccommodationDetailScreen from '../screens/more/AccommodationDetailScreen';
import DocumentListScreen from '../screens/more/DocumentListScreen';
import DocumentDetailScreen from '../screens/more/DocumentDetailScreen';
import ProfileScreen from '../screens/more/ProfileScreen';
import GoogleCalendarScreen from '../screens/more/GoogleCalendarScreen';
import VideoListScreen from '../screens/more/VideoListScreen';
import VideoDetailScreen from '../screens/more/VideoDetailScreen';
import ChatbotConversationListScreen from '../screens/chatbot/ChatbotConversationListScreen';
import ChatbotChatScreen from '../screens/chatbot/ChatbotChatScreen';
import ChatbotFaqScreen from '../screens/chatbot/ChatbotFaqScreen';
import FAQScreen from '../screens/faq/FAQScreen';
import ProjectListScreen from '../screens/projects/ProjectListScreen';
import ProjectDetailScreen from '../screens/projects/ProjectDetailScreen';
import TaskListScreen from '../screens/projects/TaskListScreen';
import TaskDetailScreen from '../screens/projects/TaskDetailScreen';
import InvoiceListScreen from '../screens/invoices/InvoiceListScreen';
import InvoiceDetailScreen from '../screens/invoices/InvoiceDetailScreen';
import WellMindDashboard from '../screens/WellMind/WellMindDashboard';
import DailyPulseScreen from '../screens/WellMind/DailyPulseScreen';
import PulseHistoryScreen from '../screens/WellMind/PulseHistoryScreen';
import AssessmentScreen from '../screens/WellMind/AssessmentScreen';
import AssessmentResultsScreen from '../screens/WellMind/AssessmentResultsScreen';
import InterventionsScreen from '../screens/WellMind/InterventionsScreen';
import CoachingSessionsScreen from '../screens/WellMind/CoachingSessionsScreen';
import CarePathDashboard from '../screens/CarePath/CarePathDashboard';
import ServiceCategoriesScreen from '../screens/CarePath/ServiceCategoriesScreen';
import CreateCaseScreen from '../screens/CarePath/CreateCaseScreen';
import MyCasesScreen from '../screens/CarePath/MyCasesScreen';
import CaseDetailsScreen from '../screens/CarePath/CaseDetailsScreen';
import ProviderSearchScreen from '../screens/CarePath/ProviderSearchScreen';
import ProviderDetailsScreen from '../screens/CarePath/ProviderDetailsScreen';
import BookingScreen from '../screens/CarePath/BookingScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import BadgeCollectionScreen from '../screens/Gamification/BadgeCollectionScreen';
import LeaderboardScreen from '../screens/Gamification/LeaderboardScreen';
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
      <Stack.Screen name="MoreMenu" component={MoreMenuScreen} options={{ title: 'Tovabbiak' }} />
      <Stack.Screen name="Calendar" component={CalendarScreen} options={{ title: 'Naptar' }} />
      <Stack.Screen name="AccommodationList" component={AccommodationListScreen} options={{ title: 'Szálláshelyek' }} />
      <Stack.Screen name="AccommodationDetail" component={AccommodationDetailScreen} options={{ title: 'Szálláshely' }} />
      <Stack.Screen name="DocumentList" component={DocumentListScreen} options={{ title: 'Dokumentumok' }} />
      <Stack.Screen name="DocumentDetail" component={DocumentDetailScreen} options={{ title: 'Dokumentum' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
      <Stack.Screen name="GoogleCalendar" component={GoogleCalendarScreen} options={{ title: 'Google Naptár' }} />
      <Stack.Screen name="VideoList" component={VideoListScreen} options={{ title: 'Videók' }} />
      <Stack.Screen name="VideoDetail" component={VideoDetailScreen} options={{ title: 'Videó' }} />
      <Stack.Screen name="ChatbotList" component={ChatbotConversationListScreen} options={{ title: 'Chatbot' }} />
      <Stack.Screen name="ChatbotChat" component={ChatbotChatScreen} options={{ title: 'Chatbot Asszisztens' }} />
      <Stack.Screen name="ChatbotFaq" component={ChatbotFaqScreen} options={{ title: 'GYIK' }} />
      <Stack.Screen name="FAQ" component={FAQScreen} options={{ title: 'FAQ / GYIK' }} />
      <Stack.Screen name="Projects" component={ProjectListScreen} options={{ title: 'Projektek' }} />
      <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} options={{ title: 'Projekt' }} />
      <Stack.Screen name="MyTasks" component={TaskListScreen} options={{ title: 'Feladataim' }} />
      <Stack.Screen name="MyTaskDetail" component={TaskDetailScreen} options={{ title: 'Feladat' }} />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Feladat' }} />
      <Stack.Screen name="InvoiceList" component={InvoiceListScreen} options={{ title: 'Számlák' }} />
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ title: 'Számla' }} />
      <Stack.Screen name="WellMindDashboard" component={WellMindDashboard} options={{ title: 'WellMind' }} />
      <Stack.Screen name="DailyPulse" component={DailyPulseScreen} options={{ title: 'Napi hangulat' }} />
      <Stack.Screen name="PulseHistory" component={PulseHistoryScreen} options={{ title: 'Hangulat előzmények' }} />
      <Stack.Screen name="Assessment" component={AssessmentScreen} options={{ title: 'Felmérés' }} />
      <Stack.Screen name="AssessmentResults" component={AssessmentResultsScreen} options={{ title: 'Felmérés eredmények' }} />
      <Stack.Screen name="Interventions" component={InterventionsScreen} options={{ title: 'Beavatkozások' }} />
      <Stack.Screen name="CoachingSessions" component={CoachingSessionsScreen} options={{ title: 'Coaching' }} />
      <Stack.Screen name="CarePathDashboard" component={CarePathDashboard} options={{ title: 'CarePath' }} />
      <Stack.Screen name="ServiceCategories" component={ServiceCategoriesScreen} options={{ title: 'Szolgáltatások' }} />
      <Stack.Screen name="CreateCase" component={CreateCaseScreen} options={{ title: 'Új ügy' }} />
      <Stack.Screen name="MyCases" component={MyCasesScreen} options={{ title: 'Ügyeim' }} />
      <Stack.Screen name="CaseDetails" component={CaseDetailsScreen} options={{ title: 'Ügy részletei' }} />
      <Stack.Screen name="ProviderSearch" component={ProviderSearchScreen} options={{ title: 'Szolgáltató keresés' }} />
      <Stack.Screen name="ProviderDetails" component={ProviderDetailsScreen} options={{ title: 'Szolgáltató' }} />
      <Stack.Screen name="Booking" component={BookingScreen} options={{ title: 'Időpont foglalás' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Értesítések' }} />
      <Stack.Screen name="BadgeCollection" component={BadgeCollectionScreen} options={{ title: 'Jelvények' }} />
      <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: 'Ranglista' }} />
    </Stack.Navigator>
  );
}
