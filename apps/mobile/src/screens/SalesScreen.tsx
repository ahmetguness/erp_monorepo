import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ScreenWrapper, Header, Card, EmptyState, Badge, Button } from '../components/common';
import { useTheme } from '../theme';
import { Ionicons } from '@expo/vector-icons';

export default function SalesScreen() {
  const { theme } = useTheme();

  return (
    <ScreenWrapper scrollable>
      <Header
        title="Saha Satış & CRM"
        subtitle="Müşteri rehberi, anlık sipariş ve tahsilat"
        rightAction={
          <Button
            title="Yeni Sipariş"
            size="sm"
            variant="primary"
            leftIcon={<Ionicons name="add" size={18} color={theme.colors.white} />}
            onPress={() => {}}
          />
        }
      />
      <View style={styles.container}>
        <Card variant="outlined" style={styles.infoCard}>
          <View style={styles.row}>
            <Text style={[styles.infoTitle, { color: theme.colors.text }]}>
              Hızlı Sipariş & Müşteri 360
            </Text>
            <Badge label="Faz 5 Hazırlığı" variant="success" size="sm" />
          </View>
          <Text style={[styles.infoText, { color: theme.colors.textMuted }]}>
            Saha satış temsilcileri müşteri ziyaretinde sepete ürün ekleyip doğrudan sipariş veya teklif oluşturabilecek ve cari bakiye kontrol edebilecektir.
          </Text>
        </Card>

        <EmptyState
          icon="cart-outline"
          title="Henüz Sipariş Yok"
          description="Yeni bir sipariş oluşturmak için yukarıdaki Yeni Sipariş butonuna dokunabilirsiniz."
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
