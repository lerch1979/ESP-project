import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { employeesAPI, UPLOADS_BASE_URL } from '../../services/api';
import { colors } from '../../constants/colors';
import StatusBadge from '../../components/StatusBadge';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';

const TABS = [
  { key: 'info', label: 'Alapadatok', icon: 'person-outline' },
  { key: 'timeline', label: 'Idővonal', icon: 'time-outline' },
];

export default function EmployeeDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('info');

  const fetchEmployee = useCallback(async () => {
    try {
      setError(null);
      const response = await employeesAPI.getById(id);
      setEmployee(response.data.employee);
    } catch {
      setError('Nem sikerült betölteni az adatokat');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={fetchEmployee} />;
  if (!employee) return null;

  const visaWarning = employee.visa_expiry && isExpiringSoon(employee.visa_expiry);

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchEmployee(); }}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.avatar}>
            {employee.profile_photo_url ? (
              <Image
                source={{ uri: `${UPLOADS_BASE_URL}${employee.profile_photo_url}` }}
                style={styles.avatarImage}
              />
            ) : (
              <Ionicons name="person" size={36} color={colors.primary} />
            )}
          </View>
          <Text style={styles.name}>
            {employee.last_name} {employee.first_name}
          </Text>
          <Text style={styles.empNumber}>{employee.employee_number}</Text>
          <StatusBadge label={employee.status_name} slug={employee.status_slug} />

          <TouchableOpacity
            style={styles.docsButton}
            onPress={() => navigation.navigate('DocumentGallery', {
              employeeId: employee.id,
              employeeName: `${employee.last_name} ${employee.first_name}`,
            })}
            activeOpacity={0.7}
          >
            <Ionicons name="document-text-outline" size={18} color={colors.primary} />
            <Text style={styles.docsButtonText}>Dokumentumok</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
          </TouchableOpacity>
        </View>

        {visaWarning && (
          <View style={styles.warning}>
            <Ionicons name="warning" size={18} color={colors.warning} />
            <Text style={styles.warningText}>
              Vízum lejár: {formatDate(employee.visa_expiry)}
            </Text>
          </View>
        )}

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={tab.icon}
                size={18}
                color={activeTab === tab.key ? colors.primary : colors.textLight}
              />
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        {activeTab === 'info' ? (
          <BasicInfoTab employee={employee} />
        ) : (
          <TimelineTab employee={employee} />
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

function BasicInfoTab({ employee }) {
  return (
    <View>
      {/* Personal Info */}
      <Section title="Személyes adatok">
        <InfoRow label="Pozíció" value={employee.position} />
        <InfoRow label="Nem" value={employee.gender} />
        <InfoRow label="Születési dátum" value={formatDate(employee.birth_date)} />
        <InfoRow label="Születési hely" value={employee.birth_place} />
        <InfoRow label="Anyja neve" value={employee.mothers_name} />
        <InfoRow label="Családi állapot" value={employee.marital_status} />
      </Section>

      {/* Contact */}
      <Section title="Elérhetőség">
        <InfoRow label="E-mail" value={employee.email} />
        <InfoRow label="Telefon" value={employee.phone} />
        <InfoRow label="Céges e-mail" value={employee.company_email} />
        <InfoRow label="Céges telefon" value={employee.company_phone} />
      </Section>

      {/* Documents */}
      <Section title="Dokumentumok">
        <InfoRow label="Adóazonosító" value={employee.tax_id} />
        <InfoRow label="Útlevélszám" value={employee.passport_number} />
        <InfoRow label="TAJ szám" value={employee.social_security_number} />
        <InfoRow label="Bankszámlaszám" value={employee.bank_account} />
      </Section>

      {/* Accommodation */}
      {employee.accommodation_name && (
        <Section title="Szálláshely">
          <InfoRow label="Szálláshely" value={employee.accommodation_name} />
          <InfoRow label="Szobaszám" value={employee.room_number} />
        </Section>
      )}

      {/* Address */}
      {employee.permanent_address_city && (
        <Section title="Állandó lakcím">
          <InfoRow label="Ország" value={employee.permanent_address_country} />
          <InfoRow label="Megye" value={employee.permanent_address_county} />
          <InfoRow label="Város" value={employee.permanent_address_city} />
          <InfoRow label="Utca" value={employee.permanent_address_street} />
          <InfoRow label="Házszám" value={employee.permanent_address_number} />
          <InfoRow label="Irányítószám" value={employee.permanent_address_zip} />
        </Section>
      )}
    </View>
  );
}

function TimelineTab({ employee }) {
  const events = buildTimeline(employee);

  if (events.length === 0) {
    return (
      <View style={styles.emptyTimeline}>
        <Ionicons name="time-outline" size={48} color={colors.textLight} />
        <Text style={styles.emptyTimelineText}>Nincs elérhető idővonal adat</Text>
      </View>
    );
  }

  return (
    <View style={styles.timeline}>
      {events.map((event, index) => (
        <View key={index} style={styles.timelineItem}>
          <View style={styles.timelineLine}>
            <View style={[styles.timelineDot, { backgroundColor: event.color }]} />
            {index < events.length - 1 && <View style={styles.timelineConnector} />}
          </View>
          <View style={styles.timelineContent}>
            <Text style={styles.timelineDate}>{event.date}</Text>
            <Text style={styles.timelineTitle}>{event.title}</Text>
            {event.subtitle && (
              <Text style={styles.timelineSubtitle}>{event.subtitle}</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

function buildTimeline(employee) {
  const events = [];

  if (employee.arrival_date) {
    events.push({
      date: formatDate(employee.arrival_date),
      title: 'Érkezés',
      subtitle: employee.accommodation_name ? `Szálláshely: ${employee.accommodation_name}` : null,
      color: colors.info,
      sortDate: new Date(employee.arrival_date),
    });
  }

  if (employee.start_date) {
    events.push({
      date: formatDate(employee.start_date),
      title: 'Munkaviszony kezdete',
      subtitle: employee.company_name ? `Cég: ${employee.company_name}` : null,
      color: colors.success,
      sortDate: new Date(employee.start_date),
    });
  }

  if (employee.visa_expiry) {
    const isExpiring = isExpiringSoon(employee.visa_expiry);
    events.push({
      date: formatDate(employee.visa_expiry),
      title: 'Vízum lejárat',
      subtitle: isExpiring ? 'Hamarosan lejár!' : null,
      color: isExpiring ? colors.warning : colors.textLight,
      sortDate: new Date(employee.visa_expiry),
    });
  }

  if (employee.end_date) {
    events.push({
      date: formatDate(employee.end_date),
      title: 'Munkaviszony vége',
      subtitle: null,
      color: colors.error,
      sortDate: new Date(employee.end_date),
    });
  }

  events.sort((a, b) => a.sortDate - b.sortDate);
  return events;
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function isExpiringSoon(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = (d - now) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 30;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerCard: {
    backgroundColor: colors.white,
    margin: 16,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  empNumber: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  docsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '10',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    marginTop: 12,
    width: '100%',
  },
  docsButtonText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 10,
    gap: 8,
    marginBottom: 4,
  },
  warningText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.warning,
  },
  // Tab bar
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  tabActive: {
    backgroundColor: colors.primary + '12',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textLight,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  // Sections
  section: {
    backgroundColor: colors.white,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  // Timeline
  timeline: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 70,
  },
  timelineLine: {
    width: 30,
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 12,
    marginLeft: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  timelineDate: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  timelineSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyTimeline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTimelineText: {
    fontSize: 15,
    color: colors.textSecondary,
  },
});
