import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';

const typeLabels = {
  contract: 'Szerződés',
  certificate: 'Bizonyítvány',
  id_card: 'Igazolvány',
  medical: 'Orvosi',
  permit: 'Engedély',
  policy: 'Szabályzat',
  template: 'Sablon',
  other: 'Egyéb',
};

const typeColors = {
  contract: '#2563eb',
  certificate: '#7c3aed',
  id_card: '#0891b2',
  medical: '#dc2626',
  permit: '#ea580c',
  policy: '#4f46e5',
  template: '#0d9488',
  other: '#64748b',
};

function formatFileSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentCard({ document, onPress }) {
  const typeColor = typeColors[document.document_type] || typeColors.other;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconContainer}>
        <Ionicons name="document-text" size={22} color={colors.primary} />
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{document.title}</Text>
        <Text style={styles.fileName} numberOfLines={1}>{document.file_name}</Text>
        <View style={styles.meta}>
          <Text style={[styles.type, { color: typeColor }]}>
            {typeLabels[document.document_type] || document.document_type}
          </Text>
          <Text style={styles.size}>{formatFileSize(document.file_size)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  fileName: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 1,
  },
  meta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  type: {
    fontSize: 12,
    fontWeight: '600',
  },
  size: {
    fontSize: 12,
    color: colors.textLight,
  },
});
