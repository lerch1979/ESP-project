import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import carepathAPI from '../../services/carepath/api';
import ProviderCard from '../../components/CarePath/ProviderCard';

const SPECIALTIES = [
  { label: 'Mind', value: '' },
  { label: 'Tanácsadás', value: 'counseling' },
  { label: 'Jogi', value: 'legal' },
  { label: 'Pénzügyi', value: 'financial' },
  { label: 'Krízis', value: 'crisis' },
  { label: 'Családi', value: 'family' },
];

export default function ProviderSearchScreen({ navigation }) {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('');

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const params = {};
      if (specialty) params.specialties = specialty;
      if (search.trim()) params.city = search.trim();
      const response = await carepathAPI.providers.search(params);
      setProviders(response.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProviders(); }, [specialty]);

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <Ionicons name="search-outline" size={20} color={colors.textLight} />
          <TextInput
            style={styles.searchText}
            value={search}
            onChangeText={setSearch}
            placeholder="Város keresése..."
            placeholderTextColor={colors.textLight}
            onSubmitEditing={fetchProviders}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(''); fetchProviders(); }}>
              <Ionicons name="close-circle" size={20} color={colors.textLight} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Specialty Filter */}
      <FlatList
        horizontal showsHorizontalScrollIndicator={false} data={SPECIALTIES}
        keyExtractor={(i) => i.value} contentContainerStyle={styles.filterRow}
        renderItem={({ item: f }) => (
          <TouchableOpacity
            style={[styles.chip, specialty === f.value && styles.chipActive]}
            onPress={() => setSpecialty(f.value)}
          >
            <Text style={[styles.chipText, specialty === f.value && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        )}
      />

      {/* Results */}
      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={providers}
          keyExtractor={(i) => i.id}
          contentContainerStyle={providers.length === 0 ? styles.emptyWrap : { paddingHorizontal: 16, paddingBottom: 20 }}
          renderItem={({ item }) => (
            <ProviderCard
              provider={item}
              onPress={() => navigation.navigate('ProviderDetails', { providerId: item.id })}
            />
          )}
          ListHeaderComponent={
            <Text style={styles.resultCount}>{providers.length} szolgáltató találva</Text>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyText}>Nem található szolgáltató a megadott feltételekkel.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchRow: { paddingHorizontal: 16, paddingTop: 12 },
  searchInput: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
  },
  searchText: { flex: 1, fontSize: 15, color: colors.text },
  filterRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  chipText: { fontSize: 13, color: colors.text, fontWeight: '500' },
  chipTextActive: { color: colors.white },
  resultCount: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
  emptyWrap: { flex: 1, paddingHorizontal: 16 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: colors.textSecondary, marginTop: 12, textAlign: 'center' },
});
