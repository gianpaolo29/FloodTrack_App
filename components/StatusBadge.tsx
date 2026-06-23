/**
 * StatusBadge
 * Tinted pill showing report lifecycle state.
 * Color pairs come from colors.status — always bg + contrasting text.
 */
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';

export type ReportStatus = 'pending' | 'verified' | 'assigned' | 'resolved' | 'rejected';

const STATUS_LABELS: Record<ReportStatus, string> = {
  pending:  'Pending review',
  verified: 'Verified',
  assigned: 'Assigned',
  resolved: 'Resolved',
  rejected: 'Rejected',
};

interface Props {
  status: ReportStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: Props) {
  const pair = colors.status[status];
  const fontSize = size === 'sm' ? 11 : 12;
  const px = size === 'sm' ? 8 : 10;
  const py = size === 'sm' ? 3 : 4;

  return (
    <View
      style={[styles.badge, { backgroundColor: pair.bg, paddingHorizontal: px, paddingVertical: py }]}
      accessibilityLabel={`Status: ${STATUS_LABELS[status]}`}
      accessibilityRole="text"
    >
      <Text style={[styles.text, { color: pair.text, fontSize }]}>
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
