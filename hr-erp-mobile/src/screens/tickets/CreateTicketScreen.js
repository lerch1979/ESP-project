import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useTranslation } from 'react-i18next';
import { ticketsAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import LoadingScreen from '../../components/LoadingScreen';

const MAX_PHOTOS = 3;

// Resize to 1600px wide + 0.8 JPEG — keeps uploads small on mobile data.
async function compressPhoto(uri) {
  const r = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );
  return r.uri;
}

export default function CreateTicketScreen({ navigation }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [priorityId, setPriorityId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [photos, setPhotos] = useState([]);

  const addPhoto = async (fromCamera) => {
    if (photos.length >= MAX_PHOTOS) return;
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert(t('common.error'), t('attach.permission')); return; }
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });
      if (res.canceled) return;
      const uri = res.assets?.[0]?.uri;
      if (!uri) return;
      const compressed = await compressPhoto(uri);
      setPhotos((p) => [...p, compressed].slice(0, MAX_PHOTOS));
    } catch { /* ignore picker errors */ }
  };

  const pickPhoto = () => {
    Alert.alert(t('attach.add'), undefined, [
      { text: t('attach.camera'), onPress: () => addPhoto(true) },
      { text: t('attach.gallery'), onPress: () => addPhoto(false) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [catRes, priRes] = await Promise.all([
          ticketsAPI.getCategories(),
          ticketsAPI.getPriorities(),
        ]);
        setCategories(catRes.data.categories || []);
        setPriorities(priRes.data.priorities || []);
      } catch {
        Alert.alert(t('common.error'), t('ticketForm.loadError'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSubmit = async () => {
    const nextErrors = {};
    if (!title.trim()) nextErrors.title = t('ticketForm.titleRequired');
    if (!categoryId) nextErrors.category = t('ticketForm.categoryRequired');
    if (!priorityId) nextErrors.priority = t('ticketForm.priorityRequired');

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      Alert.alert(t('ticketForm.missingData'), Object.values(nextErrors).join('\n'));
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const created = await ticketsAPI.create({
        title: title.trim(),
        description: description.trim(),
        category_id: categoryId,
        priority_id: priorityId,
      });
      // Upload photos sequentially. A failure on one does NOT lose the ticket
      // or the others — we report the honest uploaded count.
      const ticketId = created?.data?.ticket?.id;
      let ok = 0;
      if (ticketId && photos.length > 0) {
        for (const uri of photos) {
          try { await ticketsAPI.uploadMyAttachment(ticketId, uri); ok += 1; } catch { /* keep going */ }
        }
      }
      const msg = photos.length > 0
        ? `${t('ticketForm.success')}\n${t('attach.uploaded', { ok, total: photos.length })}`
        : t('ticketForm.success');
      Alert.alert(t('common.success'), msg, [
        { text: t('common.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      const message = err.response?.data?.message || t('ticketForm.createError');
      Alert.alert(t('common.error'), message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.label}>{t('ticketForm.title')} *</Text>
          <TextInput
            style={[styles.input, errors.title && styles.inputError]}
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              if (errors.title) setErrors((e) => ({ ...e, title: null }));
            }}
            placeholder={t('ticketForm.titlePlaceholder')}
            placeholderTextColor={colors.textLight}
          />
          {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}

          <Text style={styles.label}>{t('ticketForm.description')}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('ticketForm.descriptionPlaceholder')}
            placeholderTextColor={colors.textLight}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <Text style={styles.label}>{t('ticketForm.category')} *</Text>
          <View style={[styles.optionGroup, errors.category && styles.optionGroupError]}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.optionButton, categoryId === cat.id && styles.optionButtonSelected]}
                onPress={() => {
                  setCategoryId(cat.id);
                  if (errors.category) setErrors((e) => ({ ...e, category: null }));
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.optionText, categoryId === cat.id && styles.optionTextSelected]}
                >
                  {t(`category.${cat.slug}`, { defaultValue: cat.name })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}

          <Text style={styles.label}>{t('ticketForm.priority')} *</Text>
          <View style={[styles.optionGroup, errors.priority && styles.optionGroupError]}>
            {priorities.map((pri) => (
              <TouchableOpacity
                key={pri.id}
                style={[styles.optionButton, priorityId === pri.id && styles.optionButtonSelected]}
                onPress={() => {
                  setPriorityId(pri.id);
                  if (errors.priority) setErrors((e) => ({ ...e, priority: null }));
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.optionText, priorityId === pri.id && styles.optionTextSelected]}
                >
                  {t(`priority.${pri.slug}`, { defaultValue: pri.name })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.priority && <Text style={styles.errorText}>{errors.priority}</Text>}

          <Text style={styles.label}>{t('attach.photos')}</Text>
          <View style={styles.photoRow}>
            {photos.map((uri, i) => (
              <View key={i} style={styles.photoWrap}>
                <Image source={{ uri }} style={styles.photoThumb} />
                <TouchableOpacity
                  style={styles.photoRemove}
                  onPress={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                >
                  <Ionicons name="close" size={14} color={colors.white} />
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <TouchableOpacity style={styles.photoAdd} onPress={pickPhoto} activeOpacity={0.7}>
                <Ionicons name="camera-outline" size={26} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.photoHint}>{t('attach.max')}</Text>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>{t('ticketForm.submit')}</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.white,
    margin: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: {
    borderColor: colors.error,
    borderWidth: 1.5,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginTop: 4,
  },
  textArea: {
    minHeight: 100,
  },
  optionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionGroupError: {
    borderWidth: 1.5,
    borderColor: colors.error,
    borderRadius: 8,
    padding: 6,
  },
  optionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  optionTextSelected: {
    color: colors.white,
  },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  photoWrap: { position: 'relative' },
  photoThumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: colors.background },
  photoRemove: {
    position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center',
  },
  photoAdd: {
    width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background,
  },
  photoHint: { fontSize: 12, color: colors.textLight, marginTop: 6 },
  submitButton: {
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
