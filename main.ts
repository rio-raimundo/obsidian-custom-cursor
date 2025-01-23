import { Plugin, MarkdownView } from "obsidian";
type Coordinates = { left: number; top: number};
type Position = { line: number; ch: number };

export default class SmoothTypingAnimation extends Plugin {
	cursorElement: HTMLSpanElement;
	prevCursorCoordinates: Coordinates = { left: 0, top: 0};
	prevCursorPosition: Position = { line: 0, ch: 0 };
	cursorMovePositionStartTime: number = Date.now();
	blinkStartTime: number = Date.now();
	blinkDuration = 1200;

	// Contains the architecture which will be called when the main function needs to return
	private scheduleNextUpdate() {
		requestAnimationFrame(this.updateCursor.bind(this));
	}

	//  Cursor functions
	private resetCursor() {
		requestAnimationFrame(() => { this.blinkStartTime = Date.now(); });
		return 1;
	}

	private blinkCursor(cursorPositionChanged: boolean): number {
		// Check if cursor position has changed
		if (cursorPositionChanged) { return this.resetCursor(); }

		// Return an opacity of 1 for the first 'half' of the blink, then an opacity of 0 for the second half
		const timePassed = Date.now() - this.blinkStartTime;
		if (timePassed < this.blinkDuration/2) { return 1; }
		else if (timePassed < this.blinkDuration) { return 0; }

		// Once blink has been processed, reset the timer and return 1
		return this.resetCursor();
	}

	private handleSmoothTyping(activeLeaf: MarkdownView | null) {
		if (!activeLeaf) { return; }

		const currentCursorPosition: Position = activeLeaf.editor.getCursor();
		
		// Handle no movement case 
		const charIncremented = Math.abs(this.prevCursorPosition.ch - currentCursorPosition.ch) === 1;
		if (this.prevCursorPosition.line === currentCursorPosition.line && this.prevCursorPosition.ch === currentCursorPosition.ch) { return; }
		const goodMovement = (this.prevCursorPosition.line === currentCursorPosition.line && charIncremented);


	} 

	private returnReferences(): { selection: Selection | null; activeLeaf: MarkdownView | null } {
		const selection = activeWindow.getSelection();
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView); 
		return { selection, activeLeaf };
	}

	// Main function, called every frame
	updateCursor() {
		// Get needed references and return if there is no selection
		const { selection, activeLeaf } = this.returnReferences();
		if (!selection || !selection.focusNode) {
			this.scheduleNextUpdate();
			return;
		}
		
		// Take the focused 'node', turn it into a range from start to finish
		const cursorRange = document.createRange();
		cursorRange.setStart(selection.focusNode, selection.focusOffset)
		const cursorDetails = cursorRange.getBoundingClientRect();

		// Check if cursor position has changed
		const cursorCoordinatesChanged = (this.prevCursorCoordinates.left !== cursorDetails.left || this.prevCursorCoordinates.top !== cursorDetails.top);

		// Calculate current cursor opacity 
		const blinkOpacity = this.blinkCursor(cursorCoordinatesChanged);

		// Send cursor details to .css to render
		this.cursorElement.style.setProperty("--cursor-x1", `${cursorDetails.left}px`);
		this.cursorElement.style.setProperty("--cursor-y1", `${cursorDetails.top}px`);
		this.cursorElement.style.setProperty("--cursor-height", `${cursorDetails.height}px`);
		this.cursorElement.style.setProperty("--cursor-opacity", `${blinkOpacity}`);

		//  Update this.lastPos and recall
		this.prevCursorCoordinates = {
			left: cursorDetails.left,
			top: cursorDetails.top,
		}

		// Schedule next update
		this.scheduleNextUpdate();
	}

	async onload() {
		// Create the cursor element, and apply the custom class cursor to it
		this.cursorElement = document.body.createSpan({
			cls: "custom-cursor",
		});
		
		//  Create listeners to see if the cursor is currently on the right page (disappears if not)
		window.addEventListener('blur', () => {
			document.body.classList.add('window-blurred');
		});
		
		window.addEventListener('focus', () => {
			document.body.classList.remove('window-blurred');
		});

		// Initialise variables and schedule our first function call, which will be recalled once per frame.
		requestAnimationFrame(() => { this.blinkStartTime = Date.now(); });
		this.scheduleNextUpdate();

		this.registerEvent(
			this.app.workspace.on('editor-change', (editor, changes) => {
				console.log(changes)
			})
		);
	}
}
