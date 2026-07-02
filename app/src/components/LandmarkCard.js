/**
 * Horizontal carousel card for the bottom sheet strip (Shaka Guide style).
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';

const CARD_WIDTH = 260;

export function LandmarkCard({ landmark, active, onPress, onOpen }) {
  return (
    <TouchableOpacity
      style={[styles.card, active && styles.cardActive]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      {landmark.image_url ? (
        <Image source={{ uri: landmark.image_url }} style={styles.thumb} />
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Text style={styles.thumbIcon}>🏛</Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{landmark.name}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {(landmark.distance_m / 1000).toFixed(1)} km
          {landmark.category ? ` · ${landmark.category}` : ''}
        </Text>

        <TouchableOpacity style={styles.detailBtn} onPress={onOpen}>
          <Text style={styles.detailBtnText}>
            {landmark.content_count > 0 ? '🎧 Listen' : 'Details'}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export { CARD_WIDTH };

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH, flexDirection: 'row', gap: 10,
    backgroundColor: '#fff', borderRadius: 16, padding: 10,
    marginRight: 12, borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  cardActive: { borderColor: '#2563EB' },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#E5E7EB' },
  thumbPlaceholder: {
    width: 64, height: 64, borderRadius: 10, backgroundColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  thumbIcon: { fontSize: 26 },
  info: { flex: 1, justifyContent: 'center', gap: 3 },
  name: { fontSize: 14, fontWeight: '700', color: '#111827' },
  meta: { fontSize: 11, color: '#6B7280' },
  detailBtn: {
    alignSelf: 'flex-start', backgroundColor: '#EFF6FF',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 4,
  },
  detailBtnText: { fontSize: 11, fontWeight: '700', color: '#2563EB' },
});
