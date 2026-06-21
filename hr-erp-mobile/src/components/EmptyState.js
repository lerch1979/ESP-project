import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../constants/colors';

export default function EmptyState({ icon = 'document-text-outline', message }) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={48} color={colors.textLight} />
      <Text style={styles.message}>{message || t('common.noData')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  message: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 12,
    textAlign: 'center',
  },
});
