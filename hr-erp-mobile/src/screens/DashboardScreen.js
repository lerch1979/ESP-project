import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  FlatList,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { dashboardAPI } from '../services/api';
import { colors } from '../constants/colors';
import StatCard from '../components/StatCard';
import TicketCard from '../components/TicketCard';
import LoadingScreen from '../components/LoadingScreen';
import ErrorState from '../components/ErrorState';

export default function DashboardScreen() {
  const navigation = useNavigation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      setError(null);
      const response = await dashboardAPI.getStats();
      setStats(response.data);
    } catch (err) {
      setError('Nem sikerült betölteni az adatokat');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStats();
  }, [fetchStats]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={fetchStats} />;

  const { tickets, contractors, accommodations, recentTickets } = stats;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {tickets?.urgent > 0 && (
        <View style={styles.alert}>
          <Ionicons name="warning" size={20} color={colors.error} />
          <Text style={styles.alertText}>
            {tickets.urgent} sürgős hibajegy vár megoldásra!
          </Text>
        </View>
      )}

      <View style={styles.statsGrid}>
        <StatCard
          title="Hibajegyek"
          value={tickets?.total || 0}
          subtitle={`${tickets?.urgent || 0} sürgős`}
          icon="ticket-outline"
          iconColor={colors.info}
        />
        <StatCard
          title="Alvállalkozók"
          value={contractors?.total || 0}
          subtitle={`${contractors?.active || 0} aktív`}
          icon="business-outline"
          iconColor={colors.primary}
        />
        <StatCard
          title="Szálláshelyek"
          value={accommodations?.total || 0}
          subtitle={`${accommodations?.available || 0} szabad`}
          icon="home-outline"
          iconColor={colors.warning}
        />
        <StatCard
          title="Kihasználtság"
          value={`${Math.round(accommodations?.occupancyRate || 0)}%`}
          subtitle={`${accommodations?.occupied || 0} foglalt`}
          icon="stats-chart-outline"
          iconColor={colors.success}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Legutóbbi hibajegyek</Text>
        {recentTickets?.length > 0 ? (
          recentTickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onPress={() =>
                navigation.navigate('Tickets', {
                  screen: 'TicketDetail',
                  params: { id: ticket.id },
                })
              }
            />
          ))
        ) : (
          <Text style={styles.emptyText}>Nincs legutóbbi hibajegy</Text>
        )}
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorLight,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  alertText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.error,
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
  },
  section: {
    marginTop: 8,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: 24,
  },
  bottomPadding: {
    height: 20,
  },
});
