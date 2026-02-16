import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { ticketsAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import LoadingScreen from '../../components/LoadingScreen';

export default function CreateTicketScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [priorityId, setPriorityId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [catRes, priRes] = await Promise.all([
          ticketsAPI.getCategories(),
          ticketsAPI.getPriorities(),
        ]);
        setCategories(catRes.data.categories || []);
        setPriorities(priRes.data.priorities || []);
      } catch {
        Alert.alert('Hiba', 'Nem sikerült betölteni a beállításokat');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Hiba', 'A cím megadása kötelező');
      return;
    }
    if (!categoryId) {
      Alert.alert('Hiba', 'Kérjük, válasszon kategóriát');
      return;
    }
    if (!priorityId) {
      Alert.alert('Hiba', 'Kérjük, válasszon prioritást');
      return;
    }

    setSubmitting(true);
    try {
      await ticketsAPI.create({
        title: title.trim(),
        description: description.trim(),
        category_id: categoryId,
        priority_id: priorityId,
      });
      Alert.alert('Siker', 'Hibajegy sikeresen létrehozva', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      const message = err.response?.data?.message || 'Nem sikerült létrehozni a hibajegyet';
      Alert.alert('Hiba', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.label}>Cím *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Hibajegy címe"
            placeholderTextColor={colors.textLight}
          />

          <Text style={styles.label}>Leírás</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Részletes leírás..."
            placeholderTextColor={colors.textLight}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <Text style={styles.label}>Kategória *</Text>
          <View style={styles.optionGroup}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.optionButton, categoryId === cat.id && styles.optionButtonSelected]}
                onPress={() => setCategoryId(cat.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.optionText, categoryId === cat.id && styles.optionTextSelected]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Prioritás *</Text>
          <View style={styles.optionGroup}>
            {priorities.map((pri) => (
              <TouchableOpacity
                key={pri.id}
                style={[styles.optionButton, priorityId === pri.id && styles.optionButtonSelected]}
                onPress={() => setPriorityId(pri.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.optionText, priorityId === pri.id && styles.optionTextSelected]}
                >
                  {pri.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>Hibajegy létrehozása</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.white,
    margin: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    minHeight: 100,
  },
  optionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  optionTextSelected: {
    color: colors.white,
  },
  submitButton: {
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
