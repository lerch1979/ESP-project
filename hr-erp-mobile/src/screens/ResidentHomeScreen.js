import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { accommodationsAPI, ticketsAPI, notificationsAPI } from '../services/api';
import ActionCard from '../components/ActionCard';
import { colors } from '../constants/colors';

// Profile-centric resident home. Big icon cards, minimal text (mixed-language
// workforce). Badges: open ticket count + unread notifications.
export default function ResidentHomeScreen({ navigation }) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [room, setRoom] = useState(null);
  const [openCount, setOpenCount] = useState(0);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const acc = await accommodationsAPI.getMine();
      const a = acc.data?.accommodation;
      if (a) {
        setRoom(a);
        const full = `${a.my_first_name || ''} ${a.my_last_name || ''}`.trim();
        setName(full || user?.email || '');
      }
    } catch { /* leave defaults */ }
    try {
      const t = await ticketsAPI.getMine();
      setOpenCount((t.data?.tickets || []).filter((x) => !x.is_final).length);
    } catch { /* ignore */ }
    try {
      const n = await notificationsAPI.getUnreadCount();
      setUnread(n?.data?.count ?? n?.data?.unread ?? n?.count ?? 0);
    } catch { /* ignore */ }
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    load();
    return unsub;
  }, [navigation, load]);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
      }
    >
      {/* Profile header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={34} color={colors.white} />
        </View>
        <Text style={styles.name}>{name || '—'}</Text>
        {room && (
          <View style={styles.roomRow}>
            <Ionicons name="home-outline" size={16} color="rgba(255,255,255,0.85)" />
            <Text style={styles.room}>
              {room.name}{room.my_room_number ? ` · Szoba ${room.my_room_number}` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <ActionCard
          icon="alert-circle"
          label="Hibát jelentek"
          variant="primary"
          onPress={() => navigation.navigate('Tickets', { screen: 'CreateTicket' })}
        />
        <View style={styles.grid}>
          <ActionCard
            icon="ticket-outline"
            label="Hibajegyeim"
            badge={openCount}
            onPress={() => navigation.navigate('Tickets', { screen: 'TicketList' })}
          />
          <ActionCard
            icon="notifications-outline"
            label="Értesítések"
            badge={unread}
            onPress={() => navigation.navigate('More', { screen: 'Notifications' })}
          />
        </View>
        <View style={styles.grid}>
          <ActionCard
            icon="person-circle-outline"
            label="Profil"
            onPress={() => navigation.navigate('More', { screen: 'Profile' })}
          />
          <View style={styles.spacer} />
        </View>
      </View>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.primary,
    paddingTop: 48,
    paddingBottom: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  avatar: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  name: { fontSize: 22, fontWeight: '700', color: colors.white },
  roomRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  room: { fontSize: 15, color: 'rgba(255,255,255,0.9)' },
  actions: { padding: 12, marginTop: 8 },
  grid: { flexDirection: 'row' },
  spacer: { flex: 1, margin: 6 },
});
