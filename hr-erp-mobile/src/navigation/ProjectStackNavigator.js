import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProjectListScreen from '../screens/projects/ProjectListScreen';
import ProjectDetailScreen from '../screens/projects/ProjectDetailScreen';
import TaskDetailScreen from '../screens/projects/TaskDetailScreen';
import { colors } from '../constants/colors';

const Stack = createNativeStackNavigator();

export default function ProjectStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="ProjectList" component={ProjectListScreen} options={{ title: 'Projektek' }} />
      <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} options={{ title: 'Projekt' }} />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Feladat' }} />
    </Stack.Navigator>
  );
}
