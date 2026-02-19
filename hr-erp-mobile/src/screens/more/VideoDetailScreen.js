import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { videosAPI } from '../../services/api';

const CATEGORY_LABELS = {
  munkabiztonság: 'Munkabiztonság',
  beilleszkedés: 'Beilleszkedés',
  nyelvi_kurzus: 'Nyelvi kurzus',
  adminisztráció: 'Adminisztráció',
  szakmai_kepzes: 'Szakmai képzés',
  ceg_info: 'Céginformáció',
};

const CATEGORY_COLORS = {
  munkabiztonság: '#dc2626',
  beilleszkedés: '#2563eb',
  nyelvi_kurzus: '#7c3aed',
  adminisztráció: '#f59e0b',
  szakmai_kepzes: '#0891b2',
  ceg_info: '#16a34a',
};

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getEmbedUrl(url) {
  if (!url) return null;

  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&playsinline=1`;

  // Vimeo
  const vimeoMatch = url.match(/(?:vimeo\.com\/)(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;

  return url;
}

export default function VideoDetailScreen({ route }) {
  const { videoId } = route.params;
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadVideo();
  }, [videoId]);

  const loadVideo = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await videosAPI.getById(videoId);
      setVideo(result.data);
      // Record view
      videosAPI.recordView(videoId).catch(() => {});
    } catch (err) {
      setError('Videó betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkCompleted = async () => {
    try {
      await videosAPI.recordView(videoId, { completed: true });
      // Show brief feedback by reloading
      loadVideo();
    } catch (err) {
      // ignore
    }
  };

  if (loading) {
    return (
      <View style={styles.centerLoader}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !video) {
    return (
      <View style={styles.centerLoader}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textLight} />
        <Text style={styles.errorText}>{error || 'Videó nem található'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadVideo}>
          <Text style={styles.retryText}>Újra</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const embedUrl = getEmbedUrl(video.url);
  const catColor = CATEGORY_COLORS[video.category] || '#94a3b8';

  return (
    <ScrollView style={styles.container} bounces={false}>
      {/* WebView Player */}
      <View style={styles.playerContainer}>
        <WebView
          source={{ uri: embedUrl }}
          style={styles.player}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={styles.webViewLoader}>
              <ActivityIndicator size="large" color={colors.white} />
            </View>
          )}
        />
      </View>

      {/* Video info card */}
      <View style={styles.infoCard}>
        <Text style={styles.title}>{video.title}</Text>

        <View style={styles.metaRow}>
          <View style={[styles.categoryChip, { backgroundColor: catColor + '18' }]}>
            <Text style={[styles.categoryText, { color: catColor }]}>
              {CATEGORY_LABELS[video.category] || video.category}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.metaText}>{formatDuration(video.duration)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="eye-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.metaText}>{video.view_count || 0}</Text>
          </View>
        </View>

        {video.description ? (
          <Text style={styles.description}>{video.description}</Text>
        ) : null}

        <Text style={styles.date}>
          {new Date(video.created_at).toLocaleDateString('hu-HU')}
        </Text>
      </View>

      {/* Mark completed button */}
      <TouchableOpacity style={styles.completedButton} onPress={handleMarkCompleted} activeOpacity={0.7}>
        <Ionicons name="checkmark-circle" size={20} color={colors.white} />
        <Text style={styles.completedButtonText}>Megtekintve</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  retryText: {
    color: colors.white,
    fontWeight: '600',
  },
  playerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  player: {
    flex: 1,
  },
  webViewLoader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  infoCard: {
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
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  description: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 12,
  },
  date: {
    fontSize: 12,
    color: colors.textLight,
  },
  completedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    marginHorizontal: 16,
    marginBottom: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  completedButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
