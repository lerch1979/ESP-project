import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../constants/colors';

// First-run welcome: 3 cards in the resident's language explaining the basics.
// Shown once (AppNavigator gates it on the 'hasSeenOnboarding' flag).
const CARDS = [
  { icon: 'hand-left-outline', titleKey: 'onboarding.t1', bodyKey: 'onboarding.b1' },
  { icon: 'construct-outline', titleKey: 'onboarding.t2', bodyKey: 'onboarding.b2' },
  { icon: 'chatbubbles-outline', titleKey: 'onboarding.t3', bodyKey: 'onboarding.b3' },
];

export default function OnboardingScreen({ onDone }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const isLast = index === CARDS.length - 1;
  const card = CARDS[index];

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skip} onPress={onDone} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
      </TouchableOpacity>

      <View style={[styles.card, { width: width - 48 }]}>
        <View style={styles.iconWrap}>
          <Ionicons name={card.icon} size={56} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t(card.titleKey)}</Text>
        <Text style={styles.body}>{t(card.bodyKey)}</Text>
      </View>

      <View style={styles.dots}>
        {CARDS.map((c, i) => (
          <View key={c.titleKey} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={() => (isLast ? onDone() : setIndex(index + 1))}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>{isLast ? t('onboarding.start') : t('onboarding.next')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  skip: { position: 'absolute', top: 56, right: 24 },
  skipText: { fontSize: 15, color: colors.textSecondary, fontWeight: '500' },
  card: { alignItems: 'center' },
  iconWrap: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center', marginBottom: 28,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  dots: { flexDirection: 'row', gap: 8, marginTop: 40, marginBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 22 },
  button: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', alignSelf: 'stretch', marginHorizontal: 24,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
