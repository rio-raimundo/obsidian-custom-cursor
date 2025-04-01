import { RangeSetBuilder } from '@codemirror/state';
import { SelectionRange, Transaction } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginSpec,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import SmoothTypingAnimation from './main';

interface SelectionData {
  head: number;
  anchor: number;
  x: number;
  y: number;
  height: number;
}

export class CursorTrackerPlugin implements PluginValue {
  view: EditorView;
  plugin: SmoothTypingAnimation;
  selectionData: SelectionData[];

  constructor(view: EditorView, plugin: SmoothTypingAnimation) {
    this.view = view;
    this.plugin = plugin;
  }


  update(update: ViewUpdate) {
    const view = update.view;
    if (!view.hasFocus) { return; }

    // Get selectionData once the update cycle has complete?
    const selectionData = this.selectionFromRanges(view, view.state.selection.ranges);

    // Get current caret infos and see if any changes have occured
    const hasMoved = this.haveCaretsMoved(this.selectionData, selectionData);

    if (hasMoved) {
      console.log("hasMoved");
      const triggeredByTyping = this.wasTriggeredByTyping(update.transactions[0]);
      // const shouldAnimate = (this.caretInfos.length == caretInfos.length);

      this.selectionData = selectionData; 
    }
  }

  haveCaretsMoved(prevCaretInfo: SelectionData[], currCaretInfo: SelectionData[]) {
    if (prevCaretInfo.length !== currCaretInfo.length) { return true; }

    for (let i = 0; i < prevCaretInfo.length; i++) {
        if (prevCaretInfo[i].head !== currCaretInfo[i].head) { return true; }
    }
    return false;
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