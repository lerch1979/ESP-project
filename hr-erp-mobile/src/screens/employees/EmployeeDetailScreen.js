import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { employeesAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import StatusBadge from '../../components/StatusBadge';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';

export default function EmployeeDetailScreen({ route }) {
  const { id } = route.params;
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

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
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchEmployee(); }}
          tintColor={colors.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={36} color={colors.primary} />
        </View>
        <Text style={styles.name}>
          {employee.last_name} {employee.first_name}
        </Text>
        <Text style={styles.empNumber}>{employee.employee_number}</Text>
        <StatusBadge label={employee.status_name} slug={employee.status_slug} />
      </View>

      {visaWarning && (
        <View style={styles.warning}>
          <Ionicons name="warning" size={18} color={colors.warning} />
          <Text style={styles.warningText}>
            Vízum lejár: {formatDate(employee.visa_expiry)}
          </Text>
        </View>
      )}

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

      {/* Employment */}
      <Section title="Foglalkoztatás">
        <InfoRow label="Kezdés dátuma" value={formatDate(employee.start_date)} />
        <InfoRow label="Befejezés dátuma" value={formatDate(employee.end_date)} />
        <InfoRow label="Érkezés dátuma" value={formatDate(employee.arrival_date)} />
        <InfoRow label="Vízum lejárat" value={formatDate(employee.visa_expiry)} />
        <InfoRow label="Munkahely" value={employee.workplace} />
        <InfoRow label="Cég neve" value={employee.company_name} />
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

      <View style={{ height: 30 }} />
    </ScrollView>
  );
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
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
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
});
