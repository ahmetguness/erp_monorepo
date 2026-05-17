import React from 'react';
import { View, Text, StyleSheet, Platform, Dimensions, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Logo } from '../components/Logo';
import { ScreenProps } from '../types';

const { width } = Dimensions.get('window');

export default function IntroScreen({ onNext }: ScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Logo size="md" />
      </View>
      
      <View style={styles.content}>
        
        <View style={styles.artboard}>
           <View style={[styles.floatingCard, styles.card1]}>
             <Ionicons name="bar-chart-outline" size={28} color="#2563EB" />
             <Text style={styles.cardText}>Finans</Text>
           </View>
           <View style={[styles.floatingCard, styles.card2]}>
             <Ionicons name="people-outline" size={28} color="#8B5CF6" />
             <Text style={styles.cardText}>İK</Text>
           </View>
           <View style={[styles.floatingCard, styles.card3]}>
             <Ionicons name="business-outline" size={28} color="#10B981" />
             <Text style={styles.cardText}>Operasyon</Text>
           </View>
           
           <View style={styles.centerGlow} />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title}>
            İşletmeniz İçin{'\n'}Akıllı Çözüm
          </Text>
          <Text style={styles.subtitle}>
            Yeni nesil bulut tabanlı ERP sistemi ile tüm süreçlerinizi hızlandırın ve kontrolü elinize alın.
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={onNext} activeOpacity={0.8}>
          <Text style={styles.primaryButtonText}>Giriş Yap</Text>
          <Ionicons name="arrow-forward" size={20} color="#ffffff" style={styles.buttonIcon} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
  },
  artboard: {
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  centerGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#DBEAFE', // blue-100
    opacity: 0.5,
    zIndex: 0,
  },
  floatingCard: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    width: 104,
    height: 104,
  },
  card1: {
    top: 10,
    left: width / 2 - 150,
    transform: [{ rotate: '-8deg' }],
  },
  card2: {
    top: 50,
    right: width / 2 - 140,
    transform: [{ rotate: '12deg' }],
  },
  card3: {
    bottom: 10,
    left: width / 2 - 52,
    transform: [{ rotate: '-4deg' }],
  },
  cardText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  textContainer: {
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 40,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 16,
    letterSpacing: -1.5,
    lineHeight: 44,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    lineHeight: 26,
    paddingRight: 20,
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: Platform.OS === 'ios' ? 16 : 32,
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: '#2563EB',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  buttonIcon: {
    marginLeft: 12,
  },
});
