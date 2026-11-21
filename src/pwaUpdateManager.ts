type ApplyUpdate = () => Promise<void>;
type UpdateListener = (available: boolean) => void;

let applyUpdate: ApplyUpdate | null = null;
const listeners = new Set<UpdateListener>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(applyUpdate !== null);
  }
}

export const PwaUpdateManager = {
  subscribe(listener: UpdateListener): () => void {
    listeners.add(listener);
    listener(applyUpdate !== null);
    return () => listeners.delete(listener);
  },

  notifyAvailable(callback: ApplyUpdate): void {
    applyUpdate = callback;
    notifyListeners();
  },

  async apply(): Promise<void> {
    if (applyUpdate) await applyUpdate();
  },
};
