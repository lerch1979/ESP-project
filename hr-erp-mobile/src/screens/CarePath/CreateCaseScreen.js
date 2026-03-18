import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Switch, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import carepathAPI from '../../services/carepath/api';
import UrgencyBadge from '../../components/CarePath/UrgencyBadge';

const URGENCY_OPTIONS = ['low', 'medium', 'high', 'crisis'];
const URGENCY_LABELS = { low: 'Alacsony', medium: 'Közepes', high: 'Magas', crisis: 'Krízis' };

export default function CreateCaseScreen({ navigation, route }) {
  const preselectedCategoryId = route.params?.categoryId;
  const preselectedCategoryName = route.params?.categoryName;

  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(preselectedCategoryId || null);
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState('medium');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(!preselectedCategoryId);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!preselectedCategoryId) {
      (async () => {
        try {
          const response = await carepathAPI.categories.getAll();
          setCategories(response.data || []);
        } catch { /* silent */ }
        finally { setLoading(false); }
      })();
    }
  }, []);

  const handleSubmit = async () => {
    if (!categoryId) { Alert.alert('Hiányzó adat', 'Válassz kategóriát!'); return; }
    if (!description.trim()) { Alert.alert('Hiányzó adat', 'Írd le a problémát!'); return; }

    if (urgency === 'crisis') {
      Alert.alert(
        'Krízis figyelmeztetés',
        'Krízis szintű ügy esetén azonnali értesítést küldünk. Folytatod?',
        [
          { text: 'Mégse', style: 'cancel' },
          { text: 'Igen, folytatom', onPress: submitCase },
        ]
      );
    } else {
      submitCase();
    }
  };

  const submitCase = async () => {
    setSubmitting(true);
    try {
      const result = await carepathAPI.cases.create({
        service_category_id: categoryId,
        issue_description: description.trim(),
        urgency_level: urgency,
        is_anonymous: isAnonymous,
      });
      const caseData = result.data?.case;
      const matchedProviders = result.data?.matched_providers?.length || 0;
      Alert.alert(
        'Ügy létrehozva!',
        `Ügyszám: ${caseData?.case_number || 'N/A'}\n${matchedProviders > 0 ? `${matchedProviders} szolgáltató ajánlva.` : ''}`,
        [{ text: 'OK', onPress: () => navigation.navigate('MyCases') }]
      );
    } catch (err) {
      Alert.alert('Hiba', err.response?.data?.message || 'Nem sikerült létrehozni az ügyet.');
    } finally { setSubmitting(false); }
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Új ügy indítása</Text>

      {/* Category */}
      <Text style={styles.label}>Kategória *</Text>
      {preselectedCategoryName ? (
        <View style={styles.preselected}>
          <Text style={styles.preselectedText}>{preselectedCategoryName}</Text>
          <TouchableOpacity onPress={() => { setCategoryId(null); navigation.setParams({ categoryId: null, categoryName: null }); }}>
            <Ionicons name="close-circle" size={20} color={colors.textLight} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.categoryGrid}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryChip, categoryId === cat.id && styles.categoryChipActive]}
              onPress={() => setCategoryId(cat.id)}
            >
              <Text style={[styles.categoryChipText, categoryId === cat.id && styles.categoryChipTextActive]}>
                {cat.category_name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Description */}
      <Text style={styles.label}>Probléma leírása *</Text>
      <TextInput
        style={styles.textarea}
        value={description}
        onChangeText={(t) => setDescription(t.slice(0, 500))}
        placeholder="Írd le, miben segíthetünk..."
        placeholderTextColor={colors.textLight}
        multiline
        numberOfLines={5}
      />
      <Text style={styles.charCount}>{description.length}/500</Text>

      {/* Urgency */}
      <Text style={styles.label}>Sürgősség</Text>
      <View style={styles.urgencyRow}>
        {URGENCY_OPTIONS.map((u) => (
          <TouchableOpacity
            key={u}
            style={[styles.urgencyOption, urgency === u && styles.urgencyOptionActive]}
            onPress={() => setUrgency(u)}
          >
            <UrgencyBadge level={u} />
          </TouchableOpacity>
        ))}
      </View>
      {urgency === 'crisis' && (
        <View style={styles.crisisWarning}>
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={styles.crisisText}>Krízis esetén azonnali értesítést küldünk a HR csapatnak.</Text>
        </View>
      )}

      {/* Anonymous */}
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>Anonim ügy</Text>
          <Text style={styles.switchDesc}>Az adataid nem jelennek meg a szolgáltató számára.</Text>
        </View>
        <Switch value={isAnonymous} onValueChange={setIsAnonymous} trackColor={{ true: colors.primary }} />
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, (!categoryId || !description.trim() || submitting) && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!categoryId || !description.trim() || submitting}
      >
        {submitting ? <ActivityIndicator color={colors.white} /> : (
          <>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.white} />
            <Text style={styles.submitText}>Ügy beküldése</Text>
          </>
        )}
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8, marginTop: 16 },
  preselected: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primary + '10', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.primary + '30',
  },
  preselectedText: { fontSize: 15, fontWeight: '500', color: colors.primary },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { fontSize: 13, color: colors.text, fontWeight: '500' },
  categoryChipTextActive: { color: colors.white },
  textarea: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 14, fontSize: 14, color: colors.text, minHeight: 120, textAlignVertical: 'top',
  },
  charCount: { fontSize: 12, color: colors.textLight, textAlign: 'right', marginTop: 4 },
  urgencyRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  urgencyOption: { padding: 4, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  urgencyOptionActive: { borderColor: colors.primary, backgroundColor: colors.primary + '08' },
  crisisWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
    padding: 10, backgroundColor: colors.errorLight, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: colors.error,
  },
  crisisText: { fontSize: 12, color: colors.error, flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  switchLabel: { fontSize: 15, fontWeight: '500', color: colors.text },
  switchDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  submitBtn: {
    flexDirection: 'row', gap: 8, backgroundColor: '#2196F3', padding: 16, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: colors.white, fontSize: 16, fontWeight: '600' },
});
