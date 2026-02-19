import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../../constants/colors';
import { videosAPI } from '../../services/api';
import SearchBar from '../../components/SearchBar';
import FilterChips from '../../components/FilterChips';
import VideoCard from '../../components/VideoCard';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';

const CATEGORY_OPTIONS = [
  { value: null, label: 'Összes' },
  { value: 'munkabiztonság', label: 'Munkabiztonság' },
  { value: 'beilleszkedés', label: 'Beilleszkedés' },
  { value: 'nyelvi_kurzus', label: 'Nyelvi kurzus' },
  { value: 'adminisztráció', label: 'Adminisztráció' },
  { value: 'szakmai_kepzes', label: 'Szakmai képzés' },
  { value: 'ceg_info', label: 'Céginformáció' },
];

export default function VideoListScreen({ navigation }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadVideos = useCallback(async (pageNum = 1, isLoadMore = false) => {
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const params = { page: pageNum, limit: 12 };
      if (search) params.search = search;
      if (category) params.category = category;

      const result = await videosAPI.getAll(params);
      const newVideos = result.data.videos;

      if (isLoadMore) {
        setVideos((prev) => [...prev, ...newVideos]);
      } else {
        setVideos(newVideos);
      }

      setHasMore(newVideos.length === 12);
      setPage(pageNum);
    } catch (err) {
      setError('Videók betöltése sikertelen');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [search, category]);

  useEffect(() => {
    loadVideos(1);
  }, [search, category]);

  const handleEndReached = () => {
    if (!loadingMore && hasMore && !loading) {
      loadVideos(page + 1, true);
    }
  };

  const handleVideoPress = (video) => {
    navigation.navigate('VideoDetail', { videoId: video.id, title: video.title });
  };

  const renderItem = ({ item }) => (
    <VideoCard video={item} onPress={() => handleVideoPress(item)} />
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SearchBar placeholder="Keresés videók között..." onSearch={setSearch} />
      <FilterChips options={CATEGORY_OPTIONS} selected={category} onSelect={setCategory} />

      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={() => loadVideos(1)} />
      ) : videos.length === 0 ? (
        <EmptyState icon="videocam-outline" message="Nincs találat" />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
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
  },
  listContent: {
    paddingBottom: 20,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
