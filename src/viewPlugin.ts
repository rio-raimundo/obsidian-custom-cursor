import { SelectionRange, Transaction } from "@codemirror/state";
import {
  EditorView,
  PluginValue,
  ViewUpdate,
} from '@codemirror/view';
import SmoothTypingAnimation from './main';

export interface SelectionData {
  head: number;
  anchor: number;
  x: number;
  y: number;
  height: number;
}

enum CursorChangeStates {
  NoChanges, UserInduced, NonUserInduced, FirstSet
}

export class CursorTracker implements PluginValue {
  view: EditorView;
  plugin: SmoothTypingAnimation;
  selectionData: SelectionData[];

  constructor(view: EditorView, plugin: SmoothTypingAnimation) {
    this.view = view;
    this.plugin = plugin;
  }

  update(update: ViewUpdate) {
    const view = update.view;
    if (update.focusChanged) { this.signalFocusChange(view.hasFocus); }
    if (!view.hasFocus) { return; }

    // Everything from here needs to be done within the 'read' portion of the CM cycle, so that we can access data like the cursor coords:
    view.requestMeasure({
      read: () => {
        const selectionData = this.selectionFromRanges(view, view.state.selection.ranges);
        const cursorChanges = this.listCursorChanges(this.selectionData, selectionData);
        
        console.log("cursorChanges: ", CursorChangeStates[cursorChanges]);
        // update.transactions.length === 0
        
        // If cursor position has moved FOR ANY REASON (user input or not)
        if (cursorChanges !== CursorChangeStates.NoChanges) {
          
          // This makes sure that transient cursors are not rendered at the start of table cells when they are first clicked on
          if (cursorChanges === CursorChangeStates.FirstSet && update.transactions.length === 0) { return; }

          // const triggeredByTyping = this.wasTriggeredByTyping(update.transactions[0]);

          // Update the selection data and trigger the icon update from the main plugin
          this.selectionData = selectionData; 
          this.signalCursorUpdate(false);
        }
      }
    });
  }

  // Functions to inform the main plugin of a change, so it can handle it
  signalCursorUpdate(shouldAnimate: boolean) { this.plugin.updateIconLocation(this.selectionData, shouldAnimate); }
  signalFocusChange(isGained: boolean) { this.plugin.updateFocus(isGained); }

  // This function will tell you if the COORDINATES of the cursor icon have changed for any reason (e.g. through scrolling, resizing window etc)
  listCursorChanges(prevCaretInfo: SelectionData[], currCaretInfo: SelectionData[]): CursorChangeStates {
    const out = CursorChangeStates;

    // Handle cases current and/or previous info is undefined
    if (!prevCaretInfo && !currCaretInfo) { return out.NoChanges; }
    if (!prevCaretInfo || !currCaretInfo) { return out.FirstSet; }

    // If carets have been added or taken away, this is always true and due to user input (I think?)
    if (prevCaretInfo.length !== currCaretInfo.length) { return out.UserInduced; }

    // If the head of any caret changes this is due to user input.
    // I think we will always only have to check the first head, because there is no way to move one selected cursor without moving all of them. But best to still write this as a for loop in case I'm dumb and there's something I'm missing.
    for (let i = 0; i < prevCaretInfo.length; i++) {
      if (prevCaretInfo[i].head !== currCaretInfo[i].head) { return out.UserInduced; }
    }

    // Otherwise we check if the x and y coords of any caret have changed, covering other cases such as scrolling
    for (let i = 0; i < prevCaretInfo.length; i++) {
      if (
        prevCaretInfo[i].x !== currCaretInfo[0].x ||
        prevCaretInfo[i].y !== currCaretInfo[0].y ||
        prevCaretInfo[i].height !== currCaretInfo[0].height)
        { return out.NonUserInduced; }
    }

    // Finally, if all is the same, no changes have occurred.
    return out.NoChanges;
  }

  wasTriggeredByClick = (transactions: readonly Transaction[]) => {
    // If any transaction was triggered by select.pointer, OR if right click was heard this frame (for some reason this is only listed as select), then we return true.
    if (this.plugin.rightClickThisFrame) { return true; }
    let wasTriggeredByPointer = false;

    for (const tr of transactions) {
        const userEvent = tr.annotation(Transaction.userEvent);
        if (userEvent === "select.pointer") {
            wasTriggeredByPointer = true;
            break;
        }
    }
    return wasTriggeredByPointer;
  }

  wasTriggeredByTyping = (transaction: Transaction) => {
    const userEvent = transaction?.annotation(Transaction.userEvent);
    if (!userEvent) { return false; }
    if (userEvent.startsWith("input")) { return true; }
    if (userEvent === "delete.backward") { return true; }
    return false;
  }

  selectionFromRanges(view: EditorView, ranges: readonly SelectionRange[]) {
    const allData: SelectionData[] = [];
    ranges.forEach((range, _) => {
        const caretPosition = range.head; // The offset position of this caret
        const coords = view.coordsAtPos(caretPosition); // Get coordinates for this specific caret position
        if (!coords) { return; }

        const caretHeight = coords.bottom - coords.top;
        allData.push({head: caretPosition, anchor: range.anchor, x: coords.left, y: coords.top, height: caretHeight});
    });
    return allData;
  }
}