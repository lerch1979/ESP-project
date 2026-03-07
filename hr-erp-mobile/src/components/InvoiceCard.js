import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import StatusBadge from './StatusBadge';

const statusConfig = {
  draft: { label: 'Piszkozat', color: colors.textSecondary },
  sent: { label: 'Elküldve', color: colors.info },
  paid: { label: 'Kifizetve', color: colors.success },
  overdue: { label: 'Lejárt', color: colors.error },
  cancelled: { label: 'Visszavonva', color: colors.textLight },
  pending: { label: 'Függőben', color: colors.warning },
};

function formatAmount(amount, currency = 'HUF') {
  if (!amount) return '0';
  const num = parseFloat(amount);
  if (currency === 'HUF') {
    return num.toLocaleString('hu-HU') + ' Ft';
  }
  return num.toLocaleString('hu-HU', { style: 'currency', currency });
}

export default function InvoiceCard({ invoice, onPress, compact = false }) {
  const status = statusConfig[invoice.payment_status] || statusConfig.draft;
  const isOverdue = invoice.due_date && new Date(invoice.due_date) < new Date() && invoice.payment_status !== 'paid';

  if (compact) {
    return (
      <TouchableOpacity style={styles.compactCard} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.compactLeft}>
          <Text style={styles.compactNumber}>{invoice.invoice_number}</Text>
          <Text style={styles.compactVendor} numberOfLines={1}>
            {invoice.vendor_name || invoice.client_name || '-'}
          </Text>
        </View>
        <View style={styles.compactRight}>
          <Text style={styles.compactAmount}>{formatAmount(invoice.amount, invoice.currency)}</Text>
          <StatusBadge label={status.label} color={status.color} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
        <StatusBadge label={status.label} color={status.color} />
      </View>

      <Text style={styles.vendorName} numberOfLines={1}>
        {invoice.vendor_name || invoice.client_name || 'Ismeretlen'}
      </Text>

      <View style={styles.amountRow}>
        <Text style={styles.amount}>{formatAmount(invoice.amount, invoice.currency)}</Text>
        {invoice.total_amount && invoice.total_amount !== invoice.amount && (
          <Text style={styles.totalAmount}>
            Bruttó: {formatAmount(invoice.total_amount, invoice.currency)}
          </Text>
        )}
      </View>

      <View style={styles.footer}>
        {invoice.invoice_date && (
          <View style={styles.metaItem}>
            <Ionicons name="document-text-outline" size={13} color={colors.textLight} />
            <Text style={styles.metaText}>
              {new Date(invoice.invoice_date).toLocaleDateString('hu-HU')}
            </Text>
          </View>
        )}
        {invoice.due_date && (
          <View style={styles.metaItem}>
            <Ionicons
              name="calendar-outline"
              size={13}
              color={isOverdue ? colors.error : colors.textLight}
            />
            <Text style={[styles.metaText, isOverdue && styles.overdueText]}>
              {new Date(invoice.due_date).toLocaleDateString('hu-HU')}
            </Text>
          </View>
        )}
        {invoice.cost_center_name && (
          <View style={styles.metaItem}>
            <Ionicons name="folder-outline" size={13} color={colors.textLight} />
            <Text style={styles.metaText}>{invoice.cost_center_name}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  invoiceNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  vendorName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 6,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 10,
  },
  amount: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  totalAmount: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: colors.textLight,
  },
  overdueText: {
    color: colors.error,
    fontWeight: '600',
  },
  // Compact mode
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 3,
  },
  compactLeft: {
    flex: 1,
    marginRight: 8,
  },
  compactNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  compactVendor: {
    fontSize: 14,
    color: colors.text,
    marginTop: 2,
  },
  compactRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  compactAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
