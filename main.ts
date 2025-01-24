import { get } from "http";
import { Plugin, MarkdownView } from "obsidian";
type Coordinates = { left: number; top: number};
type Position = { line: number; ch: number };

export default class SmoothTypingAnimation extends Plugin {
	cursorElement: HTMLSpanElement;

	prevCursorCoords: Coordinates = { left: 0, top: 0};  // measured in px
	prevCursorPos: Position | null = { line: 0, ch: 0 };  // measured in line and character
	prevIconCoords: Coordinates | null = { left: 0, top: 0 };  // coordinates of the visible 'icon' (not cursor itself)
	
	prevFrameTime: number = Date.now();
	blinkStartTime: number = Date.now();
	blinkDuration = 1200;

	characterMovementTime = 40;
	remainingMoveTime = 0;

	// Contains the architecture which will be called when the main function needs to return
	private scheduleNextUpdate() {
		requestAnimationFrame(this.updateCursor.bind(this));
	}

	//  Cursor functions
	private resetCursor() {
		requestAnimationFrame(() => { this.blinkStartTime = Date.now(); });
		return 1;
	}

	private blinkCursor(cursorPosChanged: boolean): number {
		// Check if cursor position has changed
		if (cursorPosChanged) { return this.resetCursor(); }

		// Return an opacity of 1 for the first 'half' of the blink, then an opacity of 0 for the second half
		const timePassed = Date.now() - this.blinkStartTime;
		if (timePassed < this.blinkDuration/2) { return 1; }
		else if (timePassed < this.blinkDuration) { return 0; }

		// Once blink has been processed, reset the timer and return 1
		return this.resetCursor();
	}

	// Handles smooth typing, and returns fraction of distance to travel this frame
	private handleSmoothTyping(currCursorPos: Position | null, currCursorCoords: Coordinates, timeSinceLastFrame: number): number {
		const returnStatement = (fractionTravelled = 0) => {
			if (fractionTravelled === 0) { this.remainingMoveTime = 0; }
			this.prevCursorPos = currCursorPos;
			return fractionTravelled;
		}

		// If current cursor position does not exist
		if (!currCursorPos || !this.prevCursorPos) { return returnStatement(); }
		
		const charIncremented = Math.abs(this.prevCursorPos.ch - currCursorPos.ch) === 1;
		const charMoved = Math.abs(this.prevCursorPos.ch - currCursorPos.ch) !== 0;
		const lineMoved = Math.abs(this.prevCursorPos.line - currCursorPos.line) !== 0;

		// If there has been a sharpMovement of the true cursor, we cancel the smooth movement of the icon
		if ((charMoved && !charIncremented) || (lineMoved)) {
			console.log('sharp movement')
			this.remainingMoveTime = 0;
		}

		// If there has been a smoothMovement of the true cursor, we add to the movement time remaining
		else if (charIncremented && !lineMoved) {
			// If line changed then we want a sharpMovement
			if (currCursorCoords.top !== this.prevCursorCoords.top) { this.remainingMoveTime = 0 }
			//  Else it's a true smoothMovement
			else { this.remainingMoveTime = this.characterMovementTime; }
		}
		
		// Regardless of movement, we get the fraction of the total distance travelled (timeSinceLastFrame / remainingMovementTime)
		// and remove the timeSinceLastFrame from the remainingMovementTime
		if (this.remainingMoveTime <= 0) { return returnStatement(); }
		const fractionTravelled = Math.min(timeSinceLastFrame / this.remainingMoveTime, 1);
		this.remainingMoveTime = Math.max(0, this.remainingMoveTime - timeSinceLastFrame);

		// Update prevCursorPosition
		return returnStatement(fractionTravelled);
	} 

	private returnReferences(): { selection: Selection | null; activeLeaf: MarkdownView | null } {
		const selection = activeWindow.getSelection();
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView); 
		return { selection, activeLeaf };
	}

	private getTimeSinceLastFrame(): number {
		const currentTime = Date.now();
		const timeSinceLastFrame = currentTime - this.prevFrameTime;
		this.prevFrameTime = currentTime;
		return timeSinceLastFrame;
	}

	// Main function, called every frame
	updateCursor() {
		// Keep track of time on each frame, and how much has elapsed
		const timeSinceLastFrame = this.getTimeSinceLastFrame();

		// Get needed references and return if there is no selection
		const { selection, activeLeaf } = this.returnReferences();
		if (!selection || !selection.focusNode) {
			this.scheduleNextUpdate();
			return;
		}
		
		// Take the focused 'node', turn it into a range from start to finish
		const cursorRange = document.createRange();
		cursorRange.setStart(selection.focusNode, selection.focusOffset)
		const currCursorCoords = cursorRange.getBoundingClientRect();
		const currCursorPos: Position | null = activeLeaf ? activeLeaf.editor.getCursor() : null;

		// Check if cursor position has changed
		const cursorCoordinatesChanged = (this.prevCursorCoords.left !== currCursorCoords.left || this.prevCursorCoords.top !== currCursorCoords.top);

		// Calculate current cursor opacity 
		const blinkOpacity = this.blinkCursor(cursorCoordinatesChanged);

		// Get the fraction of total distance that the cursor icon should travel this frame
		// nonzero if currently smoothly moving
		// and turn it into a true distance
		const iconMovementFraction = this.handleSmoothTyping(currCursorPos, currCursorCoords, timeSinceLastFrame);
		let currIconCoords;
		if (iconMovementFraction !== 0 && this.prevIconCoords) {			
			const movementThisFrame: Coordinates = {
				left: iconMovementFraction * (currCursorCoords.left - this.prevIconCoords.left),
				top: iconMovementFraction * (currCursorCoords.top - this.prevIconCoords.top)
			};
			currIconCoords = {
				left: this.prevIconCoords.left + movementThisFrame.left,
				top: this.prevIconCoords.top + movementThisFrame.top
			};
		}
		else {
			currIconCoords = currCursorCoords;
		}

		// Send cursor details to .css to render
		if (currIconCoords) {
			this.cursorElement.style.setProperty("--cursor-x1", `${currIconCoords.left}px`);
			this.cursorElement.style.setProperty("--cursor-y1", `${currIconCoords.top}px`);
			this.cursorElement.style.setProperty("--cursor-height", `${currCursorCoords.height}px`);
			this.cursorElement.style.setProperty("--cursor-opacity", `${blinkOpacity}`);
		}

		//  Update this.lastPos and recall
		this.prevCursorCoords = {
			left: currCursorCoords.left,
			top: currCursorCoords.top,
		}
		this.prevIconCoords = currIconCoords;

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
