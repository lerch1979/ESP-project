import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Linking,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { documentsAPI, getBaseUrl } from '../../services/api';
import { colors } from '../../constants/colors';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';

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

const API_BASE_URL = getBaseUrl();

function formatFileSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DocumentDetailScreen({ route }) {
  const { id } = route.params;
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchDocument = useCallback(async () => {
    try {
      setError(null);
      const response = await documentsAPI.getById(id);
      setDocument(response.data.document);
    } catch {
      setError('Nem sikerült betölteni az adatokat');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);

  const handleDownload = () => {
    Linking.openURL(`${API_BASE_URL}/documents/${id}/download`);
  };

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={fetchDocument} />;
  if (!document) return null;

  const typeColor = typeColors[document.document_type] || typeColors.other;
  const employeeName = document.employee_last_name
    ? `${document.employee_last_name} ${document.employee_first_name}`
    : '-';
  const uploaderName = document.uploader_last_name
    ? `${document.uploader_last_name} ${document.uploader_first_name}`
    : '-';

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchDocument(); }}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.iconContainer}>
            <Ionicons name="document-text" size={28} color={colors.primary} />
          </View>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + '15' }]}>
            <Text style={[styles.typeBadgeText, { color: typeColor }]}>
              {typeLabels[document.document_type] || document.document_type}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>{document.title}</Text>
        {document.description ? (
          <Text style={styles.description}>{document.description}</Text>
        ) : null}

        <View style={styles.divider} />

        <InfoRow label="Fájlnév" value={document.file_name} />
        <InfoRow label="Méret" value={formatFileSize(document.file_size)} />
        <InfoRow label="Típus" value={typeLabels[document.document_type] || document.document_type} />
        <InfoRow label="Munkavállaló" value={employeeName} />
        <InfoRow label="Feltöltötte" value={uploaderName} />
        <InfoRow label="Feltöltve" value={formatDate(document.created_at)} />
        <InfoRow label="Módosítva" value={formatDate(document.updated_at)} />
      </View>

      <TouchableOpacity style={styles.downloadButton} onPress={handleDownload} activeOpacity={0.7}>
        <Ionicons name="download-outline" size={20} color={colors.white} />
        <Text style={styles.downloadButtonText}>Letöltés</Text>
      </TouchableOpacity>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.white,
    margin: 16,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  downloadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
});
