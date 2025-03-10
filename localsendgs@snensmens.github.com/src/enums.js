export const TransferState = {
    OPEN: 0,
    FINISHED: 1,
};

export class AcceptPolicy {
    static EVERYONE = 0;
    static FAVORITES_ONLY = 1;

    static doesAccept(policy, isFavorite) {
      return (policy === AcceptPolicy.EVERYONE || isFavorite);
    }
};

export class QuickSavePolicy {
    static NEVER = 0;
    static FAVORITES_ONLY = 1;
    static ALWAYS = 2;

    static allowsQuickSave(policy, isFavorite) {
      return policy === QuickSavePolicy.ALWAYS || (policy === QuickSavePolicy.FAVORITES_ONLY && isFavorite);
    }
};

export class PinPolicy {
    static NEVER = 0;
    static IF_NOT_FAVORITE = 1;
    static ALWAYS = 2;

    static requiresPin(policy, isFavorite) {
      return policy === PinPolicy.ALWAYS || (policy === PinPolicy.IF_NOT_FAVORITE && !isFavorite);
    }
};
