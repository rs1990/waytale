/**
 * Full-screen search overlay, Shaka Guide style.
 * Filters the already-loaded nearby landmarks client-side (no live search endpoint).
 */

import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, StyleSheet, TouchableOpacity,
  FlatList, Image, SafeAreaView,
} from 'react-native';

export function SearchOverlay({ visible, landmarks, onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');

  const categories = useMemo(() => {
    const set = new Set(landmarks.map((l) => l.category).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [landmarks]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return landmarks.filter((l) => {
      const matchesCategory = category === 'All' || l.category === category;
      const matchesQuery = !q
        || l.name.toLowerCase().includes(q)
        || l.description?.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [landmarks, query, category]);

  function handleClose() {
    setQuery('');
    setCategory('All');
    onClose();
  }

  function handleSelect(landmark) {
    setQuery('');
    setCategory('All');
    onSelect(landmark);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.searchRow}>
          <TouchableOpacity style={styles.backBtn} onPress={handleClose}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={styles.inputWrap}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.input}
              placeholder="Search landmarks, places..."
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Text style={styles.clearIcon}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {categories.length > 1 && (
          <View style={styles.chipRow}>
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

        <FlatList
          data={results}
          keyExtractor={(l) => String(l.id)}
          contentContainerStyle={styles.resultsList}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No landmarks match your search.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.resultRow} onPress={() => handleSelect(item)}>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.resultThumb} />
              ) : (
                <View style={styles.resultThumbPlaceholder}>
                  <Text style={styles.resultThumbIcon}>🏛</Text>
                </View>
              )}
              <View style={styles.resultInfo}>
                <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.resultMeta} numberOfLines={1}>
                  {item.category ? `${item.category} · ` : ''}
                  {(item.distance_m / 1000).toFixed(1)} km away
                </Text>
              </View>
              {item.content_count > 0 && <Text style={styles.audioBadge}>🎧</Text>}
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  backIcon: { fontSize: 22, color: '#111827' },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F3F4F6', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchIcon: { fontSize: 14 },
  input: { flex: 1, fontSize: 15, color: '#111827', padding: 0 },
  clearIcon: { fontSize: 14, color: '#9CA3AF', paddingHorizontal: 4 },

  chipRow: { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  chipList: { paddingHorizontal: 16, gap: 8 },
  chip: {
    backgroundColor: '#F3F4F6', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
  },
  chipActive: { backgroundColor: '#2563EB' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#fff' },

  resultsList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
  },
  resultThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#E5E7EB' },
  resultThumbPlaceholder: {
    width: 52, height: 52, borderRadius: 10, backgroundColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  resultThumbIcon: { fontSize: 22 },
  resultInfo: { flex: 1 },
  resultName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  resultMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  audioBadge: { fontSize: 16 },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#9CA3AF', fontSize: 14 },
});
