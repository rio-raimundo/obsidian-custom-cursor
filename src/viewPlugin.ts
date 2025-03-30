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

class viewPlugin implements PluginValue {
  view: EditorView;
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.view = view;
    this.decorations = this.buildDecorations(view);
  }

  docViewUpdate(view: EditorView): void {
  }

  update(update: ViewUpdate): void {
    console.log(update.selectionSet);
	}

  destroy() {}

	private buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		return builder.finish();
	}
}

const pluginSpec: PluginSpec<viewPlugin> = {
  decorations: (value: viewPlugin) => value.decorations,
};

// Define an instance of the plugin to export
export const cursorViewPlugin = ViewPlugin.fromClass(
  viewPlugin,
  pluginSpec
);