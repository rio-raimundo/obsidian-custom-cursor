import { Plugin, MarkdownView } from "obsidian";
type Coordinates = { left: number; top: number};
type MarkdownSubView = { sizerEl: HTMLElement };

export default class SmoothTypingAnimation extends Plugin {
	lastPos: Coordinates = { left: 0, top: 0};
	cursorElement: HTMLSpanElement;
	blinkStartTime: number = Date.now();

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
		if (timePassed < 500) { return 1; }
		else if (timePassed < 1000) { return 0; }

		// Once blink has been processed, reset the timer and return 1
		return this.resetCursor();
	}

	private returnReferences() {
		// Get reference to selection
		const parentElement = (<MarkdownSubView>(
			(<unknown>(
				this.app?.workspace.getActiveViewOfType(MarkdownView)
					?.currentMode
			))
		))?.sizerEl?.parentElement;
		const selection = activeWindow.getSelection();

		return { selection };
	}

	// Main function, called every frame
	updateCursor() {
		// Return if selection does not exist
		const { selection } = this.returnReferences();
		if (!selection || !selection.focusNode) {
			this.scheduleNextUpdate();
			return;
		}
		
		// Take the focused 'node', turn it into a range from start to finish
		const cursorRange = document.createRange();
		cursorRange.setStart(selection.focusNode, selection.focusOffset)
		const cursorDetails = cursorRange.getBoundingClientRect();

		// Check if cursor position has changed
		const cursorPositionChanged = (this.lastPos.left !== cursorDetails.left || this.lastPos.top !== cursorDetails.top);

		// Calculate current cursor opacity 
		const blinkOpacity = this.blinkCursor(cursorPositionChanged);

		// Send cursor details to .css to render
		this.cursorElement.style.setProperty("--cursor-x1", `${cursorDetails.left}px`);
		this.cursorElement.style.setProperty("--cursor-y1", `${cursorDetails.top}px`);
		this.cursorElement.style.setProperty("--cursor-height", `${cursorDetails.height}px`);
		this.cursorElement.style.setProperty("--cursor-opacity", `${blinkOpacity}`);

		//  Update this.lastPos and recall
		this.lastPos = {
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
	}
}
