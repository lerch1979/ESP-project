import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ChatbotChatScreen from '../screens/chatbot/ChatbotChatScreen';
import ChatbotConversationListScreen from '../screens/chatbot/ChatbotConversationListScreen';
import ChatbotFaqScreen from '../screens/chatbot/ChatbotFaqScreen';
import { colors } from '../constants/colors';

const Stack = createNativeStackNavigator();

export default function ChatbotStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="ChatbotChat"
        component={ChatbotChatScreen}
        options={{ title: 'Chatbot Asszisztens' }}
      />
      <Stack.Screen
        name="ChatbotHistory"
        component={ChatbotConversationListScreen}
        options={{ title: 'Korabbi beszelgetesek' }}
      />
      <Stack.Screen
        name="ChatbotFaq"
        component={ChatbotFaqScreen}
        options={{ title: 'GYIK' }}
      />
    </Stack.Navigator>
  );
}
