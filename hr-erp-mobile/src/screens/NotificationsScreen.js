import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import api from '../services/api';

const TYPE_ICONS = {
  pulse_reminder: 'happy-outline',
  assessment_due: 'clipboard-outline',
  intervention_assigned: 'bulb-outline',
  case_update: 'shield-outline',
  appointment_reminder: 'calendar-outline',
  coaching_scheduled: 'people-outline',
  ticket_update: 'ticket-outline',
  system: 'information-circle-outline',
};

const TYPE_COLORS = {
  pulse_reminder: colors.primary,
  assessment_due: '#9C27B0',
  intervention_assigned: colors.warning,
  case_update: '#2196F3',
  appointment_reminder: colors.info,
  coaching_scheduled: colors.success,
  ticket_update: colors.warning,
  system: colors.textSecondary,
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'most';
  if (mins < 60) return `${mins} perce`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} órája`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} napja`;
  return new Date(dateStr).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
}

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await api.get('/notification-center');
      const data = response.data?.data || {};
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); fetchNotifications(); }, [fetchNotifications]));

  const markAsRead = async (id) => {
    try {
      await api.put(`/notification-center/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    try {
      await api.put('/notification-center/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { Alert.alert('Hiba', 'Nem sikerült.'); }
  };

  const handlePress = (notification) => {
    if (!notification.is_read) markAsRead(notification.id);

    const type = notification.notification_type || notification.type;
    const meta = notification.metadata || {};

    switch (type) {
      case 'pulse_reminder':
        navigation.navigate('Wellbeing', { screen: 'DailyPulse' }); break;
      case 'assessment_due':
        navigation.navigate('Wellbeing', { screen: 'Assessment' }); break;
      case 'intervention_assigned':
        navigation.navigate('Wellbeing', { screen: 'Interventions' }); break;
      case 'coaching_scheduled':
        navigation.navigate('Wellbeing', { screen: 'CoachingSessions' }); break;
      case 'case_update':
        if (meta.case_id) navigation.navigate('Wellbeing', { screen: 'CaseDetails', params: { caseId: meta.case_id } });
        else navigation.navigate('Wellbeing', { screen: 'MyCases' });
        break;
      case 'appointment_reminder':
        navigation.navigate('Wellbeing', { screen: 'MyCases' }); break;
      default:
        break;
    }
  };

  const renderItem = ({ item }) => {
    const type = item.notification_type || item.type || 'system';
    const icon = TYPE_ICONS[type] || 'notifications-outline';
    const iconColor = TYPE_COLORS[type] || colors.textSecondary;

    return (
      <TouchableOpacity
        style={[styles.notifCard, !item.is_read && styles.notifUnread]}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconCircle, { backgroundColor: iconColor + '15' }]}>
          <Ionicons name={icon} size={22} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.notifTitle, !item.is_read && styles.notifTitleBold]}>
            {item.title}
          </Text>
          {item.message && <Text style={styles.notifMessage} numberOfLines={2}>{item.message}</Text>}
          <Text style={styles.notifTime}>{timeAgo(item.created_at)}</Text>
        </View>
        {!item.is_read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header Actions */}
      {unreadCount > 0 && (
        <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
          <Ionicons name="checkmark-done-outline" size={18} color={colors.primary} />
          <Text style={styles.markAllText}>Mind olvasottnak jelölés ({unreadCount})</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchNotifications} tintColor={colors.primary} />}
        contentContainerStyle={notifications.length === 0 ? styles.emptyWrap : { paddingBottom: 20 }}
        ListEmptyComponent={!loading && (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={48} color={colors.textLight} />
            <Text style={styles.emptyTitle}>Nincs értesítés</Text>
            <Text style={styles.emptyText}>Minden rendben van!</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, alignSelf: 'flex-end' },
  markAllText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  notifUnread: { backgroundColor: colors.primary + '06' },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  notifTitle: { fontSize: 14, color: colors.text },
  notifTitleBold: { fontWeight: '600' },
  notifMessage: { fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  notifTime: { fontSize: 11, color: colors.textLight, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
  emptyWrap: { flex: 1 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 12 },
  emptyText: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
});
