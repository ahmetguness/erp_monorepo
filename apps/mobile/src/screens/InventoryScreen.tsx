import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ScreenWrapper, Header, Card, EmptyState, Badge, Button } from '../components/common';
import { useTheme } from '../theme';
import { Ionicons } from '@expo/vector-icons';

export default function InventoryScreen() {
  const { theme } = useTheme();

  return (
    <ScreenWrapper scrollable>
      <Header
        title="Stok & Depo"
        subtitle="Barkod tarama, depo sayımı ve transferler"
        rightAction={
          <Button
            title="Barkod Tara"
            size="sm"
            variant="primary"
            leftIcon={<Ionicons name="camera-outline" size={16} color={theme.colors.white} />}
            onPress={() => {}}
          />
        }
      />
      <View style={styles.container}>
        <Card variant="outlined" style={styles.infoCard}>
          <View style={styles.row}>
            <Text style={[styles.infoTitle, { color: theme.colors.text }]}>
              Kamera & Barkod Desteği
            </Text>
            <Badge label="Faz 4 Hazırlığı" variant="warning" size="sm" />
          </View>
          <Text style={[styles.infoText, { color: theme.colors.textMuted }]}>
            Depo görevlileri kamera ile EAN-13/QR okutarak anlık stok miktarı görebilecek, hızlı sayım ve depolar arası transfer yapabilecektir.
          </Text>
        </Card>

        <EmptyState
          icon="barcode-outline"
          title="Stok İşlemi Seçin"
          description="Depolarınızdaki ürünleri incelemek veya yeni sayım başlatmak için yukarıdaki barkod tara butonunu kullanabilirsiniz."
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  infoCard: {
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  infoText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
