import { Plugin, MarkdownView, Editor } from 'obsidian';
import { SmoothTypingSettings, SmoothTypingSettingsTab, DEFAULT_SETTINGS} from './settings';

type Coordinates = { left: number; top: number};
type Position = { line: number; ch: number };
interface ExtendedEditor extends Editor { containerEl: HTMLElement; }
  
export default class SmoothTypingAnimation extends Plugin {
	settings: SmoothTypingSettings;
	cursorElement: HTMLSpanElement;
	isInWindow = true;
	isFirstFrame = true;

	mouseDown = false;
	mouseUpThisFrame = false;

	prevCursorCoords: Coordinates = { left: 0, top: 0};  // measured in px
	currCursorCoords: Coordinates = { left: 0, top: 0 };
	currCursorHeight: number;

	prevCursorPos: Position = { line: 0, ch: 0 };  // measured in line and character
	currCursorPos: Position = { line: 0, ch: 0 };

	prevIconCoords: Coordinates = { left: 0, top: 0 };  // coordinates of the visible 'icon' (not cursor itself)
	currIconCoords: Coordinates = { left: 0, top: 0 };
	
	prevFrameTime: number = Date.now();
	blinkStartTime: number = Date.now();

	remainingMoveTime = 0;
	


	/* FUNCTIONS WHICH ARE CALLED BY OBSIDIAN DIRECTLY */
	async onload() {
		// Load settings
		await this.loadSettings();

		// Create the cursor element, and apply the custom class cursor to it
		this.initialiseCursor();

		// Add custom listeners for clicking and keypresses
		document.addEventListener('mousedown', () => { this.mouseDown = true; });
		document.addEventListener('mouseup', () => { this.mouseDown = false; this.mouseUpThisFrame = true;});

		// Initialise variables and schedule our first function call, which will be recalled once per frame.
		requestAnimationFrame(() => { this.blinkStartTime = Date.now(); });
		this.animateCursor();  // call parent function which will be called once per frame
	}

