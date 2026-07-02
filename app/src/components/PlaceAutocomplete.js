/**
 * Google Maps-style place search box.
 * Debounced text -> Nominatim (via backend proxy) -> tap a result to resolve
 * a named place into { name, lat, lon }.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList,
} from 'react-native';
import { api } from '../services/api';

const DEBOUNCE_MS = 400;

export function PlaceAutocomplete({ value, onSelect, placeholder }) {
  const [query, setQuery] = useState(value ?? '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => setQuery(value ?? ''), [value]);

  function handleChangeText(text) {
    setQuery(text);
    setOpen(true);
    onSelect(null); // typing invalidates a previous selection

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { places } = await api.geocode.search(text.trim());
        setResults(places);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  }

  function handlePick(place) {
    setQuery(place.name);
    setResults([]);
    setOpen(false);
    onSelect(place);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <Text style={styles.icon}>📍</Text>
        <TextInput
          style={styles.input}
          placeholder={placeholder ?? 'Search a place...'}
          value={query}
          onChangeText={handleChangeText}
          onFocus={() => setOpen(true)}
          returnKeyType="search"
        />
        {loading && <ActivityIndicator size="small" color="#2563EB" />}
      </View>

      {open && results.length > 0 && (
        <View style={styles.dropdown}>
          <FlatList
            data={results}
            keyExtractor={(item, idx) => `${item.lat},${item.lon},${idx}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.resultRow} onPress={() => handlePick(item)}>
                <Text style={styles.resultIcon}>📍</Text>
                <Text style={styles.resultText} numberOfLines={2}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', zIndex: 20 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  icon: { fontSize: 14 },
  input: { flex: 1, fontSize: 15, color: '#111827', padding: 0 },

  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
    backgroundColor: '#fff', borderRadius: 10, maxHeight: 220,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 8,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  resultIcon: { fontSize: 12, marginTop: 2 },
  resultText: { flex: 1, fontSize: 13, color: '#374151' },
});
