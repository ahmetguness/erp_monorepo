// apps/mobile/src/features/approvals/components/SwipeableApprovalItem.tsx

import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { SwipeableActionRow } from '../../../design-system/feedback/SwipeableActionRow';
import { ApprovalCard, ApprovalCardProps } from '../../../components/approvals/ApprovalCard';
import { ApprovalRequest } from '../../../services/approval.service';

export interface SwipeableApprovalItemProps extends Omit<ApprovalCardProps, 'onPress'> {
  onPress: (request: ApprovalRequest) => void;
  style?: ViewStyle;
}

export const SwipeableApprovalItem: React.FC<SwipeableApprovalItemProps> = ({
  request,
  isSelectionMode,
  isSelected,
  isActing,
  onPress,
  onApprove,
  onReject,
  onToggleSelect,
  style,
}) => {
  const isPending = request.status === 'PENDING';

  const card = (
    <ApprovalCard
      request={request}
      isSelectionMode={isSelectionMode}
      isSelected={isSelected}
      isActing={isActing}
      onPress={onPress}
      onApprove={onApprove}
      onReject={onReject}
      onToggleSelect={onToggleSelect}
    />
  );

  // If already completed or in multi-selection mode, disable swipe gestures
  if (!isPending || isSelectionMode) {
    return card;
  }

  return (
    <SwipeableActionRow
      onApprove={() => onApprove(request.id)}
      onReject={() => onReject(request)}
      approveLabel="Hızlı Onayla"
      rejectLabel="Reddet"
    >
      {card}
    </SwipeableActionRow>
  );
};
