import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../../constants/colors';
import { useAuth } from '../../contexts/AuthContext';

// A szerverrel MEGEGYEZŐ minimum (backend: src/utils/passwordRule.js). Ha a két érték
// szétcsúszik, a felhasználó zöld visszajelzést kap egy jelszóra, amit a szerver aztán
// elutasít — ez a fajta ellentmondás rombolja legjobban a bizalmat a felületben.
const MIN_HOSSZ = 8;

/**
 * Jelszóváltás. KÉT helyzetet szolgál ki ugyanazzal a kóddal:
 *   • a beállításokból nyitva → van "Mégse", a felhasználó meggondolhatja magát;
 *   • kötelező első belépéskor → NINCS kiút, és ez szándékos: a lakó a belépését
 *     PAPÍRON kapta, tehát addig nem az övé a fiók, amíg le nem cserélte.
 * A `kotelezo` jelzőt a hívó adja; a tényleges korlát a szerveren van.
 */
export default function ChangePasswordScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { changePassword, logout } = useAuth();
  const kotelezo = route?.params?.kotelezo === true;

  const [jelenlegi, setJelenlegi] = useState('');
  const [uj, setUj] = useState('');
  const [ujMegint, setUjMegint] = useState('');
  const [mutat, setMutat] = useState(false);
  const [betolt, setBetolt] = useState(false);
  const [hiba, setHiba] = useState(null);

  // A HIBÁT A MEZŐK ALATT MUTATJUK, nem felugró ablakban. Felugróban a szöveg eltűnik,
  // mire a felhasználó visszanéz a mezőre, és nem tudja összevetni azzal, amit beírt.
  const rovid = uj.length > 0 && uj.length < MIN_HOSSZ;
  const nemEgyezik = ujMegint.length > 0 && uj !== ujMegint;
  const ugyanaz = uj.length > 0 && uj === jelenlegi;
  const kuldheto = jelenlegi.length > 0 && !rovid && !nemEgyezik && !ugyanaz
    && ujMegint.length > 0 && !betolt;

  const mehet = async () => {
    setHiba(null);
    setBetolt(true);
    try {
      await changePassword(jelenlegi, uj);
      if (kotelezo) return;             // a navigáció magától a fő képernyőre vált
      navigation.goBack();
    } catch (e) {
      setHiba(e?.response?.data?.message || t('password.failed'));
    } finally {
      setBetolt(false);
    }
  };

  const Mezo = ({ ertek, allit, cimke, elsoMezo }) => (
    <View style={styles.mezoDoboz}>
      <Text style={styles.cimke}>{cimke}</Text>
      <View style={styles.beviteliSor}>
        <TextInput
          style={styles.bevitel}
          value={ertek}
          onChangeText={allit}
          secureTextEntry={!mutat}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={elsoMezo}
          placeholderTextColor={colors.textLight}
        />
        <TouchableOpacity onPress={() => setMutat(!mutat)} hitSlop={10}>
          <Ionicons name={mutat ? 'eye-off-outline' : 'eye-outline'} size={22}
            color={colors.textLight} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.tartalom} keyboardShouldPersistTaps="handled">
        {kotelezo && (
          <View style={styles.kotelezoDoboz}>
            <Ionicons name="key-outline" size={22} color={colors.primary} />
            <Text style={styles.kotelezoSzoveg}>{t('password.firstLoginBody')}</Text>
          </View>
        )}

        <Mezo cimke={t('password.current')} ertek={jelenlegi} allit={setJelenlegi} elsoMezo />
        <Mezo cimke={t('password.new')} ertek={uj} allit={setUj} />
        <Mezo cimke={t('password.newAgain')} ertek={ujMegint} allit={setUjMegint} />

        <Text style={styles.szabaly}>{t('password.rule', { min: MIN_HOSSZ })}</Text>

        {rovid && <Text style={styles.hiba}>{t('password.tooShort', { min: MIN_HOSSZ })}</Text>}
        {ugyanaz && <Text style={styles.hiba}>{t('password.sameAsCurrent')}</Text>}
        {nemEgyezik && <Text style={styles.hiba}>{t('password.mismatch')}</Text>}
        {hiba && <Text style={styles.hiba}>{hiba}</Text>}

        <TouchableOpacity
          style={[styles.gomb, !kuldheto && styles.gombTiltva]}
          onPress={mehet}
          disabled={!kuldheto}
          activeOpacity={0.8}
        >
          {betolt ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.gombSzoveg}>{t('password.submit')}</Text>}
        </TouchableOpacity>

        {/* Kötelező cserénél nincs "Mégse" — de KILÉPNI lehet. Aki nem akar most
            jelszót adni, ne ragadjon be egy képernyőre, amiből nincs kiút. */}
        {kotelezo ? (
          <TouchableOpacity style={styles.masodlagos} onPress={logout} activeOpacity={0.7}>
            <Text style={styles.masodlagosSzoveg}>{t('menu.logout')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.masodlagos} onPress={() => navigation.goBack()}
            activeOpacity={0.7}>
            <Text style={styles.masodlagosSzoveg}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tartalom: { padding: 20, paddingTop: 28 },
  kotelezoDoboz: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FBF6EE', borderLeftWidth: 3, borderLeftColor: colors.primaryLight,
    borderRadius: 8, padding: 14, marginBottom: 22,
  },
  kotelezoSzoveg: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  mezoDoboz: { marginBottom: 16 },
  cimke: { fontSize: 13, color: colors.textLight, marginBottom: 6 },
  beviteliSor: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.white, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14,
  },
  bevitel: { flex: 1, paddingVertical: 13, fontSize: 16, color: colors.text },
  szabaly: { fontSize: 12, color: colors.textLight, marginTop: 2, marginBottom: 12 },
  hiba: { fontSize: 13, color: colors.error, marginBottom: 8 },
  gomb: {
    backgroundColor: colors.primary, borderRadius: 10,
    paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  gombTiltva: { opacity: 0.45 },
  gombSzoveg: { color: colors.white, fontSize: 16, fontWeight: '600' },
  masodlagos: { paddingVertical: 16, alignItems: 'center' },
  masodlagosSzoveg: { color: colors.textLight, fontSize: 15 },
});
