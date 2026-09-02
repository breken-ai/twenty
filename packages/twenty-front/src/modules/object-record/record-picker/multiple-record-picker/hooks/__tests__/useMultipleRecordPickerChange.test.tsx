import { act, renderHook, waitFor } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import { useMultipleRecordPickerChange } from '@/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerChange';
import { MultipleRecordPickerComponentInstanceContext } from '@/object-record/record-picker/multiple-record-picker/states/contexts/MultipleRecordPickerComponentInstanceContext';
import { multipleRecordPickerPickableMorphItemsComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerPickableMorphItemsComponentState';
import { type RecordPickerOnChange } from '@/object-record/record-picker/types/RecordPickerOnChange';
import { type RecordPickerPickableMorphItem } from '@/object-record/record-picker/types/RecordPickerPickableMorphItem';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar');

const enqueueErrorSnackBar = jest.fn();
const componentInstanceId = 'multiple-record-picker-test';

const createMorphItem = (
  isSelected: boolean,
  recordId = 'record-id',
): RecordPickerPickableMorphItem => ({
  recordId,
  objectMetadataId: 'object-metadata-id',
  isSelected,
  isMatchingSearchFilter: true,
});

const createDeferred = () => {
  let resolve = () => {};
  let reject = (_error: Error) => {};
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
};

describe('useMultipleRecordPickerChange', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useSnackBar).mockReturnValue({
      enqueueErrorSnackBar,
    } as unknown as ReturnType<typeof useSnackBar>);
  });

  const setup = ({
    initialMorphItems = [createMorphItem(false)],
    onChange,
  }: {
    initialMorphItems?: RecordPickerPickableMorphItem[];
    onChange: RecordPickerOnChange;
  }) => {
    const store = createStore();
    const morphItemsState =
      multipleRecordPickerPickableMorphItemsComponentState.atomFamily({
        instanceId: componentInstanceId,
      });

    store.set(morphItemsState, initialMorphItems);

    const Wrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>
        <MultipleRecordPickerComponentInstanceContext.Provider
          value={{ instanceId: componentInstanceId }}
        >
          {children}
        </MultipleRecordPickerComponentInstanceContext.Provider>
      </JotaiProvider>
    );
    const renderChangeHook = () =>
      renderHook(() => useMultipleRecordPickerChange({ onChange }), {
        wrapper: Wrapper,
      });

    return {
      getIsSelected: (recordId = 'record-id') =>
        store.get(morphItemsState).find((item) => item.recordId === recordId)
          ?.isSelected,
      renderChangeHook,
      ...renderChangeHook(),
    };
  };

  it('serializes rapid changes across picker remounts', async () => {
    const selection = createDeferred();
    const deselection = createDeferred();
    const onChange = jest
      .fn()
      .mockReturnValueOnce(selection.promise)
      .mockReturnValueOnce(deselection.promise);
    const picker = setup({ onChange });

    let selectionResult = Promise.resolve();

    act(() => {
      selectionResult = picker.result.current.handleChange(
        createMorphItem(true),
      );
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    picker.unmount();

    const remountedPicker = picker.renderChangeHook();
    let deselectionResult = Promise.resolve();

    act(() => {
      deselectionResult = remountedPicker.result.current.handleChange(
        createMorphItem(false),
      );
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(picker.getIsSelected()).toBe(false);

    await act(async () => {
      selection.resolve();
      await selectionResult;
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(onChange).toHaveBeenLastCalledWith(createMorphItem(false));

    await act(async () => {
      deselection.resolve();
      await deselectionResult;
    });
  });

  it('runs changes for different records independently', async () => {
    const firstSelection = createDeferred();
    const onChange = jest.fn(({ recordId }) =>
      recordId === 'first-record' ? firstSelection.promise : Promise.resolve(),
    );
    const picker = setup({
      initialMorphItems: [
        createMorphItem(false, 'first-record'),
        createMorphItem(false, 'second-record'),
      ],
      onChange,
    });
    let firstSelectionResult = Promise.resolve();
    let secondSelectionResult = Promise.resolve();

    act(() => {
      firstSelectionResult = picker.result.current.handleChange(
        createMorphItem(true, 'first-record'),
      );
      secondSelectionResult = picker.result.current.handleChange(
        createMorphItem(true, 'second-record'),
      );
    });

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(picker.getIsSelected('first-record')).toBe(true);
    expect(picker.getIsSelected('second-record')).toBe(true);

    await act(async () => {
      await secondSelectionResult;
      firstSelection.resolve();
      await firstSelectionResult;
    });
  });

  it('rolls back the latest failed change', async () => {
    const selection = createDeferred();
    const onChange = jest.fn(() => selection.promise);
    const picker = setup({ onChange });
    let selectionResult = Promise.resolve();

    act(() => {
      selectionResult = picker.result.current.handleChange(
        createMorphItem(true),
      );
    });
    expect(picker.getIsSelected()).toBe(true);

    await act(async () => {
      selection.reject(new Error('Create failed'));
      await selectionResult;
    });

    expect(picker.getIsSelected()).toBe(false);
    expect(enqueueErrorSnackBar).toHaveBeenCalledWith({
      apolloError: expect.any(Error),
    });
  });

  it('rolls a failed deselection back to the preceding successful selection', async () => {
    const selection = createDeferred();
    const deselection = createDeferred();
    const onChange = jest
      .fn()
      .mockReturnValueOnce(selection.promise)
      .mockReturnValueOnce(deselection.promise);
    const picker = setup({ onChange });
    let selectionResult = Promise.resolve();
    let deselectionResult = Promise.resolve();

    act(() => {
      selectionResult = picker.result.current.handleChange(
        createMorphItem(true),
      );
      deselectionResult = picker.result.current.handleChange(
        createMorphItem(false),
      );
    });

    await act(async () => {
      selection.resolve();
      await selectionResult;
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));

    await act(async () => {
      deselection.reject(new Error('Delete failed'));
      await deselectionResult;
    });

    expect(picker.getIsSelected()).toBe(true);
    expect(enqueueErrorSnackBar).toHaveBeenCalledWith({
      apolloError: expect.any(Error),
    });
  });

  it('does not roll back or report a stale failure', async () => {
    const selection = createDeferred();
    const onChange = jest
      .fn()
      .mockReturnValueOnce(selection.promise)
      .mockResolvedValueOnce(undefined);
    const picker = setup({ onChange });
    let selectionResult = Promise.resolve();
    let deselectionResult = Promise.resolve();

    act(() => {
      selectionResult = picker.result.current.handleChange(
        createMorphItem(true),
      );
      deselectionResult = picker.result.current.handleChange(
        createMorphItem(false),
      );
    });

    await act(async () => {
      selection.reject(new Error('Create failed'));
      await Promise.all([selectionResult, deselectionResult]);
    });

    expect(picker.getIsSelected()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(enqueueErrorSnackBar).not.toHaveBeenCalled();
  });
});
