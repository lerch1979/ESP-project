import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { invoiceAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import StatusBadge from '../../components/StatusBadge';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';

const statusConfig = {
  draft: { label: 'Piszkozat', color: colors.textSecondary },
  sent: { label: 'Elküldve', color: colors.info },
  paid: { label: 'Kifizetve', color: colors.success },
  overdue: { label: 'Lejárt', color: colors.error },
  cancelled: { label: 'Visszavonva', color: colors.textLight },
  pending: { label: 'Függőben', color: colors.warning },
};

function formatAmount(amount, currency = 'HUF') {
  if (!amount) return '0 Ft';
  const num = parseFloat(amount);
  if (currency === 'HUF') {
    return num.toLocaleString('hu-HU') + ' Ft';
  }
  return num.toLocaleString('hu-HU', { style: 'currency', currency });
}

export default function InvoiceDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchInvoice = useCallback(async () => {
    try {
      setError(null);
      const response = await invoiceAPI.getById(id);
      setInvoice(response.data?.invoice || response.data);
    } catch (err) {
      setError('Nem sikerült betölteni a számla adatait');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  useEffect(() => {
    if (invoice?.invoice_number) {
      navigation.setOptions({ title: invoice.invoice_number });
    }
  }, [invoice?.invoice_number, navigation]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchInvoice();
  }, [fetchInvoice]);

  const handleShare = () => {
    Alert.alert('Megosztás', 'A megosztás funkció hamarosan elérhető lesz.');
  };

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={fetchInvoice} />;
  if (!invoice) return null;

  const status = statusConfig[invoice.payment_status] || statusConfig.draft;
  const isOverdue = invoice.due_date && new Date(invoice.due_date) < new Date() && invoice.payment_status !== 'paid';
  const lineItems = invoice.line_items ? (typeof invoice.line_items === 'string' ? JSON.parse(invoice.line_items) : invoice.line_items) : [];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
          <StatusBadge label={status.label} color={status.color} />
        </View>

        <Text style={styles.totalAmount}>
          {formatAmount(invoice.total_amount || invoice.amount, invoice.currency)}
        </Text>

        {invoice.amount && invoice.vat_amount ? (
          <View style={styles.amountBreakdown}>
            <Text style={styles.breakdownText}>
              Nettó: {formatAmount(invoice.amount, invoice.currency)}
            </Text>
            <Text style={styles.breakdownText}>
              ÁFA: {formatAmount(invoice.vat_amount, invoice.currency)}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.shareButton} onPress={handleShare} activeOpacity={0.7}>
          <Ionicons name="share-outline" size={18} color={colors.primary} />
          <Text style={styles.shareText}>Megosztás</Text>
        </TouchableOpacity>
      </View>

      {/* Client / Vendor Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Szállító / Ügyfél</Text>
        <View style={styles.infoGrid}>
          {(invoice.vendor_name || invoice.client_name) && (
            <View style={styles.infoItem}>
              <Ionicons name="business-outline" size={16} color={colors.textLight} />
              <View>
                <Text style={styles.infoLabel}>Név</Text>
                <Text style={styles.infoValue}>{invoice.vendor_name || invoice.client_name}</Text>
              </View>
            </View>
          )}
          {invoice.vendor_tax_number && (
            <View style={styles.infoItem}>
              <Ionicons name="document-outline" size={16} color={colors.textLight} />
              <View>
                <Text style={styles.infoLabel}>Adószám</Text>
                <Text style={styles.infoValue}>{invoice.vendor_tax_number}</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Dates & Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Részletek</Text>
        <View style={styles.infoGrid}>
          {invoice.invoice_date && (
            <View style={styles.infoItem}>
              <Ionicons name="document-text-outline" size={16} color={colors.textLight} />
              <View>
                <Text style={styles.infoLabel}>Számla dátuma</Text>
                <Text style={styles.infoValue}>
                  {new Date(invoice.invoice_date).toLocaleDateString('hu-HU')}
                </Text>
              </View>
            </View>
          )}
          {invoice.due_date && (
            <View style={styles.infoItem}>
              <Ionicons
                name="calendar-outline"
                size={16}
                color={isOverdue ? colors.error : colors.textLight}
              />
              <View>
                <Text style={styles.infoLabel}>Fizetési határidő</Text>
                <Text style={[styles.infoValue, isOverdue && styles.overdueValue]}>
                  {new Date(invoice.due_date).toLocaleDateString('hu-HU')}
                  {isOverdue ? ' (lejárt!)' : ''}
                </Text>
              </View>
            </View>
          )}
          {invoice.currency && (
            <View style={styles.infoItem}>
              <Ionicons name="cash-outline" size={16} color={colors.textLight} />
              <View>
                <Text style={styles.infoLabel}>Pénznem</Text>
                <Text style={styles.infoValue}>{invoice.currency}</Text>
              </View>
            </View>
          )}
          {invoice.cost_center_name && (
            <View style={styles.infoItem}>
              <Ionicons name="folder-outline" size={16} color={colors.textLight} />
              <View>
                <Text style={styles.infoLabel}>Költségközpont</Text>
                <Text style={styles.infoValue}>
                  {invoice.cost_center_name}
                  {invoice.cost_center_code ? ` (${invoice.cost_center_code})` : ''}
                </Text>
              </View>
            </View>
          )}
          {invoice.category_name && (
            <View style={styles.infoItem}>
              <Ionicons name="pricetag-outline" size={16} color={colors.textLight} />
              <View>
                <Text style={styles.infoLabel}>Kategória</Text>
                <Text style={styles.infoValue}>{invoice.category_name}</Text>
              </View>
            </View>
          )}
        </View>

        {invoice.description ? (
          <View style={styles.descriptionSection}>
            <Text style={styles.infoLabel}>Leírás</Text>
            <Text style={styles.descriptionText}>{invoice.description}</Text>
          </View>
        ) : null}

        {invoice.notes ? (
          <View style={styles.descriptionSection}>
            <Text style={styles.infoLabel}>Megjegyzések</Text>
            <Text style={styles.descriptionText}>{invoice.notes}</Text>
          </View>
        ) : null}
      </View>

      {/* Payment Info */}
      {invoice.payment_status === 'paid' && invoice.payment_date && (
        <View style={[styles.card, styles.paidCard]}>
          <View style={styles.paidHeader}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.paidTitle}>Kifizetve</Text>
          </View>
          <Text style={styles.paidDate}>
            {new Date(invoice.payment_date).toLocaleDateString('hu-HU')}
          </Text>
        </View>
      )}

      {/* Overdue Warning */}
      {isOverdue && (
        <View style={styles.overdueCard}>
          <Ionicons name="warning" size={20} color={colors.error} />
          <View style={styles.overdueContent}>
            <Text style={styles.overdueTitle}>Lejárt fizetési határidő!</Text>
            <Text style={styles.overdueText}>
              A számla fizetési határideje {new Date(invoice.due_date).toLocaleDateString('hu-HU')}-n lejárt.
            </Text>
          </View>
        </View>
      )}

      {/* Line Items */}
      {lineItems.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tételek ({lineItems.length})</Text>

          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colDescription]}>Leírás</Text>
            <Text style={[styles.tableHeaderText, styles.colQty]}>Menny.</Text>
            <Text style={[styles.tableHeaderText, styles.colPrice]}>Egységár</Text>
            <Text style={[styles.tableHeaderText, styles.colSubtotal]}>Összeg</Text>
          </View>

          {lineItems.map((item, index) => {
            const qty = item.quantity || 1;
            const unitPrice = item.unit_price || item.amount || 0;
            const subtotal = item.subtotal || qty * unitPrice;
            return (
              <View key={index} style={[styles.tableRow, index % 2 === 0 && styles.tableRowEven]}>
                <Text style={[styles.tableCell, styles.colDescription]} numberOfLines={2}>
                  {item.description || item.name || '-'}
                </Text>
                <Text style={[styles.tableCell, styles.colQty]}>{qty}</Text>
                <Text style={[styles.tableCell, styles.colPrice]}>
                  {formatAmount(unitPrice, invoice.currency)}
                </Text>
                <Text style={[styles.tableCell, styles.colSubtotal, styles.subtotalText]}>
                  {formatAmount(subtotal, invoice.currency)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerCard: {
    backgroundColor: colors.white,
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  invoiceNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  totalAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  amountBreakdown: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  breakdownText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    marginTop: 4,
  },
  shareText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  card: {
    backgroundColor: colors.white,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  infoGrid: {
    gap: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoLabel: {
    fontSize: 11,
    color: colors.textLight,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  overdueValue: {
    color: colors.error,
    fontWeight: '600',
  },
  descriptionSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  descriptionText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: 4,
  },
  paidCard: {
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  paidHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  paidTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.success,
  },
  paidDate: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 28,
  },
  overdueCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.errorLight,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  overdueContent: {
    flex: 1,
  },
  overdueTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.error,
    marginBottom: 2,
  },
  overdueText: {
    fontSize: 13,
    color: colors.error,
    lineHeight: 18,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
    marginBottom: 4,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textLight,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    alignItems: 'center',
  },
  tableRowEven: {
    backgroundColor: colors.background,
    borderRadius: 4,
  },
  tableCell: {
    fontSize: 13,
    color: colors.text,
  },
  colDescription: {
    flex: 3,
    paddingRight: 8,
  },
  colQty: {
    flex: 1,
    textAlign: 'center',
  },
  colPrice: {
    flex: 2,
    textAlign: 'right',
    paddingRight: 8,
  },
  colSubtotal: {
    flex: 2,
    textAlign: 'right',
  },
  subtotalText: {
    fontWeight: '600',
  },
  bottomPadding: {
    height: 20,
  },
});
