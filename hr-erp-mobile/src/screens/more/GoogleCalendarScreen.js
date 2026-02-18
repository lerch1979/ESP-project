import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { googleCalendarAPI } from '../../services/api';
import { colors } from '../../constants/colors';

export default function GoogleCalendarScreen() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await googleCalendarAPI.getStatus();
      setStatus(response.data);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const response = await googleCalendarAPI.getAuthUrl();
      const authUrl = response.data.authUrl;
      const redirectUrl = Linking.createURL('/');

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

      if (result.type === 'success') {
        // Refresh status after OAuth callback
        setLoading(true);
        await fetchStatus();
      }
    } catch {
      Alert.alert('Hiba', 'Nem sikerült a Google fiók csatlakoztatása.');
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      await googleCalendarAPI.triggerSync();
      Alert.alert('Siker', 'Google Calendar szinkronizálás elindítva.');
      await fetchStatus();
    } catch {
      Alert.alert('Hiba', 'Nem sikerült a szinkronizálás.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Lecsatlakoztatás',
      'Biztosan le szeretné csatlakoztatni a Google Calendar fiókot?',
      [
        { text: 'Mégse', style: 'cancel' },
        {
          text: 'Lecsatlakoztatás',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await googleCalendarAPI.disconnect();
              setStatus({ connected: false });
            } catch {
              Alert.alert('Hiba', 'Nem sikerült a lecsatlakoztatás.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!status?.connected) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.headerCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="logo-google" size={36} color="#4285F4" />
          </View>
          <Text style={styles.title}>Google Calendar</Text>
          <Text style={styles.subtitle}>
            Csatlakoztasd a Google Calendar fiókodat, hogy az eseményeid automatikusan szinkronizálódjanak.
          </Text>
        </View>

        <View style={styles.card}>
          <InfoRow
            icon="sync-outline"
            label="Kétirányú szinkron"
            value="Események automatikus szinkronizálása"
          />
          <InfoRow
            icon="notifications-outline"
            label="Valós idejű frissítés"
            value="Változások azonnal megjelennek"
          />
          <InfoRow
            icon="calendar-outline"
            label="Minden esemény"
            value="Műszakok, határidők, személyes események"
          />
        </View>

        <TouchableOpacity
          style={styles.connectButton}
          onPress={handleConnect}
          activeOpacity={0.8}
          disabled={connecting}
        >
          {connecting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color={colors.white} />
              <Text style={styles.connectButtonText}>Csatlakoztatás</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  // Connected state
  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerCard}>
        <View style={[styles.iconCircle, styles.iconCircleConnected]}>
          <Ionicons name="checkmark-circle" size={36} color={colors.success} />
        </View>
        <Text style={styles.title}>Csatlakoztatva</Text>
        <Text style={styles.subtitle}>{status.googleEmail}</Text>
      </View>

      <View style={styles.card}>
        <InfoRow
          icon="mail-outline"
          label="Google fiók"
          value={status.googleEmail}
        />
        <InfoRow
          icon="calendar-outline"
          label="Naptár"
          value={status.calendarId || 'primary'}
        />
        <InfoRow
          icon="time-outline"
          label="Utolsó szinkron"
          value={status.lastSync ? formatDate(status.lastSync) : 'Még nem szinkronizált'}
        />
        <InfoRow
          icon="sync-outline"
          label="Szinkron állapot"
          value={status.syncEnabled ? 'Aktív' : 'Inaktív'}
        />
      </View>

      <TouchableOpacity
        style={styles.syncButton}
        onPress={handleSync}
        activeOpacity={0.8}
        disabled={syncing}
      >
        {syncing ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <>
            <Ionicons name="sync-outline" size={20} color={colors.white} />
            <Text style={styles.syncButtonText}>Szinkronizálás most</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.disconnectButton}
        onPress={handleDisconnect}
        activeOpacity={0.8}
      >
        <Ionicons name="close-circle-outline" size={20} color={colors.white} />
        <Text style={styles.disconnectButtonText}>Lecsatlakoztatás</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function InfoRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} style={styles.infoIcon} />
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  headerCard: {
    backgroundColor: colors.white,
    margin: 16,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#4285F4' + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCircleConnected: {
    backgroundColor: colors.success + '15',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  card: {
    backgroundColor: colors.white,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoIcon: {
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    marginTop: 1,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 10,
    padding: 16,
    gap: 8,
  },
  connectButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 10,
    padding: 16,
    gap: 8,
  },
  syncButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    padding: 16,
    gap: 8,
  },
  disconnectButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
