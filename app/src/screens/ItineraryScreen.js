/**
 * Multi-day itinerary builder.
 * Form: origin, number of days, travel mode, interests -> POST /itinerary/build.
 * Results: day-by-day stop list, each day hands off to the existing TourScreen
 * unchanged (itinerary[i] already satisfies TourScreen's {points, landmarks} contract).
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { api } from '../services/api';
import { useLocation } from '../hooks/useLocation';
import { PlaceAutocomplete } from '../components/PlaceAutocomplete';
import { LandmarkCard } from '../components/LandmarkCard';

const MODES = [
  { key: 'walking', label: '🚶 Walk' },
  { key: 'cycling', label: '🚲 Bike' },
  { key: 'driving', label: '🚗 Drive' },
  { key: 'transit', label: '🚌 Transit' },
];

const INTERESTS = ['History', 'Art', 'Architecture', 'Nature', 'Religious', 'Museum', 'Bridge', 'Park'];

export function ItineraryScreen({ route: navRoute, navigation }) {
  const gpsOrigin = navRoute.params?.origin;
  const { location: liveLocation } = useLocation();

  const [origin, setOrigin] = useState(gpsOrigin ?? null);
  const [days, setDays] = useState(3);
  const [mode, setMode] = useState('walking');
  const [interests, setInterests] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  function useCurrentLocation() {
    if (liveLocation) setOrigin(liveLocation);
  }

  function toggleInterest(tag) {
    setInterests((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleBuild() {
    if (!origin) {
      setError('Choose a starting point first');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await api.itinerary.build(origin, days, mode, interests);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleStartDay(day) {
    navigation.navigate('Tour', { route: day, origin });
  }

  if (result) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
        <TouchableOpacity style={styles.backLink} onPress={() => setResult(null)}>
          <Text style={styles.backLinkText}>← Adjust parameters</Text>
        </TouchableOpacity>

        {result.low_data && (
          <View style={styles.lowDataBanner}>
            <Text style={styles.lowDataText}>
              ⚠ Not enough nearby landmarks to fill every day — showing the best available.
            </Text>
          </View>
        )}

        {result.itinerary.map((day) => (
          <View key={day.day} style={styles.daySection}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayTitle}>Day {day.day}</Text>
              <Text style={styles.dayMeta}>
                {day.stop_count} stop{day.stop_count === 1 ? '' : 's'}
                {day.stop_count > 0 ? ` · ~${day.estimated_duration_minutes} min` : ''}
              </Text>
            </View>

            {day.stop_count === 0 ? (
              <Text style={styles.emptyDay}>No landmarks found in range for this day.</Text>
            ) : (
              <>
                {day.landmarks.map((lm) => (
                  <View key={lm.id} style={styles.cardWrap}>
                    <LandmarkCard
                      landmark={lm}
                      onPress={() => navigation.navigate('LandmarkDetail', { landmark: lm })}
                      onOpen={() => navigation.navigate('LandmarkDetail', { landmark: lm })}
                    />
                  </View>
                ))}
                <TouchableOpacity style={styles.startBtn} onPress={() => handleStartDay(day)}>
                  <Text style={styles.startBtnText}>Start Day {day.day} →</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <Text style={styles.sectionLabel}>Starting point</Text>
      <PlaceAutocomplete
        placeholder="Search a starting point..."
        value={origin?.name}
        onSelect={(place) => place && setOrigin(place)}
      />
      <TouchableOpacity style={styles.gpsLink} onPress={useCurrentLocation}>
        <Text style={styles.gpsLinkText}>📍 Use my current location</Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Number of days</Text>
      <View style={styles.stepperRow}>
        <TouchableOpacity
          style={styles.stepperBtn}
          onPress={() => setDays((d) => Math.max(1, d - 1))}
        >
          <Text style={styles.stepperBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{days}</Text>
        <TouchableOpacity
          style={styles.stepperBtn}
          onPress={() => setDays((d) => Math.min(7, d + 1))}
        >
          <Text style={styles.stepperBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Travel mode</Text>
      <View style={styles.modeRow}>
        {MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            style={[styles.modeChip, mode === m.key && styles.modeChipActive]}
            onPress={() => setMode(m.key)}
          >
            <Text style={[styles.modeChipText, mode === m.key && styles.modeChipTextActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Interests (optional)</Text>
      <View style={styles.interestRow}>
        {INTERESTS.map((tag) => {
          const active = interests.includes(tag);
          return (
            <TouchableOpacity
              key={tag}
              style={[styles.interestChip, active && styles.interestChipActive]}
              onPress={() => toggleInterest(tag)}
            >
              <Text style={[styles.interestChipText, active && styles.interestChipTextActive]}>
                {tag}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.buildBtn} onPress={handleBuild} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buildBtnText}>Build Itinerary</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  inner: { padding: 18, paddingBottom: 40 },

  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase',
    letterSpacing: 1, marginTop: 20, marginBottom: 10,
  },

  gpsLink: { marginTop: 8 },
  gpsLinkText: { color: '#2563EB', fontWeight: '600', fontSize: 13 },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  stepperBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  stepperBtnText: { fontSize: 20, fontWeight: '700', color: '#2563EB' },
  stepperValue: { fontSize: 20, fontWeight: '800', color: '#111827', minWidth: 24, textAlign: 'center' },

  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeChip: {
    backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
  },
  modeChipActive: { backgroundColor: '#2563EB' },
  modeChipText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  modeChipTextActive: { color: '#fff' },

  interestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  interestChip: {
    backgroundColor: '#F3F4F6', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7,
  },
  interestChipActive: { backgroundColor: '#DBEAFE' },
  interestChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  interestChipTextActive: { color: '#1D4ED8' },

  error: { color: '#DC2626', fontSize: 13, marginTop: 16 },

  buildBtn: {
    backgroundColor: '#2563EB', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24,
  },
  buildBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  backLink: { marginBottom: 8 },
  backLinkText: { color: '#2563EB', fontWeight: '600', fontSize: 14 },

  lowDataBanner: {
    backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#F59E0B', marginBottom: 16,
  },
  lowDataText: { color: '#92400E', fontSize: 13 },

  daySection: { marginBottom: 26 },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10,
  },
  dayTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  dayMeta: { fontSize: 12, color: '#6B7280' },
  emptyDay: { color: '#9CA3AF', fontStyle: 'italic', fontSize: 13 },

  cardWrap: { marginBottom: 10 },

  startBtn: {
    backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4,
  },
  startBtnText: { color: '#2563EB', fontWeight: '700', fontSize: 14 },
});
