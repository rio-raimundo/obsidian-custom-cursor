import { Plugin, Notice, MarkdownView } from "obsidian";
type Coordinates = { x: number; y: number};
type MarkdownSubView = { sizerEl: HTMLElement };

export default class NinjaCursorPlugin extends Plugin {
	lastPos: Coordinates = { x: 0, y: 0};
	cursorElement: HTMLSpanElement;

	// Contains the architecture which will be called when the main function needs to return
	private scheduleNextUpdate() {
		requestAnimationFrame(this.updateCursor.bind(this));
	}

	// Main function, called every frame
	async updateCursor() {
		// Get reference to selection
		const parentElement = (<MarkdownSubView>(
			(<unknown>(
				this.app?.workspace.getActiveViewOfType(MarkdownView)
					?.currentMode
			))
		))?.sizerEl?.parentElement;
		const selection = activeWindow.getSelection();

		// Return if selection does not exist
		if (!parentElement || !selection || !selection.focusNode) {
			this.cursorElement.style.opacity = '0'; // Hide the cursor
			this.scheduleNextUpdate();
			return;
		}
		
		// Take the focused 'node', turn it into a range from start to finish
		const cursorRange = document.createRange();
		cursorRange.setStart(selection.focusNode, selection.focusOffset)
		const cursorDetails = cursorRange.getBoundingClientRect();

		// Find current cursor position and assign to currentPos
		if (!cursorDetails) {
			new Notice("Could not find cursor position");
			this.scheduleNextUpdate();
			return;
		}

		//  Get the current position, accounting for the scroll of the page
		const currentPos: Coordinates = {
			x: cursorDetails.x,
			y: cursorDetails.y + parentElement?.scrollTop,
		};

		// console.log(currentPos);
		this.cursorElement.style.opacity = '1'; // Show the cursor
		this.cursorElement.style.setProperty("--cursor-x1", `${currentPos.x}px`);
		this.cursorElement.style.setProperty("--cursor-y1", `${currentPos.y}px`);

		//  Update this.lastPos
		this.lastPos.x = currentPos.x;
		this.lastPos.y = currentPos.y;

		// Schedule next update
		requestAnimationFrame(this.updateCursor.bind(this));
	}

	async onload() {
		// Create the cursor element, and apply the custom class cursor to it
		this.cursorElement = document.body.createSpan({
			cls: "dashing-cursor",
		});

		// Call our initial function, which will recall itself.
		this.updateCursor();
	}
}
