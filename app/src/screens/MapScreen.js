/**
 * Phase 1 — Main map screen.
 * GPS position + nearby landmarks from the pre-generated cache.
 * Layout modeled on Shaka Guide: floating search pill + category chips over
 * a full-bleed map, with a horizontal snapping card strip along the bottom.
 * Stub map provider (react-native-maps default = Apple Maps on iOS, Google on Android).
 */

import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList,
} from 'react-native';
import MapView, { Circle } from 'react-native-maps';
import { LandmarkPin } from '../components/LandmarkPin';
import { LandmarkCard, CARD_WIDTH } from '../components/LandmarkCard';
import { SearchOverlay } from '../components/SearchOverlay';
import { useLocation } from '../hooks/useLocation';
import { useNearbyLandmarks } from '../hooks/useNearbyLandmarks';

const GEOFENCE_RADIUS_M = 300;
const CARD_GAP = 12;

export function MapScreen({ navigation }) {
  const { location, error: locError } = useLocation();
  const { landmarks, loading, error: ldmError } = useNearbyLandmarks(location, 5);
  const mapRef = useRef(null);
  const carouselRef = useRef(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [category, setCategory] = useState('All');
  const [selectedId, setSelectedId] = useState(null);

  const categories = useMemo(() => {
    const set = new Set(landmarks.map((l) => l.category).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [landmarks]);

  const filtered = useMemo(
    () => (category === 'All' ? landmarks : landmarks.filter((l) => l.category === category)),
    [landmarks, category],
  );

  // Auto-center on user location once
  const centeredRef = useRef(false);
  React.useEffect(() => {
    if (location && !centeredRef.current && mapRef.current) {
      centeredRef.current = true;
      mapRef.current.animateToRegion({
        latitude: location.lat,
        longitude: location.lon,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 600);
    }
  }, [location]);

  function focusLandmark(landmark) {
    setSelectedId(landmark.id);
    mapRef.current?.animateToRegion({
      latitude: landmark.latitude,
      longitude: landmark.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }, 500);
    const idx = filtered.findIndex((l) => l.id === landmark.id);
    if (idx >= 0) {
      carouselRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    }
  }

  function openDetail(landmark) {
    navigation.navigate('LandmarkDetail', { landmark });
  }

  function onSearchSelect(landmark) {
    setSearchOpen(false);
    setCategory('All');
    focusLandmark(landmark);
  }

  if (locError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Location unavailable</Text>
        <Text style={styles.errorSub}>{locError}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        showsUserLocation
        showsMyLocationButton
        initialRegion={{
          latitude: 37.7749,
          longitude: -122.4194,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
      >
        {location && (
          <Circle
            center={{ latitude: location.lat, longitude: location.lon }}
            radius={GEOFENCE_RADIUS_M}
            fillColor="rgba(37,99,235,0.1)"
            strokeColor="rgba(37,99,235,0.3)"
            strokeWidth={1}
          />
        )}

        {filtered.map((lm) => (
          <LandmarkPin
            key={lm.id}
            landmark={lm}
            selected={lm.id === selectedId}
            onPress={(landmark) => { focusLandmark(landmark); openDetail(landmark); }}
          />
        ))}
      </MapView>

      {/* Search pill + route shortcut */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.searchPill} onPress={() => setSearchOpen(true)}>
          <Text style={styles.searchIcon}>🔍</Text>
          <Text style={styles.searchPlaceholder}>Search landmarks, places...</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.routeBtn}
          onPress={() => navigation.navigate('Route', { origin: location })}
        >
          <Text style={styles.routeBtnIcon}>🧭</Text>
        </TouchableOpacity>
      </View>

      {/* Category chips */}
      {categories.length > 1 && (
        <View style={styles.chipBar}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={categories}
            keyExtractor={(c) => c}
            contentContainerStyle={styles.chipList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.chip, category === item && styles.chipActive]}
                onPress={() => setCategory(item)}
              >
                <Text style={[styles.chipText, category === item && styles.chipTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Loading state */}
      {loading && (
        <View style={styles.loadingChip}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.loadingText}>Loading landmarks...</Text>
        </View>
      )}

      {ldmError && (
        <View style={styles.errorChip}>
          <Text style={styles.errorChipText}>⚠ {ldmError}</Text>
        </View>
      )}

      {/* Bottom carousel of nearby landmarks */}
      {!loading && filtered.length > 0 && (
        <View style={styles.carouselWrap}>
          <FlatList
            ref={carouselRef}
            horizontal
            data={filtered}
            keyExtractor={(l) => String(l.id)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselList}
            snapToInterval={CARD_WIDTH + CARD_GAP}
            decelerationRate="fast"
            getItemLayout={(_, index) => ({
              length: CARD_WIDTH + CARD_GAP, offset: (CARD_WIDTH + CARD_GAP) * index, index,
            })}
            onScrollToIndexFailed={() => {}}
            renderItem={({ item }) => (
              <LandmarkCard
                landmark={item}
                active={item.id === selectedId}
                onPress={() => focusLandmark(item)}
                onOpen={() => openDetail(item)}
              />
            )}
          />
        </View>
      )}

      <SearchOverlay
        visible={searchOpen}
        landmarks={landmarks}
        onClose={() => setSearchOpen(false)}
        onSelect={onSearchSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1 },
  map:           { flex: 1 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:     { fontSize: 18, fontWeight: '700', color: '#DC2626' },
  errorSub:      { color: '#6B7280', marginTop: 6, textAlign: 'center' },

  topBar: {
    position: 'absolute', top: 50, left: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  searchPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 26, paddingHorizontal: 16, paddingVertical: 13,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  searchIcon: { fontSize: 14 },
  searchPlaceholder: { color: '#6B7280', fontSize: 14, fontWeight: '500' },
  routeBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  routeBtnIcon: { fontSize: 18 },

  chipBar: { position: 'absolute', top: 108, left: 0, right: 0 },
  chipList: { paddingHorizontal: 12 },
  chip: {
    backgroundColor: '#fff', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 5, elevation: 3,
  },
  chipActive: { backgroundColor: '#2563EB' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#fff' },

  loadingChip: {
    position: 'absolute', bottom: 150, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  loadingText: { color: '#374151', fontWeight: '500' },
  errorChip: {
    position: 'absolute', bottom: 150, alignSelf: 'center',
    backgroundColor: '#FEF2F2', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
  },
  errorChipText: { color: '#DC2626', fontSize: 12 },

  carouselWrap: { position: 'absolute', bottom: 30, left: 0, right: 0 },
  carouselList: { paddingHorizontal: 12 },
});
