import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MoreMenuScreen from '../screens/more/MoreMenuScreen';
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
    </Stack.Navigator>
  );
}
