import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Modal,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { employeesAPI, UPLOADS_BASE_URL } from '../../services/api';
import LoadingScreen from '../../components/LoadingScreen';
import EmptyState from '../../components/EmptyState';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLUMN_COUNT = 2;
const TILE_GAP = 10;
const TILE_SIZE = (SCREEN_WIDTH - 32 - TILE_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

const DOC_TYPE_COLORS = {
  passport: '#2563eb',
  taj_card: '#16a34a',
  visa: '#f59e0b',
  contract: '#8b5cf6',
  address_card: '#ec4899',
  other: '#64748b',
};

export default function DocumentGalleryScreen({ route, navigation }) {
  const { employeeId, employeeName } = route.params;
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await employeesAPI.getDocuments(employeeId);
      setDocuments(res.data || []);
    } catch {
      Alert.alert('Hiba', 'Nem sikerült betölteni a dokumentumokat.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Refresh when returning from scan screen
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loading) fetchDocuments();
    });
    return unsubscribe;
  }, [navigation, fetchDocuments, loading]);

  const handleDelete = (doc) => {
    Alert.alert(
      'Dokumentum törlése',
      `Biztosan törlöd: ${doc.document_type_label}?`,
      [
        { text: 'Mégse', style: 'cancel' },
        {
          text: 'Törlés',
          style: 'destructive',
          onPress: async () => {
            try {
              await employeesAPI.deleteDocument(doc.id);
              setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
              if (selectedDoc?.id === doc.id) setSelectedDoc(null);
            } catch {
              Alert.alert('Hiba', 'Nem sikerült törölni.');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  const getImageUrl = (doc) => {
    const filePath = doc.thumbnail_path || doc.scanned_file_path || doc.file_path;
    return `${UPLOADS_BASE_URL}${filePath}`;
  };

  const getFullImageUrl = (doc, useOriginal = false) => {
    const filePath = useOriginal ? doc.file_path : (doc.scanned_file_path || doc.file_path);
    return `${UPLOADS_BASE_URL}${filePath}`;
  };

  const renderDocument = ({ item }) => {
    const isImage = item.mime_type?.startsWith('image/');
    const badgeColor = DOC_TYPE_COLORS[item.document_type] || DOC_TYPE_COLORS.other;

    return (
      <TouchableOpacity
        style={styles.tile}
        onPress={() => { if (isImage) { setShowOriginal(false); setSelectedDoc(item); } }}
        activeOpacity={0.8}
      >
        {isImage ? (
          <Image source={{ uri: getImageUrl(item) }} style={styles.tileImage} />
        ) : (
          <View style={styles.tilePdf}>
            <Ionicons name="document-text" size={40} color={colors.textSecondary} />
            <Text style={styles.tilePdfText}>PDF</Text>
          </View>
        )}
        <View style={[styles.typeBadge, { backgroundColor: badgeColor }]}>
          <Text style={styles.typeBadgeText} numberOfLines={1}>
            {item.document_type_label}
          </Text>
        </View>
        <View style={styles.tileInfo}>
          <Text style={styles.tileDate}>{formatDate(item.uploaded_at)}</Text>
          <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>
        {item.notes ? (
          <Text style={styles.tileNotes} numberOfLines={1}>{item.notes}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  if (loading) return <LoadingScreen />;

  return (
    <View style={styles.container}>
      <FlatList
        data={documents}
        renderItem={renderDocument}
        keyExtractor={(item) => String(item.id)}
        numColumns={COLUMN_COUNT}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchDocuments(); }}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            message="Még nincsenek dokumentumok"
          />
        }
        ListHeaderComponent={
          <Text style={styles.headerText}>
            {employeeName} — {documents.length} dokumentum
          </Text>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('DocumentScan', { employeeId, employeeName })}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>

      {/* Fullscreen Image Viewer */}
      {selectedDoc && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSelectedDoc(null)}>
          <View style={styles.modal}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedDoc(null)}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <View style={styles.modalBadgeRow}>
              <View style={[styles.typeBadge, { backgroundColor: DOC_TYPE_COLORS[selectedDoc.document_type] || DOC_TYPE_COLORS.other }]}>
                <Text style={styles.typeBadgeText}>{selectedDoc.document_type_label}</Text>
              </View>
              <Text style={styles.modalDate}>{formatDate(selectedDoc.uploaded_at)}</Text>
            </View>
            {selectedDoc.scanned_file_path && (
              <View style={styles.versionToggle}>
                <TouchableOpacity
                  style={[styles.versionBtn, !showOriginal && styles.versionBtnActive]}
                  onPress={() => setShowOriginal(false)}
                >
                  <Ionicons name="scan" size={14} color={!showOriginal ? '#fff' : 'rgba(255,255,255,0.6)'} />
                  <Text style={[styles.versionBtnText, !showOriginal && styles.versionBtnTextActive]}>Szkennelt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.versionBtn, showOriginal && styles.versionBtnActive]}
                  onPress={() => setShowOriginal(true)}
                >
                  <Ionicons name="image" size={14} color={showOriginal ? '#fff' : 'rgba(255,255,255,0.6)'} />
                  <Text style={[styles.versionBtnText, showOriginal && styles.versionBtnTextActive]}>Eredeti</Text>
                </TouchableOpacity>
              </View>
            )}
            <ScrollView
              contentContainerStyle={styles.modalImageContainer}
              maximumZoomScale={4}
              minimumZoomScale={1}
              bouncesZoom
            >
              <Image
                source={{ uri: getFullImageUrl(selectedDoc, showOriginal) }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            </ScrollView>
            {selectedDoc.notes ? (
              <Text style={styles.modalNotes}>{selectedDoc.notes}</Text>
            ) : null}
            <TouchableOpacity style={styles.modalDeleteBtn} onPress={() => handleDelete(selectedDoc)}>
              <Ionicons name="trash" size={20} color={colors.white} />
              <Text style={styles.modalDeleteText}>Törlés</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, paddingBottom: 80 },
  row: { gap: TILE_GAP },
  headerText: { fontSize: 15, color: colors.textSecondary, marginBottom: 12 },
  // Tile
  tile: {
    width: TILE_SIZE, backgroundColor: colors.white, borderRadius: 12, overflow: 'hidden',
    marginBottom: TILE_GAP,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  tileImage: { width: TILE_SIZE, height: TILE_SIZE * 0.75, backgroundColor: colors.border },
  tilePdf: {
    width: TILE_SIZE, height: TILE_SIZE * 0.75,
    backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center',
  },
  tilePdfText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600', marginTop: 4 },
  typeBadge: {
    position: 'absolute', top: 8, left: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  tileInfo: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4,
  },
  tileDate: { fontSize: 12, color: colors.textSecondary },
  tileNotes: { fontSize: 12, color: colors.textLight, paddingHorizontal: 10, paddingBottom: 8 },
  // FAB
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 5,
  },
  // Modal
  modal: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center',
    paddingTop: 50, paddingBottom: 30,
  },
  modalClose: {
    position: 'absolute', top: 50, right: 16, zIndex: 10,
    padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
  },
  modalBadgeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 10,
  },
  modalDate: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  modalImageContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  modalImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.6 },
  modalNotes: { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', paddingHorizontal: 20, marginTop: 10 },
  // Version toggle (scanned / original)
  versionToggle: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    paddingHorizontal: 16, paddingBottom: 8,
  },
  versionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  versionBtnActive: { backgroundColor: colors.primary },
  versionBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  versionBtnTextActive: { color: '#fff' },
  modalDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.error, alignSelf: 'center',
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, gap: 8, marginTop: 16,
  },
  modalDeleteText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});
