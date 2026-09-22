import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, StyleSheet, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { taskAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';

/**
 * A LAKÓNAK szóló teendők.
 *
 * ⚠️ AMI ITT MEGJELENIK, AZ KIZÁRÓLAG A NEKI SZÓLÓ FELADAT. A szerver a
 * `/tasks/mine` végponton csak az `assigned_to_employee_id`-ra szűr — a lakóRÓL szóló
 * belső teendő (`related_employee_id`) soha nem kerül ide. Ez nem a képernyő dolga
 * eldönteni: a szűkítés a szerveren van, és teszt őrzi (FUNCTEST RESTASK-05).
 *
 * A visszajelzés három állapota szándékosan kevés: láttam / folyamatban / kész. Egy
 * részletesebb skála azt sugallná, hogy a lakó munkafolyamatot vezet — holott csak
 * annyit üzen, hogy hol tart.
 */

const ALLAPOT = {
  lattam: { cimke: 'seen', szin: colors.textLight, ikon: 'eye-outline' },
  folyamatban: { cimke: 'inProgress', szin: colors.warning || '#d97706', ikon: 'time-outline' },
  kesz: { cimke: 'done', szin: colors.success || '#16a34a', ikon: 'checkmark-circle' },
};

export default function ResidentTasksScreen() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const r = await taskAPI.getMine();
      setTasks(r?.data?.tasks || []);
    } catch (e) {
      setError(e?.response?.data?.message || t('common.loadError', { defaultValue: 'Betöltési hiba' }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  // A fül minden megnyitásakor frissít: egy teendő közben is érkezhetett push-sal.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const jelol = async (id, allapot) => {
    setSaving(id);
    try {
      await taskAPI.setMineStatus(id, allapot);
      await load();
    } catch (e) {
      Alert.alert(t('common.error'), e?.response?.data?.message
        || t('tasks.saveFailed', { defaultValue: 'A visszajelzés nem mentődött' }));
    } finally {
      setSaving(null);
    }
  };

  const renderItem = ({ item }) => {
    const a = ALLAPOT[item.resident_status];
    const kesz = item.resident_status === 'kesz';
    return (
      <View style={[styles.card, kesz && styles.cardDone]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.title, kesz && styles.titleDone]}>{item.title}</Text>
          {a ? <Ionicons name={a.ikon} size={20} color={a.szin} /> : null}
        </View>
        {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
        {item.due_date ? (
          <Text style={styles.due}>
            {t('tasks.due', { defaultValue: 'Határidő' })}: {item.due_date}
          </Text>
        ) : null}

        {/* A "kész" után nincs több gomb: a visszajelzés nem visszavonható a telefonról.
            Ha tévedett, az irodát kell megkeresnie — így marad nyoma a változtatásnak. */}
        {!kesz && (
          <View style={styles.actions}>
            {['lattam', 'folyamatban', 'kesz'].map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.btn, item.resident_status === k && styles.btnActive]}
                onPress={() => jelol(item.id, k)}
                disabled={saving === item.id}
                activeOpacity={0.8}
              >
                <Text style={[styles.btnText, item.resident_status === k && styles.btnTextActive]}>
                  {t(`tasks.${ALLAPOT[k].cimke}`, {
                    defaultValue: { lattam: 'Láttam', folyamatban: 'Folyamatban', kesz: 'Kész' }[k],
                  })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <FlatList
      data={tasks}
      keyExtractor={(x) => x.id}
      renderItem={renderItem}
      contentContainerStyle={tasks.length === 0 ? styles.emptyWrap : styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="checkmark-done-outline" size={48} color={colors.textLight} />
          <Text style={styles.emptyText}>
            {t('tasks.empty', { defaultValue: 'Jelenleg nincs teendőd.' })}
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  card: {
    backgroundColor: colors.white, borderRadius: 10, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  cardDone: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1, marginRight: 8 },
  titleDone: { textDecorationLine: 'line-through' },
  desc: { marginTop: 6, color: colors.textLight, lineHeight: 20 },
  due: { marginTop: 8, fontSize: 13, color: colors.primary, fontWeight: '600' },
  actions: { flexDirection: 'row', marginTop: 12, gap: 8 },
  btn: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border, flex: 1, alignItems: 'center',
  },
  btnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  btnText: { fontSize: 13, fontWeight: '600', color: colors.text },
  btnTextActive: { color: colors.white },
  empty: { alignItems: 'center', padding: 24 },
  emptyText: { marginTop: 10, color: colors.textLight, textAlign: 'center' },
});
