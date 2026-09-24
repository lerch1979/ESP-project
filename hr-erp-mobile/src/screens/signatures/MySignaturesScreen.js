import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../../constants/colors';
import { signaturesAPI } from '../../services/api';
import SignaturePad from '../../components/SignaturePad';

const IKON = {
  damage_report: 'construct-outline',
  compensation_resident: 'cash-outline',
  inspection: 'clipboard-outline',
  document: 'document-text-outline',
};

/**
 * ALÁÍRÁSRA VÁRÓ DOKUMENTUMOK — a lakó saját telefonján.
 *
 * MIÉRT JOBB EZ, MINT A SZEMÉLYZETI KÉSZÜLÉK: a lakó a saját fiókjából, a saját
 * nyelvén, a maga idejében olvassa el. Nem áll fölötte senki, nem siet. Egy vitában
 * ez lényegesen erősebb, mint egy odanyújtott idegen telefon.
 *
 * A SORREND ITT IS: előbb a SZÖVEG (görgethetően, végig), és csak utána a vászon.
 * A képernyő ezért egyetlen görgethető oldal, nem lapozós varázsló — a lakó lássa,
 * mennyi van még hátra a szövegből, mielőtt aláír.
 */
export default function MySignaturesScreen() {
  const { t, i18n } = useTranslation();
  const [lista, setLista] = useState([]);
  const [betolt, setBetolt] = useState(true);
  const [frissit, setFrissit] = useState(false);
  const [nyitott, setNyitott] = useState(null);     // a kiválasztott dokumentum
  const [szoveg, setSzoveg] = useState('');
  const [alairas, setAlairas] = useState(null);
  const [kuld, setKuld] = useState(false);

  const betoltes = useCallback(async () => {
    try {
      const r = await signaturesAPI.pending();
      setLista(r?.data?.items || []);
    } catch {
      // A lista hiánya nem hiba-képernyő: üres állapotot mutatunk, és a húzásra
      // frissítés újrapróbálja. Egy piros hibaoldal itt ijesztőbb, mint amennyit ér.
      setLista([]);
    } finally { setBetolt(false); setFrissit(false); }
  }, []);

  useEffect(() => { betoltes(); }, [betoltes]);

  const megnyit = async (item) => {
    setNyitott(item); setSzoveg(''); setAlairas(null);
    try {
      const r = await signaturesAPI.myText(item.t, item.id, i18n.language);
      setSzoveg(r?.data?.text || '');
    } catch {
      setSzoveg(t('signature.textFailed'));
    }
  };

  const alair = async () => {
    if (!alairas) return;
    setKuld(true);
    try {
      await signaturesAPI.mySign(nyitott.t, nyitott.id, {
        language: i18n.language, signature: alairas,
      });
      Alert.alert(t('signature.doneTitle'), t('signature.doneBody'));
      setNyitott(null);
      betoltes();
    } catch (e) {
      Alert.alert(t('common.error'),
        e?.response?.data?.message || t('signature.failed'));
    } finally { setKuld(false); }
  };

  if (betolt) {
    return <View style={styles.kozep}><ActivityIndicator color={colors.primary} /></View>;
  }

  // ── egy dokumentum aláírása ────────────────────────────────────────────────
  if (nyitott) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.tartalom}>
        <Text style={styles.cim}>{nyitott.azonosito || '—'}</Text>
        {nyitott.leiras ? <Text style={styles.leiras}>{nyitott.leiras}</Text> : null}

        {/* A SZÖVEG — amit aláír. Teljes terjedelemben, görgethetően. */}
        <View style={styles.szovegDoboz}>
          {szoveg
            ? <Text style={styles.szoveg}>{szoveg}</Text>
            : <ActivityIndicator color={colors.primary} />}
        </View>

        <Text style={styles.cimke}>{t('signature.drawHere')}</Text>
        <SignaturePad onChange={setAlairas} />
        <TouchableOpacity onPress={() => SignaturePad.torol?.()} style={styles.torol}>
          <Ionicons name="trash-outline" size={16} color={colors.textLight} />
          <Text style={styles.torolSzoveg}>{t('common.clear')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.gomb, (!alairas || kuld) && styles.gombTiltva]}
          onPress={alair} disabled={!alairas || kuld}
        >
          {kuld ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.gombSzoveg}>{t('signature.submit')}</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.megse} onPress={() => setNyitott(null)}>
          <Text style={styles.megseSzoveg}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── a lista ────────────────────────────────────────────────────────────────
  return (
    <FlatList
      style={styles.container}
      data={lista}
      keyExtractor={(x) => `${x.t}:${x.id}`}
      refreshControl={<RefreshControl refreshing={frissit}
        onRefresh={() => { setFrissit(true); betoltes(); }} />}
      ListEmptyComponent={
        <View style={styles.ures}>
          <Ionicons name="checkmark-circle-outline" size={44} color={colors.textLight} />
          <Text style={styles.uresSzoveg}>{t('signature.empty')}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.sor} onPress={() => megnyit(item)}>
          <Ionicons name={IKON[item.t] || 'document-outline'} size={22} color={colors.primary} />
          <View style={styles.sorSzoveg}>
            <Text style={styles.sorCim} numberOfLines={1}>{item.azonosito || '—'}</Text>
            {item.leiras ? (
              <Text style={styles.sorLeiras} numberOfLines={2}>{item.leiras}</Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  kozep: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tartalom: { padding: 18 },
  cim: { fontSize: 17, fontWeight: '700', color: colors.text },
  leiras: { fontSize: 14, color: colors.textLight, marginTop: 2, marginBottom: 12 },
  szovegDoboz: {
    backgroundColor: '#FBF6EE', borderLeftWidth: 3, borderLeftColor: colors.primaryLight,
    borderRadius: 8, padding: 14, marginBottom: 18,
  },
  szoveg: { fontSize: 14, lineHeight: 21, color: colors.text },
  cimke: { fontSize: 13, color: colors.textLight, marginBottom: 6 },
  torol: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8 },
  torolSzoveg: { fontSize: 13, color: colors.textLight },
  gomb: {
    backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 15,
    alignItems: 'center', marginTop: 10,
  },
  gombTiltva: { opacity: 0.45 },
  gombSzoveg: { color: colors.white, fontSize: 16, fontWeight: '600' },
  megse: { paddingVertical: 16, alignItems: 'center' },
  megseSzoveg: { color: colors.textLight, fontSize: 15 },
  sor: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sorSzoveg: { flex: 1, minWidth: 0 },
  sorCim: { fontSize: 15, fontWeight: '600', color: colors.text },
  sorLeiras: { fontSize: 13, color: colors.textLight, marginTop: 2 },
  ures: { alignItems: 'center', paddingTop: 70, gap: 10 },
  uresSzoveg: { fontSize: 15, color: colors.textLight, textAlign: 'center', paddingHorizontal: 40 },
});
