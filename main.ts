import { Plugin, MarkdownView } from "obsidian";
type Coordinates = { left: number; top: number};
type MarkdownSubView = { sizerEl: HTMLElement };

export default class SmoothTypingAnimation extends Plugin {
	lastPos: Coordinates = { left: 0, top: 0};
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
			// this.cursorElement.style.opacity = '0'; // Hide the cursor
			this.scheduleNextUpdate();
			return;
		}
		
		// Take the focused 'node', turn it into a range from start to finish
		const cursorRange = document.createRange();
		cursorRange.setStart(selection.focusNode, selection.focusOffset)
		const cursorDetails = cursorRange.getBoundingClientRect();

		// this.cursorElement.style.opacity = '1'; // Show the cursor
		this.cursorElement.style.setProperty("--cursor-x1", `${cursorDetails.left}px`);
		this.cursorElement.style.setProperty("--cursor-y1", `${cursorDetails.top}px`);
		this.cursorElement.style.setProperty("--cursor-height", `${cursorDetails.height}px`);

		//  Update this.lastPos
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

		window.addEventListener('blur', () => {
			document.body.classList.add('window-blurred');
		});
		
		window.addEventListener('focus', () => {
			document.body.classList.remove('window-blurred');
		});

		// Call our initial function, which will recall itself.
		this.updateCursor();
	}
}
