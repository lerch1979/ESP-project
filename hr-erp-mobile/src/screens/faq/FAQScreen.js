import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, RefreshControl,
  ActivityIndicator, StyleSheet, Alert, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { chatbotAPI } from '../../services/api';
import { colors } from '../../constants/colors';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function FAQScreen() {
  const navigation = useNavigation();

  const [categories, setCategories] = useState([]);
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedEntries, setExpandedEntries] = useState({});

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);

      const [catRes, entryRes] = await Promise.all([
        chatbotAPI.getFaqCategories(),
        chatbotAPI.getFaqEntries(),
      ]);

      setCategories(catRes.data || []);
      setEntries(entryRes.data || []);
    } catch (err) {
      console.error('[FAQ] Failed to load data:', err);
      setError('Nem sikerült betölteni a GYIK adatokat.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData(true);
  }, [fetchData]);

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase().trim();
    return entries.filter(
      (e) =>
        (e.question && e.question.toLowerCase().includes(q)) ||
        (e.answer && e.answer.toLowerCase().includes(q))
    );
  }, [entries, search]);

  const entriesByCategory = useMemo(() => {
    const map = {};
    filteredEntries.forEach((entry) => {
      const catId = entry.category_id || 'uncategorized';
      if (!map[catId]) map[catId] = [];
      map[catId].push(entry);
    });
    return map;
  }, [filteredEntries]);

  const visibleCategories = useMemo(() => {
    const base = search.trim()
      ? categories.filter((cat) => entriesByCategory[cat.id]?.length > 0)
      : categories;

    // Add "Egyéb" pseudo-category for entries without a category
    if (entriesByCategory['uncategorized']?.length > 0) {
      return [...base, { id: 'uncategorized', name: 'Egyéb', icon: 'help', color: '#94a3b8' }];
    }
    return base;
  }, [categories, entriesByCategory, search]);

  const toggleCategory = (categoryId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCategories((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };

  const toggleEntry = (entryId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedEntries((prev) => ({ ...prev, [entryId]: !prev[entryId] }));
  };

  const handleVideoPress = () => {
    Alert.alert('Hamarosan', 'A videós válaszok funkció hamarosan elérhető lesz.');
  };

  const handleNavigateToTicket = () => {
    navigation.navigate('Tickets', { screen: 'CreateTicket' });
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>GYIK betöltése...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchData()} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={18} color={colors.white} />
          <Text style={styles.retryButtonText}>Újrapróbálás</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Sticky Search Bar */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={colors.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Keresés a kérdések között..."
            placeholderTextColor={colors.textLight}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.textLight} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Text style={styles.headerTitle}>Gyakran Ismételt Kérdések (FAQ)</Text>

        {visibleCategories.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color={colors.textLight} />
            <Text style={styles.emptyTitle}>Nincs találat</Text>
            <Text style={styles.emptySubtitle}>Próbáljon más keresőkifejezést</Text>
          </View>
        ) : (
          visibleCategories.map((category) => {
            const catEntries = entriesByCategory[category.id] || [];
            const isExpanded = expandedCategories[category.id];

            return (
              <View key={category.id} style={styles.categorySection}>
                {/* Category Header */}
                <TouchableOpacity
                  style={styles.categoryHeader}
                  onPress={() => toggleCategory(category.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.categoryLeft}>
                    <Ionicons
                      name={getCategoryIcon(category.icon)}
                      size={22}
                      color={category.color || colors.primary}
                    />
                    <View style={styles.categoryInfo}>
                      <Text style={styles.categoryName}>{category.name}</Text>
                      <Text style={styles.categoryCount}>
                        {catEntries.length} kérdés
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textLight}
                  />
                </TouchableOpacity>

                {/* Category Entries */}
                {isExpanded && (
                  <View style={styles.entriesContainer}>
                    {catEntries.length === 0 ? (
                      <Text style={styles.noEntriesText}>Nincs kérdés ebben a kategóriában.</Text>
                    ) : (
                      catEntries.map((entry) => (
                        <View key={entry.id} style={styles.entryCard}>
                          {/* Question */}
                          <TouchableOpacity
                            style={styles.entryHeader}
                            onPress={() => toggleEntry(entry.id)}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name={expandedEntries[entry.id] ? 'remove-circle-outline' : 'add-circle-outline'}
                              size={20}
                              color={colors.primary}
                            />
                            <Text style={styles.entryQuestion}>{entry.question}</Text>
                          </TouchableOpacity>

                          {/* Answer */}
                          {expandedEntries[entry.id] && (
                            <View style={styles.entryAnswer}>
                              <Text style={styles.answerText}>{entry.answer}</Text>

                              {/* Action Buttons */}
                              <View style={styles.actionButtons}>
                                <TouchableOpacity
                                  style={styles.textButton}
                                  activeOpacity={0.7}
                                  onPress={() => {}}
                                >
                                  <Text style={styles.textButtonIcon}>📖</Text>
                                  <Text style={styles.textButtonLabel}>Szöveg</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={[styles.textButton, styles.videoButtonDisabled]}
                                  activeOpacity={0.7}
                                  onPress={handleVideoPress}
                                >
                                  <Text style={styles.textButtonIcon}>🎥</Text>
                                  <Text style={[styles.textButtonLabel, styles.videoLabelDisabled]}>Videó</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* Ticket creation CTA */}
        <View style={styles.ctaSection}>
          <Text style={styles.ctaText}>Nem találod a választ?</Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleNavigateToTicket}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={18} color={colors.white} />
            <Text style={styles.ctaButtonText}>Nyiss hibajegyet</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const ICON_MAP = {
  help: 'help-circle-outline',
  work: 'briefcase-outline',
  home: 'home-outline',
  build: 'construct-outline',
  people: 'people-outline',
  document: 'document-text-outline',
  medical: 'medkit-outline',
  info: 'information-circle-outline',
  settings: 'settings-outline',
  calendar: 'calendar-outline',
};

function getCategoryIcon(icon) {
  return ICON_MAP[icon] || ICON_MAP.help;
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
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },

  // Search
  searchWrapper: {
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
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

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // Header
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },

  // Categories
  categorySection: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryInfo: {
    marginLeft: 12,
    flex: 1,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  categoryCount: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Entries
  entriesContainer: {
    marginTop: 4,
    paddingLeft: 12,
  },
  noEntriesText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: 12,
    paddingLeft: 8,
  },
  entryCard: {
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  entryQuestion: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
    marginLeft: 10,
    lineHeight: 20,
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
    lineHeight: 21,
  },

  // Action Buttons
  actionButtons: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
  },
  textButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '12',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 6,
  },
  textButtonIcon: {
    fontSize: 14,
  },
  textButtonLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
  },
  videoButtonDisabled: {
    backgroundColor: colors.border + '80',
  },
  videoLabelDisabled: {
    color: colors.textLight,
  },

  // Empty
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

  // CTA
  ctaSection: {
    alignItems: 'center',
    marginTop: 24,
    marginHorizontal: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  ctaText: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 10,
    gap: 8,
  },
  ctaButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
