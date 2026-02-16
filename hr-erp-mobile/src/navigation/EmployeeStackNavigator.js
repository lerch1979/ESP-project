import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import EmployeeListScreen from '../screens/employees/EmployeeListScreen';
import EmployeeDetailScreen from '../screens/employees/EmployeeDetailScreen';
import { colors } from '../constants/colors';

const Stack = createNativeStackNavigator();

export default function EmployeeStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="EmployeeList" component={EmployeeListScreen} options={{ title: 'Munkavállalók' }} />
      <Stack.Screen name="EmployeeDetail" component={EmployeeDetailScreen} options={{ title: 'Munkavállaló' }} />
    </Stack.Navigator>
  );
}
