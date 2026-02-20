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
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
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
  const [showCamera, setShowCamera] = useState(false);
  const [imageUri, setImageUri] = useState(null);
  const [documentType, setDocumentType] = useState('other');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const cameraRef = useRef(null);

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
      await processImage(photo.uri);
    } catch (err) {
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
      await processImage(result.assets[0].uri);
    }
  };

  // ---- Process (compress) ----
  const processImage = async (uri) => {
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      setImageUri(manipulated.uri);
    } catch {
      setImageUri(uri);
    }
  };

  // ---- Upload ----
  const handleUpload = async () => {
    if (!imageUri) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      await employeesAPI.uploadDocument(
        employeeId,
        imageUri,
        documentType,
        notes.trim() || null,
        (progress) => setUploadProgress(progress)
      );
      Alert.alert('Sikeres', 'Dokumentum feltöltve!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Hiba', 'Nem sikerült a feltöltés. Próbáld újra.');
    } finally {
      setUploading(false);
    }
  };

  // ---- Camera View ----
  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          autofocus="on"
        >
          <View style={styles.cameraOverlay}>
            <TouchableOpacity
              style={styles.cameraCloseBtn}
              onPress={() => setShowCamera(false)}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <View style={styles.cameraGuide}>
              <View style={styles.cameraGuideRect} />
              <Text style={styles.cameraGuideText}>Igazítsd a dokumentumot a keretbe</Text>
            </View>
            <TouchableOpacity style={styles.captureBtn} onPress={takePicture}>
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  // ---- Main View ----
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>{employeeName}</Text>

      {/* Source Selection */}
      {!imageUri && (
        <View style={styles.sourceSection}>
          <Text style={styles.sectionTitle}>Dokumentum forrása</Text>
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
      )}

      {/* Image Preview */}
      {imageUri && (
        <>
          <View style={styles.previewSection}>
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
            <TouchableOpacity
              style={styles.retakeBtn}
              onPress={() => setImageUri(null)}
            >
              <Ionicons name="refresh" size={18} color={colors.white} />
              <Text style={styles.retakeBtnText}>Új kép</Text>
            </TouchableOpacity>
          </View>

          {/* Document Type */}
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
                    style={[
                      styles.pickerOption,
                      documentType === type.value && styles.pickerOptionActive,
                    ]}
                    onPress={() => {
                      setDocumentType(type.value);
                      setShowTypePicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.pickerOptionText,
                        documentType === type.value && styles.pickerOptionTextActive,
                      ]}
                    >
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Notes */}
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
                  <Ionicons name="cloud-upload" size={20} color={colors.white} />
                  <Text style={styles.uploadBtnText}>Feltöltés</Text>
                </>
              )}
            </TouchableOpacity>

            {uploading && (
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
              </View>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  subtitle: { fontSize: 16, color: colors.textSecondary, marginBottom: 20, textAlign: 'center' },
  // Source selection
  sourceSection: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 16 },
  sourceButtons: { flexDirection: 'row', gap: 16 },
  sourceBtn: { flex: 1, alignItems: 'center', gap: 10 },
  sourceBtnIcon: {
    width: 80, height: 80, borderRadius: 16, justifyContent: 'center', alignItems: 'center',
  },
  sourceBtnText: { fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'center' },
  // Camera
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, justifyContent: 'space-between', padding: 20 },
  cameraCloseBtn: {
    alignSelf: 'flex-start',
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  cameraGuide: { alignItems: 'center' },
  cameraGuideRect: {
    width: '90%', height: 220, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 12, borderStyle: 'dashed',
  },
  cameraGuideText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 10 },
  captureBtn: {
    alignSelf: 'center', width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  captureBtnInner: {
    width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff',
  },
  // Preview
  previewSection: {
    backgroundColor: colors.white, borderRadius: 12, padding: 12, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  preview: { width: '100%', height: 300, borderRadius: 8, backgroundColor: colors.border },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center',
    backgroundColor: colors.textSecondary, paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, gap: 6, marginTop: 12,
  },
  retakeBtnText: { color: colors.white, fontWeight: '600', fontSize: 14 },
  // Form
  formSection: {
    backgroundColor: colors.white, borderRadius: 12, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  formLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
  picker: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14,
    backgroundColor: colors.background,
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
    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16,
    gap: 8, marginTop: 20,
  },
  uploadBtnDisabled: { opacity: 0.7 },
  uploadBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBar: {
    height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 12, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
});
