import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import { colors } from '../../constants/colors';
import { employeesAPI } from '../../services/api';

const DOCUMENT_TYPES = [
  { value: 'passport', label: 'Útlevél' },
  { value: 'taj_card', label: 'TAJ kártya' },
  { value: 'visa', label: 'Vízum' },
  { value: 'contract', label: 'Szerződés' },
  { value: 'address_card', label: 'Lakcímkártya' },
  { value: 'other', label: 'Egyéb' },
];

export default function DocumentScanScreen({ route, navigation }) {
  const { employeeId, employeeName } = route.params;
  const [permission, requestPermission] = useCameraPermissions();

  // Camera
  const [showCamera, setShowCamera] = useState(false);

  // Pages
  const [pages, setPages] = useState([]);
  const [selectedPageIndex, setSelectedPageIndex] = useState(-1);

  // Form
  const [documentType, setDocumentType] = useState('other');
  const [notes, setNotes] = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const cameraRef = useRef(null);

  // ---- Process image (resize/compress) ----
  const processAndAddPage = async (uri) => {
    try {
      const processed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      setPages((prev) => [...prev, { uri: processed.uri, id: Date.now().toString() }]);
    } catch {
      setPages((prev) => [...prev, { uri, id: Date.now().toString() }]);
    }
    setSelectedPageIndex(-1);
  };

  // ---- Camera ----
  const openCamera = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Engedély szükséges', 'A kamera használatához engedély szükséges.');
        return;
      }
    }
    setShowCamera(true);
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      setShowCamera(false);
      await processAndAddPage(photo.uri);
    } catch {
      Alert.alert('Hiba', 'Nem sikerült a fénykép készítése.');
    }
  };

  // ---- Gallery ----
  const openGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      await processAndAddPage(result.assets[0].uri);
    }
  };

  // ---- Page Management ----
  const deletePage = (index) => {
    Alert.alert('Oldal törlése', 'Biztosan törölni szeretnéd ezt az oldalt?', [
      { text: 'Mégse', style: 'cancel' },
      {
        text: 'Törlés', style: 'destructive', onPress: () => {
          setPages((prev) => prev.filter((_, i) => i !== index));
          if (selectedPageIndex === index) setSelectedPageIndex(-1);
          else if (selectedPageIndex > index) setSelectedPageIndex((p) => p - 1);
        },
      },
    ]);
  };

  // ---- Create PDF from pages ----
  const createPdfFromPages = async (pagesArray) => {
    try {
      const pagesBase64 = await Promise.all(
        pagesArray.map(async (page) => {
          const b64 = await FileSystem.readAsStringAsync(page.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          return b64;
        })
      );

      const imagesHtml = pagesBase64.map((b64) =>
        `<div style="page-break-after:always;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:0;">
          <img src="data:image/jpeg;base64,${b64}" style="max-width:100%;max-height:100%;object-fit:contain;" />
        </div>`
      ).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <style>@page{margin:5mm;}body{margin:0;padding:0;}</style>
        </head><body>${imagesHtml}</body></html>`;

      const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
      return uri;
    } catch {
      return null;
    }
  };

  // ---- Upload ----
  const handleUpload = async () => {
    if (pages.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      if (pages.length > 1) {
        // Multi-page: create PDF then upload
        setUploadProgress(5);
        const pdfUri = await createPdfFromPages(pages);

        if (pdfUri) {
          await employeesAPI.uploadDocument(
            employeeId, pdfUri, documentType, notes.trim() || null,
            (progress) => setUploadProgress(5 + Math.round(progress * 0.95))
          );
        } else {
          // Fallback: upload pages individually
          for (let i = 0; i < pages.length; i++) {
            const pageNotes = `${notes.trim() ? notes.trim() + ' - ' : ''}Oldal ${i + 1}/${pages.length}`;
            await employeesAPI.uploadDocument(
              employeeId, pages[i].uri, documentType, pageNotes,
              (progress) => setUploadProgress(Math.round(((i + progress / 100) / pages.length) * 100))
            );
          }
        }
      } else {
        // Single page
        await employeesAPI.uploadDocument(
          employeeId, pages[0].uri, documentType, notes.trim() || null,
          (progress) => setUploadProgress(progress)
        );
      }

      Alert.alert('Sikeres', 'Dokumentum feltöltve!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Hiba', 'Nem sikerült a feltöltés. Próbáld újra.');
    } finally {
      setUploading(false);
    }
  };

  // ---- Camera View ----
  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" autofocus="on">
          <View style={styles.cameraOverlay}>
            <View style={styles.cameraTopBar}>
              <TouchableOpacity style={styles.cameraCloseBtn} onPress={() => setShowCamera(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.cameraGuide}>
              <View style={styles.cameraGuideRect} />
              <Text style={styles.cameraGuideText}>Igazítsd a dokumentumot a keretbe</Text>
            </View>
            <View style={styles.cameraBottomBar}>
              {pages.length > 0 && (
                <View style={styles.pageCountCameraBadge}>
                  <Ionicons name="documents" size={14} color="#fff" />
                  <Text style={styles.pageCountCameraText}>{pages.length} oldal</Text>
                </View>
              )}
              <TouchableOpacity style={styles.captureBtn} onPress={takePicture}>
                <View style={styles.captureBtnInner} />
              </TouchableOpacity>
              <View style={{ width: 60 }} />
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  // ---- Main View ----
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>{employeeName}</Text>

      {/* Auto scan info */}
      <View style={styles.modeSection}>
        <View style={styles.modeInfo}>
          <Ionicons name="scan" size={20} color={colors.primary} />
          <Text style={[styles.modeLabel, styles.modeLabelActive]}>Automatikus scan</Text>
        </View>
        <Text style={styles.modeDescription}>
          A szerver automatikusan létrehozza a szkennelt verziót (fekete-fehér, magas kontraszt, élesítés)
        </Text>
      </View>

      {/* Page Counter */}
      {pages.length > 0 && (
        <View style={styles.pageCountSection}>
          <Ionicons name="documents" size={18} color={colors.primary} />
          <Text style={styles.pageCountText}>{pages.length} oldal</Text>
        </View>
      )}

      {/* Page Thumbnails */}
      {pages.length > 0 && (
        <View style={styles.thumbnailSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnailScroll}>
            {pages.map((page, index) => (
              <TouchableOpacity
                key={page.id}
                style={[styles.thumbnail, selectedPageIndex === index && styles.thumbnailSelected]}
                onPress={() => setSelectedPageIndex(selectedPageIndex === index ? -1 : index)}
              >
                <Image source={{ uri: page.uri }} style={styles.thumbnailImage} />
                <View style={styles.thumbnailBadge}>
                  <Text style={styles.thumbnailBadgeText}>{index + 1}</Text>
                </View>
                <TouchableOpacity
                  style={styles.thumbnailDelete}
                  onPress={() => deletePage(index)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color={colors.error} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Selected Page Preview */}
      {selectedPageIndex >= 0 && selectedPageIndex < pages.length && (
        <View style={styles.previewSection}>
          <Image
            source={{ uri: pages[selectedPageIndex].uri }}
            style={styles.preview}
            resizeMode="contain"
          />
          <Text style={styles.previewPageLabel}>
            {selectedPageIndex + 1}/{pages.length} oldal
          </Text>
        </View>
      )}

      {/* Source Selection */}
      <View style={styles.sourceSection}>
        <Text style={styles.sectionTitle}>
          {pages.length > 0 ? 'Oldal hozzáadása' : 'Dokumentum forrása'}
        </Text>
        <View style={styles.sourceButtons}>
          <TouchableOpacity style={styles.sourceBtn} onPress={openCamera}>
            <View style={[styles.sourceBtnIcon, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="camera" size={32} color={colors.primary} />
            </View>
            <Text style={styles.sourceBtnText}>Fénykép készítése</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sourceBtn} onPress={openGallery}>
            <View style={[styles.sourceBtnIcon, { backgroundColor: colors.info + '15' }]}>
              <Ionicons name="images" size={32} color={colors.info} />
            </View>
            <Text style={styles.sourceBtnText}>Galéria választás</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Upload Form */}
      {pages.length > 0 && (
        <View style={styles.formSection}>
          <Text style={styles.formLabel}>Dokumentum típusa</Text>
          <TouchableOpacity
            style={styles.picker}
            onPress={() => setShowTypePicker(!showTypePicker)}
          >
            <Text style={styles.pickerText}>
              {DOCUMENT_TYPES.find((t) => t.value === documentType)?.label || 'Válassz...'}
            </Text>
            <Ionicons
              name={showTypePicker ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
          {showTypePicker && (
            <View style={styles.pickerDropdown}>
              {DOCUMENT_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[styles.pickerOption, documentType === type.value && styles.pickerOptionActive]}
                  onPress={() => { setDocumentType(type.value); setShowTypePicker(false); }}
                >
                  <Text
                    style={[styles.pickerOptionText, documentType === type.value && styles.pickerOptionTextActive]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={[styles.formLabel, { marginTop: 16 }]}>Megjegyzés (opcionális)</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Pl. elülső oldal, másolat..."
            placeholderTextColor={colors.textLight}
            multiline
            numberOfLines={2}
          />

          {/* Upload Button */}
          <TouchableOpacity
            style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
            onPress={handleUpload}
            disabled={uploading}
          >
            {uploading ? (
              <View style={styles.uploadingRow}>
                <ActivityIndicator size="small" color={colors.white} />
                <Text style={styles.uploadBtnText}>Feltöltés... {uploadProgress}%</Text>
              </View>
            ) : (
              <>
                <Ionicons
                  name={pages.length > 1 ? 'document' : 'cloud-upload'}
                  size={20}
                  color={colors.white}
                />
                <Text style={styles.uploadBtnText}>
                  {pages.length > 1 ? `Befejezés (${pages.length} oldal)` : 'Feltöltés'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {uploading && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
            </View>
          )}

          {!uploading && (
            <View style={styles.infoNote}>
              <Ionicons name="scan-outline" size={15} color={colors.primary} />
              <Text style={styles.infoNoteText}>A szerver automatikusan létrehozza a szkennelt verziót</Text>
            </View>
          )}

          {pages.length > 1 && !uploading && (
            <View style={styles.infoNote}>
              <Ionicons name="information-circle-outline" size={15} color={colors.textLight} />
              <Text style={styles.infoNoteText}>Több oldal esetén PDF dokumentum készül</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  subtitle: { fontSize: 16, color: colors.textSecondary, marginBottom: 16, textAlign: 'center' },

  // Auto scan info
  modeSection: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  modeInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modeLabel: { fontSize: 16, fontWeight: '600', color: colors.textLight },
  modeLabelActive: { color: colors.primary },
  modeDescription: { fontSize: 13, color: colors.textSecondary, marginTop: 8, lineHeight: 18 },

  // Page counter
  pageCountSection: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 4,
  },
  pageCountText: { fontSize: 15, fontWeight: '600', color: colors.primary },

  // Thumbnails
  thumbnailSection: { marginBottom: 12 },
  thumbnailScroll: { gap: 10, paddingVertical: 4 },
  thumbnail: {
    width: 72, height: 96, borderRadius: 8, borderWidth: 2,
    borderColor: colors.border, overflow: 'hidden', backgroundColor: colors.white,
  },
  thumbnailSelected: { borderColor: colors.primary },
  thumbnailImage: { width: '100%', height: '100%' },
  thumbnailBadge: {
    position: 'absolute', bottom: 2, left: 2,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  thumbnailBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  thumbnailDelete: {
    position: 'absolute', top: -2, right: -2,
    backgroundColor: colors.white, borderRadius: 10,
  },

  // Source selection
  sourceSection: {
    backgroundColor: colors.white, borderRadius: 12, padding: 20, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 16 },
  sourceButtons: { flexDirection: 'row', gap: 16 },
  sourceBtn: { flex: 1, alignItems: 'center', gap: 10 },
  sourceBtnIcon: { width: 80, height: 80, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  sourceBtnText: { fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'center' },

  // Camera
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, justifyContent: 'space-between', padding: 20 },
  cameraTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cameraCloseBtn: { padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  cameraGuide: { alignItems: 'center' },
  cameraGuideRect: {
    width: '90%', height: 220, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 12, borderStyle: 'dashed',
  },
  cameraGuideText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 10 },
  cameraBottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pageCountCameraBadge: {
    position: 'absolute', left: 0, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
  },
  pageCountCameraText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  captureBtnInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },

  // Preview
  previewSection: {
    backgroundColor: colors.white, borderRadius: 12, padding: 12, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  preview: { width: '100%', height: 300, borderRadius: 8, backgroundColor: '#f0f0f0' },
  previewPageLabel: { textAlign: 'center', fontSize: 13, color: colors.textSecondary, marginTop: 8, fontWeight: '600' },

  // Form
  formSection: {
    backgroundColor: colors.white, borderRadius: 12, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  formLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
  picker: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, backgroundColor: colors.background,
  },
  pickerText: { fontSize: 15, color: colors.text },
  pickerDropdown: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, marginTop: 4,
    backgroundColor: colors.white, overflow: 'hidden',
  },
  pickerOption: { padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerOptionActive: { backgroundColor: colors.primary + '12' },
  pickerOptionText: { fontSize: 15, color: colors.text },
  pickerOptionTextActive: { color: colors.primary, fontWeight: '600' },
  notesInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14,
    backgroundColor: colors.background, fontSize: 15, color: colors.text,
    minHeight: 60, textAlignVertical: 'top',
  },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, gap: 8, marginTop: 20,
  },
  uploadBtnDisabled: { opacity: 0.7 },
  uploadBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBar: { height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  infoNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 4,
  },
  infoNoteText: { fontSize: 13, color: colors.textLight, flex: 1 },
});
