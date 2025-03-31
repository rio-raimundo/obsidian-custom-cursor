import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginSpec,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';

interface CursorCoords {
  x: number;
  y: number;
  height: number;
}

// Define the function type for your separate rendering logic
type CursorRenderer = (coords: CursorCoords[] | null) => void;

// 1. Define your ViewPlugin class
class CursorTrackerPlugin implements PluginValue {
  private view: EditorView;

  constructor(view: EditorView,) {
      this.view = view;
      console.log("CursorTrackerPlugin created for view:", view.dom);

      // Initial calculation on creation if needed (e.g., if view already has selection)
      // this.calcWhatever()
  }

  update(update: ViewUpdate) {
    if (!update.view.hasFocus) { return; }
    console.log(update.selectionSet);

      // Only recalculate if selection or document changed, or geometry changed
      if (update.selectionSet || update.docChanged || update.geometryChanged) {
           // Optional: Check if the view has focus before rendering,
           // if your renderer should only show for the focused view.
           // This check depends on whether the *renderer* cares about focus,
           // the *plugin itself* gets updates regardless.
          // if (this.view.hasFocus) {

          // } else {
               // Optional: If view loses focus but plugin still updates, tell renderer to clear?
               // this.renderer(null); // Depends on desired behavior
          // }
      }
  }
}

// Define an instance of the plugin to export
export const cursorViewPlugin = ViewPlugin.fromClass(CursorTrackerPlugin);