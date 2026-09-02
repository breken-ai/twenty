import { isErrorLike } from '@apollo/client/errors';
import { useStore } from 'jotai';
import { useCallback } from 'react';

import { MultipleRecordPickerComponentInstanceContext } from '@/object-record/record-picker/multiple-record-picker/states/contexts/MultipleRecordPickerComponentInstanceContext';
import { multipleRecordPickerPickableMorphItemsComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerPickableMorphItemsComponentState';
import { upsertMorphItem } from '@/object-record/record-picker/multiple-record-picker/utils/upsertMorphItem';
import { type RecordPickerOnChange } from '@/object-record/record-picker/types/RecordPickerOnChange';
import { type RecordPickerPickableMorphItem } from '@/object-record/record-picker/types/RecordPickerPickableMorphItem';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useAvailableComponentInstanceIdOrThrow } from '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow';
import { useAtomComponentStateCallbackState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState';

type ChangeQueue = {
  confirmedIsSelected: boolean;
  pendingChange: Promise<void>;
};

const changeQueuesByStore = new WeakMap<
  ReturnType<typeof useStore>,
  Map<string, ChangeQueue>
>();

export const useMultipleRecordPickerChange = ({
  onChange,
}: {
  onChange?: RecordPickerOnChange;
}) => {
  const store = useStore();
  const { enqueueErrorSnackBar } = useSnackBar();
  const componentInstanceId = useAvailableComponentInstanceIdOrThrow(
    MultipleRecordPickerComponentInstanceContext,
  );
  const morphItemsState = useAtomComponentStateCallbackState(
    multipleRecordPickerPickableMorphItemsComponentState,
    componentInstanceId,
  );

  const handleChange = useCallback(
    (morphItem: RecordPickerPickableMorphItem) => {
      const previousMorphItem = store
        .get(morphItemsState)
        .find(({ recordId }) => recordId === morphItem.recordId);

      store.set(morphItemsState, (morphItems) =>
        upsertMorphItem(morphItems, morphItem),
      );

      const queues =
        changeQueuesByStore.get(store) ?? new Map<string, ChangeQueue>();
      const queueKey = `${componentInstanceId}:${morphItem.recordId}`;
      const existingQueue = queues.get(queueKey);
      const runChange = async () => onChange?.(morphItem);
      const pendingChange = existingQueue
        ? existingQueue.pendingChange.catch(() => undefined).then(runChange)
        : runChange();
      const queue = existingQueue ?? {
        confirmedIsSelected: previousMorphItem?.isSelected ?? false,
        pendingChange,
      };

      queue.pendingChange = pendingChange;
      queues.set(queueKey, queue);
      changeQueuesByStore.set(store, queues);

      return pendingChange.then(
        () => {
          queue.confirmedIsSelected = morphItem.isSelected;

          if (queue.pendingChange === pendingChange) {
            queues.delete(queueKey);
          }
        },
        (error: unknown) => {
          if (queue.pendingChange === pendingChange) {
            store.set(morphItemsState, (morphItems) =>
              morphItems.map((currentMorphItem) =>
                currentMorphItem.recordId === morphItem.recordId
                  ? {
                      ...currentMorphItem,
                      isSelected: queue.confirmedIsSelected,
                    }
                  : currentMorphItem,
              ),
            );
            enqueueErrorSnackBar(
              isErrorLike(error) ? { apolloError: error } : {},
            );
            queues.delete(queueKey);
          }
        },
      );
    },
    [
      componentInstanceId,
      enqueueErrorSnackBar,
      morphItemsState,
      onChange,
      store,
    ],
  );

  return { handleChange };
};
