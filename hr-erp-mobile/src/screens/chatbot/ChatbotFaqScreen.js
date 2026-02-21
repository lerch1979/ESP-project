import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, RefreshControl,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chatbotAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import FaqCategoryCard from '../../components/FaqCategoryCard';

export default function ChatbotFaqScreen() {
  const [categories, setCategories] = useState([]);
  const [entries, setEntries] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState(null);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await chatbotAPI.getFaqCategories();
      setCategories(response.data || []);
    } catch (err) {
      console.error('[FAQ] Failed to load categories:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchEntries = useCallback(async (categoryId, searchText) => {
    try {
      const params = {};
      if (categoryId) params.category_id = categoryId;
      if (searchText) params.search = searchText;
      const response = await chatbotAPI.getFaqEntries(params);
      setEntries(response.data || []);
    } catch (err) {
      console.error('[FAQ] Failed to load entries:', err);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (selectedCategory || search) {
      fetchEntries(selectedCategory?.id, search);
    }
  }, [selectedCategory, search, fetchEntries]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCategories();
    if (selectedCategory || search) {
      fetchEntries(selectedCategory?.id, search);
    }
  }, [fetchCategories, fetchEntries, selectedCategory, search]);

  const handleCategoryPress = (category) => {
    setSelectedCategory(category);
    setExpandedEntry(null);
  };

  const handleBack = () => {
    setSelectedCategory(null);
    setEntries([]);
    setSearch('');
    setExpandedEntry(null);
  };

  const toggleEntry = (entryId) => {
    setExpandedEntry(prev => prev === entryId ? null : entryId);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Show Q&A entries for selected category or search
  if (selectedCategory || search) {
    return (
      <View style={styles.container}>
        {selectedCategory && (
          <View style={styles.categoryHeader}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color={colors.primary} />
            </TouchableOpacity>
            <Text style={styles.categoryTitle}>{selectedCategory.name}</Text>
          </View>
        )}

        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={colors.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Keresés a kérdések között..."
            placeholderTextColor={colors.textLight}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.textLight} />
            </TouchableOpacity>
          ) : null}
        </View>

        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.entryCard}
              onPress={() => toggleEntry(item.id)}
              activeOpacity={0.7}
            >
              <View style={styles.entryHeader}>
                <Ionicons
                  name={expandedEntry === item.id ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.entryQuestion}>{item.question}</Text>
              </View>
              {expandedEntry === item.id && (
                <View style={styles.entryAnswer}>
                  <Text style={styles.answerText}>{item.answer}</Text>
                  {item.category_name && (
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryBadgeText}>{item.category_name}</Text>
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          )}
          contentContainerStyle={entries.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyTitle}>Nincs találat</Text>
              <Text style={styles.emptySubtitle}>Próbáljon más keresőkifejezést</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        />
      </View>
    );
  }

  // Show category grid
  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color={colors.textLight} />
        <TextInput
          style={styles.searchInput}
          placeholder="Keresés a GYIK-ben..."
          placeholderTextColor={colors.textLight}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item }) => (
          <View style={styles.gridItem}>
            <FaqCategoryCard category={item} onPress={handleCategoryPress} />
          </View>
        )}
        contentContainerStyle={categories.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="help-circle-outline" size={48} color={colors.textLight} />
            <Text style={styles.emptyTitle}>Nincs elérhető kategória</Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontSize: 15,
    color: colors.text,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  gridItem: {
    width: '48%',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  entryCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  entryQuestion: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
    marginLeft: 10,
  },
  entryAnswer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginLeft: 30,
  },
  answerText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '15',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
  },
  categoryBadgeText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
