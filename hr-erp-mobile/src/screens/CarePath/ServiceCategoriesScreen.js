import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import carepathAPI from '../../services/carepath/api';
import ServiceCategoryCard from '../../components/CarePath/ServiceCategoryCard';

export default function ServiceCategoriesScreen({ navigation }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const response = await carepathAPI.categories.getAll();
        setCategories(response.data || []);
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Milyen segítségre van szükséged?</Text>
      <Text style={styles.subtitle}>Válassz kategóriát az ügy indításához</Text>
      <View style={styles.grid}>
        {categories.map((cat) => (
          <ServiceCategoryCard
            key={cat.id}
            category={cat}
            onPress={() => navigation.navigate('CreateCase', { categoryId: cat.id, categoryName: cat.category_name })}
          />
        ))}
      </View>
      {categories.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="folder-open-outline" size={48} color={colors.textLight} />
          <Text style={styles.emptyText}>Nincs elérhető kategória.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, color: colors.textSecondary, marginTop: 12 },
});
