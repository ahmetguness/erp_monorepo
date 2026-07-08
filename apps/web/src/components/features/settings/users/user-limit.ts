export interface UserLimitState {
  maxUsers: number | null;
  activeUsers: number;
  pendingInvites: number;
  reservedUsers: number;
  remainingSlots: number | null;
  usagePercent: number;
  isLimited: boolean;
  isFull: boolean;
  isInviteBlocked: boolean;
}

export function getUserLimitState(input: {
  maxUsers: number | null;
  activeUsers: number;
  pendingInvites: number;
}): UserLimitState {
  const reservedUsers = input.activeUsers + input.pendingInvites;
  if (input.maxUsers === null) {
    return {
      maxUsers: null,
      activeUsers: input.activeUsers,
      pendingInvites: input.pendingInvites,
      reservedUsers,
      remainingSlots: null,
      usagePercent: 0,
      isLimited: false,
      isFull: false,
      isInviteBlocked: false,
    };
  }

  const remainingSlots = Math.max(input.maxUsers - reservedUsers, 0);
  const usagePercent = Math.min(100, Math.round((reservedUsers / input.maxUsers) * 100));

  return {
    maxUsers: input.maxUsers,
    activeUsers: input.activeUsers,
    pendingInvites: input.pendingInvites,
    reservedUsers,
    remainingSlots,
    usagePercent,
    isLimited: true,
    isFull: remainingSlots === 0,
    isInviteBlocked: remainingSlots === 0,
  };
}
