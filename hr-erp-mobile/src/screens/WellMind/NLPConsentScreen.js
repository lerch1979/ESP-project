import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../constants/colors';
import wellmindAPI from '../../services/wellmind/api';

export default function NLPConsentScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchConsent = useCallback(async () => {
    try {
      const response = await wellmindAPI.nlpConsent.get();
      setData(response.data);
    } catch {
      // Feature may not be enabled
      setData({ feature_enabled: false, consent: { consented: false } });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); fetchConsent(); }, [fetchConsent]));

  const handleConsent = async (consented) => {
    if (!consented) {
      Alert.alert(
        'Visszavonás megerősítése',
        'Biztosan visszavonod a hozzájárulást? A megjegyzéseid nem lesznek elemezve.',
        [
          { text: 'Mégse', style: 'cancel' },
          { text: 'Visszavonás', style: 'destructive', onPress: () => submitConsent(false) },
        ]
      );
    } else {
      submitConsent(true);
    }
  };

  const submitConsent = async (consented) => {
    setSubmitting(true);
    try {
      const response = await wellmindAPI.nlpConsent.update(consented);
      setData(prev => ({ ...prev, consent: response.data }));
    } catch {
      Alert.alert('Hiba', 'Nem sikerült a hozzájárulás módosítása.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  if (!data?.feature_enabled) {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.textLight} />
        <Text style={styles.disabledText}>Az AI hangulatelemzés jelenleg nem elérhető.</Text>
        <Text style={styles.disabledSubtext}>A munkáltatód még nem aktiválta ezt a funkciót.</Text>
      </View>
    );
  }

  const consented = data?.consent?.consented || false;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.iconWrap}>
        <Ionicons name="sparkles" size={48} color={colors.primary} />
      </View>
      <Text style={styles.title}>AI Támogatás</Text>
      <Text style={styles.subtitle}>Opcionális hangulatelemzés</Text>

      {/* Info Cards */}
      <View style={styles.card}>
        <Ionicons name="shield-checkmark-outline" size={24} color={colors.success} />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Mire használjuk?</Text>
          <Text style={styles.cardDesc}>
            A pulzus felmérés megjegyzéseidet AI segítségével elemezzük, hogy gyorsabb és
            célzottabb támogatást tudjunk nyújtani neked.
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Ionicons name="people-outline" size={24} color={colors.info} />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Ki látja az eredményt?</Text>
          <Text style={styles.cardDesc}>
            Az AI NEM dönt rólad! Az elemzés csak arra szolgál, hogy HR szakember gyorsabban
            észrevegye, ha támogatásra van szükséged. Mindig emberi értékelés történik.
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Ionicons name="lock-closed-outline" size={24} color={colors.warning} />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Adatvédelem</Text>
          <Text style={styles.cardDesc}>
            A megjegyzéseid titkosítva vannak. Bármikor visszavonhatod a hozzájárulást,
            és az elemzés azonnal leáll.
          </Text>
        </View>
      </View>

      {/* Current Status */}
      <View style={[styles.statusCard, consented ? styles.statusActive : styles.statusInactive]}>
        <Ionicons
          name={consented ? 'checkmark-circle' : 'close-circle'}
          size={24}
          color={consented ? colors.success : colors.textSecondary}
        />
        <Text style={[styles.statusText, consented && styles.statusTextActive]}>
          {consented ? 'Hozzájárulás megadva' : 'Hozzájárulás nincs megadva'}
        </Text>
        {consented && data?.consent?.consent_date && (
          <Text style={styles.statusDate}>
            {new Date(data.consent.consent_date).toLocaleDateString('hu-HU')}
          </Text>
        )}
      </View>

      {/* Action Button */}
      <TouchableOpacity
        style={[styles.button, consented ? styles.buttonDanger : styles.buttonPrimary]}
        onPress={() => handleConsent(!consented)}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.buttonText}>
            {consented ? 'Hozzájárulás visszavonása' : 'Hozzájárulás megadása'}
          </Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  disabledText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, marginTop: 16, textAlign: 'center' },
  disabledSubtext: { fontSize: 13, color: colors.textLight, marginTop: 8, textAlign: 'center' },
  iconWrap: { alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 24 },
  card: {
    flexDirection: 'row', backgroundColor: colors.white, padding: 16, borderRadius: 12, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardText: { flex: 1, marginLeft: 12 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginTop: 12, marginBottom: 24,
    borderWidth: 1, gap: 8,
  },
  statusActive: { backgroundColor: colors.successLight, borderColor: colors.success },
  statusInactive: { backgroundColor: colors.background, borderColor: colors.border },
  statusText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary, flex: 1 },
  statusTextActive: { color: colors.success },
  statusDate: { fontSize: 12, color: colors.textLight },
  button: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonDanger: { backgroundColor: colors.error },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.white },
});
