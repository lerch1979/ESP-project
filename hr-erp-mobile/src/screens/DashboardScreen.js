import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { dashboardAPI, taskAPI, projectAPI } from '../services/api';
import wellmindAPI from '../services/wellmind/api';
import { normalizeRisk, riskColor, num } from '../components/WellMind/helpers';
import { MOOD_EMOJIS } from '../components/WellMind/MoodSelector';
import { colors } from '../constants/colors';
import StatCard from '../components/StatCard';
import TicketCard from '../components/TicketCard';
import ExpandableSection from '../components/ExpandableSection';
import TaskCard from '../components/TaskCard';
import ProjectCard from '../components/ProjectCard';
import LoadingScreen from '../components/LoadingScreen';
import ErrorState from '../components/ErrorState';

export default function DashboardScreen() {
  const navigation = useNavigation();
  const [stats, setStats] = useState(null);
  const [myTasks, setMyTasks] = useState([]);
  const [activeProjects, setActiveProjects] = useState([]);
  const [wellmind, setWellmind] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      setError(null);
      const [statsRes, tasksRes, projectsRes, wmRes] = await Promise.all([
        dashboardAPI.getStats(),
        taskAPI.getAll({ my_tasks: true, status: 'in_progress', limit: 5 }).catch(() => ({ data: [] })),
        projectAPI.getAll({ status: 'active', limit: 3 }).catch(() => ({ data: [] })),
        wellmindAPI.dashboard.get().catch(() => ({ data: null })),
      ]);
      setStats(statsRes.data);
      setMyTasks(tasksRes.data || []);
      setActiveProjects(projectsRes.data || []);
      setWellmind(wmRes.data);
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

      {myTasks.length > 0 && (
        <ExpandableSection
          title="Feladataim"
          icon="checkbox-outline"
          count={myTasks.length}
          defaultExpanded={true}
        >
          {myTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              compact
              onPress={() =>
                navigation.navigate('More', {
                  screen: 'MyTaskDetail',
                  params: { id: task.id },
                })
              }
            />
          ))}
          <TouchableOpacity
            style={styles.seeAllButton}
            onPress={() => navigation.navigate('More', { screen: 'MyTasks' })}
            activeOpacity={0.7}
          >
            <Text style={styles.seeAllText}>Összes feladat</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        </ExpandableSection>
      )}

      {activeProjects.length > 0 && (
        <ExpandableSection
          title="Aktív projektek"
          icon="folder-outline"
          count={activeProjects.length}
        >
          {activeProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onPress={() =>
                navigation.navigate('More', {
                  screen: 'ProjectDetail',
                  params: { id: project.id },
                })
              }
            />
          ))}
          <TouchableOpacity
            style={styles.seeAllButton}
            onPress={() => navigation.navigate('More', { screen: 'Projects' })}
            activeOpacity={0.7}
          >
            <Text style={styles.seeAllText}>Összes projekt</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        </ExpandableSection>
      )}

      {/* Wellbeing Quick Card */}
      <View style={styles.wellbeingCard}>
        <View style={styles.wellbeingHeader}>
          <Ionicons name="heart" size={20} color={colors.primary} />
          <Text style={styles.wellbeingSectionTitle}>Jóllét</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Wellbeing')}>
            <Text style={styles.seeAllText}>Részletek</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.wellbeingRow}>
          <TouchableOpacity
            style={styles.wellbeingItem}
            onPress={() => navigation.navigate('Wellbeing', { screen: 'DailyPulse' })}
          >
            <Text style={styles.wellbeingEmoji}>
              {wellmind?.pulse_today?.mood_score ? MOOD_EMOJIS[wellmind.pulse_today.mood_score] : '😶'}
            </Text>
            <Text style={styles.wellbeingLabel}>
              {wellmind?.pulse_today?.mood_score ? 'Mai hangulat' : 'Check-in'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.wellbeingItem}
            onPress={() => navigation.navigate('Wellbeing', { screen: 'WellMindDashboard' })}
          >
            <Text style={[styles.wellbeingScore, { color: riskColor(wellmind?.health_status) }]}>
              {num(wellmind?.health_score) || '–'}
            </Text>
            <Text style={styles.wellbeingLabel}>Wellbeing</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.wellbeingItem}
            onPress={() => navigation.navigate('Wellbeing', { screen: 'CreateCase' })}
          >
            <Ionicons name="shield-checkmark-outline" size={28} color="#2196F3" />
            <Text style={styles.wellbeingLabel}>Segítség</Text>
          </TouchableOpacity>
        </View>
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
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 6,
    gap: 4,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  bottomPadding: {
    height: 20,
  },
  wellbeingCard: {
    backgroundColor: colors.white,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  wellbeingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  wellbeingSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  wellbeingRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  wellbeingItem: {
    alignItems: 'center',
    padding: 8,
  },
  wellbeingEmoji: {
    fontSize: 28,
  },
  wellbeingScore: {
    fontSize: 28,
    fontWeight: '800',
  },
  wellbeingLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: 4,
  },
});