	// Initial functions
	initialiseCursor() {
		this.cursorElement = document.body.createSpan({ cls: "custom-cursor", });
		this.setCursorColour();  // resets if no arguments given
	}
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.addSettingTab(new SmoothTypingSettingsTab(this.app, this));
	}
	async saveSettings() { await this.saveData(this.settings); }



	/* PARENT FUNCTIONS */
	/**
	 * Parent function which runs every frame. Divorced from main architecture so that errors don't stop the cursor from rendering forever.
	 * Everything sould be wrapped safely within a try/catch statements so that this function will always be called every frame
	 * @returns - Nothing
	 */
	private animateCursor() {
		// Assign return statement to ensure function is always called
		const returnStatement = () => {
			this.mouseUpThisFrame = false;
			requestAnimationFrame(this.animateCursor.bind(this));
		};

		// Main try loop to ensure that we always call the return statement
		try {
			// First we define the variables that we will need
			const timeSinceLastFrame = this.getTimeSinceLastFrame();
			const { selection, editor } = this.returnReferences();

			// Check if cursor in a legal state; return if not
			// Add additional (unnecessary) non-null checks to appease TypeScript... not sure if more elegant way to do this.
			if (!this.checkLegalCursor(selection, editor) || !selection || !editor) { return returnStatement(); }

			// If cursor is legal, update the info including position and coords
			this.updateCursorInfo(selection, editor);

			// Now we handle cursor blinking and assign the correct opacity (resetting on cursor movement)
			this.setCursorBlinkOpacity();

			// Call our main function to update the cursor position
			this.updateCursorPosition(timeSinceLastFrame, selection, editor);
		}
		catch (error) { console.error(error); }

		return returnStatement();
	}

	/**
	 * Main function to check if the cursor is in a legal state and should be visible.
	 * A legal state is defined as a currently active selection and editor which is focused.
	 * @param selection - The current selection.
	 * @param editor - The current editor.
	 * @returns - True if the cursor is legal, false if it is not.
	 */
	private checkLegalCursor(selection: Selection | null, editor: ExtendedEditor | null): boolean {
		/**
		 * Helper function to set the display state of the cursor icon.
		 * @param state - 'block' to show the icon, 'none' to hide it.
		 * If the current state matches the desired state, does nothing.
		 */
		const setIconState = (state: string) => {
			if (this.cursorElement.style.display === state) { return; }
			this.cursorElement.style.display = state;
		}

		// Define what happens if cursor is legal or illegal
		const legalCursor = () => {setIconState('block'); return true; }
		const illegalCursor = () => {setIconState('none'); return false; }

		// If there is not a currently active selection and editor which is focused, then the icon should not be displayed
		if (
			!selection || !selection.focusNode ||
			!editor || !editor.containerEl ||
			!editor.containerEl.className.includes('cm-focused') ||
			!editor.getCursor()
		) {
			return illegalCursor();
		}
		
		// Otherwise, our cursor is legal and should exist (and we should continue with the code)
		return legalCursor();
	}

	// Main function to update position of the cursor
	private updateCursorPosition(timeSinceLastFrame: number, selection: Selection, editor: ExtendedEditor) {
		if (this.isFirstFrame) { this.currIconCoords = this.currCursorCoords; this.isFirstFrame = false; }
		else { this.moveSmoothly(this.checkSmoothMovement(this.currCursorCoords), timeSinceLastFrame); }

		// Send cursor details to .css to render
		this.cursorElement.style.setProperty("--cursor-x1", `${this.currIconCoords.left}px`);
		this.cursorElement.style.setProperty("--cursor-y1", `${this.currIconCoords.top}px`);
		this.cursorElement.style.setProperty("--cursor-height", `${this.currCursorHeight}px`);
		this.cursorElement.style.setProperty("--cursor-width", `${this.settings.cursorWidth}px`);

		//  Update values on every frame and recall
		this.prevCursorCoords = this.currCursorCoords;
		this.prevIconCoords = this.currIconCoords;
		return
	}


	/* HELPER FUNCTIONS */
	setCursorColour(colour: string | null = null): void {
		if (colour === null) {
			const isLightTheme = document.body.classList.contains('theme-dark') ? false : true;
			colour = isLightTheme ? `#000000` : `#ffffff`
		}
		this.cursorElement.style.setProperty("--cursor-color", colour);
	}

	//  Handles blinking of cursor and resets if it moves
	private setCursorBlinkOpacity() {
		const returnStatement = (blinkOpacity: number) => {
			this.cursorElement.style.setProperty("--cursor-opacity", `${blinkOpacity}`);
		}

		// Check if cursor position has changed
		const cursorCoordsChanged = (
			this.prevCursorCoords.left !== this.currCursorCoords.left ||
			this.prevCursorCoords.top !== this.currCursorCoords.top
		);
		if (cursorCoordsChanged) {
			requestAnimationFrame(() => { this.blinkStartTime = Date.now(); });
			return returnStatement(1);
		}

		// Return an opacity of 1 for the first 'half' of the blink, then an opacity of 0 for the second half
		// Should be modular, and loop forever until cursor moves
		const timePassed = Date.now() - this.blinkStartTime - this.settings.blinkDelay*1000;
		const blinkMs = this.settings.blinkSpeed*1000;
		if (timePassed < 0) { return returnStatement(1); }
		if (timePassed % blinkMs < blinkMs/2) { return returnStatement(1); }
		else { return returnStatement(0); }
	}

	// Smooth typing function that returns whether anything has started or violated a smooth movement on this frame.
	private checkSmoothMovement(currCursorCoords: Coordinates): boolean {
		// If the iconCoords and cursorCoords are the same, then we do not need a smoothMovement
		// Similarly, if there has been a click this frame, we want a sharpMovement
		// Also look out for a mouseUp on this frame, because if text is selected and you click somewhere else, the mouse only moves on mouseUp (full click)
		if (
			(this.prevIconCoords && 
			this.prevIconCoords.left === currCursorCoords.left &&
			this.prevIconCoords.top === currCursorCoords.top) ||
			(this.mouseDown || this.mouseUpThisFrame)
		) {
			return false;
		}

		// Otherwise, we want a smoothMovement! But finally, we should check if the cursorPosition has changed this frame - if it has, we reset the remainingMoveTime to initialise the smoothMovement
		if (
			this.prevCursorPos.line !== this.currCursorPos.line ||
			this.prevCursorPos.ch !== this.currCursorPos.ch
		) {
			this.remainingMoveTime = this.settings.movementTime;
		}
		return true;
	}

	// Handle the interpolation of the cursor icon for the smoothMovement
	private moveSmoothly(isMovingSmoothly: boolean, timeSinceLastFrame: number): void {
		// If no smooth movement or movement has finished, iconCoords should match true cursorCoords
		if (!isMovingSmoothly || this.remainingMoveTime <= 0) {
			this.remainingMoveTime = 0;
			this.currIconCoords = this.currCursorCoords;
			return;
		}

		// Otherwise calculate the fraction of the remaining time that has passed since the last frame
		const fractionTravelled = Math.min(timeSinceLastFrame / this.remainingMoveTime, 1);
		this.remainingMoveTime = Math.max(0, this.remainingMoveTime - timeSinceLastFrame);

		const movementThisFrame: Coordinates = {
			left: fractionTravelled * (this.currCursorCoords.left - this.prevIconCoords.left),
			top: fractionTravelled * (this.currCursorCoords.top - this.prevIconCoords.top)
		};
		this.currIconCoords = {
			left: this.prevIconCoords.left + movementThisFrame.left,
			top: this.prevIconCoords.top + movementThisFrame.top
		};
	}

	private returnReferences(): { selection: Selection | null; editor: ExtendedEditor | null } {
		const selection = activeWindow.getSelection();
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
		const editor: ExtendedEditor | null = activeLeaf ? (activeLeaf.editor as ExtendedEditor) : null;
		return { selection, editor };
	}

	private getTimeSinceLastFrame(): number {
		const currentTime = Date.now();
		const timeSinceLastFrame = currentTime - this.prevFrameTime;
		this.prevFrameTime = currentTime;
		return timeSinceLastFrame;
	}

	private updateCursorInfo(selection: Selection, editor: ExtendedEditor): void {
		// Update current cursor pos in terms of character and line
		this.currCursorPos = editor.getCursor();

		// Confirm that selection has focused node
		if (!selection.focusNode) { return; }
		
		// Take the focused 'node', turn it into a range from start to finish
		// Have to handle 0 as a special case so that the cursor shows up on empty lines, not sure why
		const cursorRange = document.createRange();
		cursorRange.setStart(selection.focusNode, selection.focusOffset);
		if (selection.focusOffset === 0) { cursorRange.setEnd(selection.focusNode, 1); }
		else { cursorRange.setEnd(selection.focusNode, selection.focusOffset); }
		const cursorInfo = cursorRange.getBoundingClientRect();

		// Assign coordinates and height values
		this.currCursorCoords = { left: cursorInfo.left, top: cursorInfo.top };
		this.currCursorHeight = cursorInfo.height;
	}
}