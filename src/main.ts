import { Plugin, MarkdownView, Editor } from 'obsidian';
import { SmoothTypingSettings, SmoothTypingSettingsTab, DEFAULT_SETTINGS} from './settings';
import { EditorView, ViewUpdate } from '@codemirror/view';
// import { cursorViewPlugin } from './viewPlugin';

type Coordinates = { left: number; top: number};
type Position = { line: number; ch: number };
interface ExtendedEditor extends Editor { containerEl: HTMLElement; }

interface CaretCoords {
	x: number;
	y: number;
	height: number;
}

/**
 * Calculates the approximate starting coordinates and height for a caret
 * within an element, accounting for padding and border.
 * This is intended as a fallback when range.getBoundingClientRect() fails
 * (often when the caret is at offset 0).
 *
 * @param {Element | null | undefined } element The DOM element (usually document.activeElement).
 * @returns {{x: number, y: number, height: number} | null} An object with x, y, height,
 *          or null if calculation fails (e.g., element not found, styles inaccessible).
 */
function getAdjustedElementBoundsForCaret( element: Element | null | undefined ): CaretCoords | null {
	if (!element) { return null; }

	// 1. Get the element's overall bounding box (border box)
	const elementRect: DOMRect = element.getBoundingClientRect();

	// 2. Get the computed styles to find padding, border, and line-height
    let computedStyle: CSSStyleDeclaration;
    try {
        computedStyle = window.getComputedStyle(element);
		// This case is highly unlikely as getComputedStyle returns an object even for detached nodes
         if (!computedStyle) {
             console.error("getAdjustedElementBoundsForCaret: Could not get computed style for element:", element);
             return null;
        }
    } catch (e) {
         console.error("getAdjustedElementBoundsForCaret: Error getting computed style:", e);
        return null;
    }

	// 3. Handle lineHeight, including edge cases and exceptions
	// It should never be NaN as obsidian seems to be very good at providing it, but if it is then we assume a standard of fontsize * 1.5 (true in most cases, though not in tables for some reason).
	// We also make sure height is not greater than element height (can happen with weird line-heights/box-sizing)
    let lineHeight: number = parseFloat(computedStyle.lineHeight);

    if (isNaN(lineHeight) || lineHeight <= 0) {
        console.warn("getAdjustedElementBoundsForCaret: Using approximate lineHeight based on fontSize for element:", element);
		const multiplier = 1.5;
        lineHeight = (parseFloat(computedStyle.fontSize) || 16) * multiplier; // Use 16 as fallback
    }
    if (elementRect.height > 0) { lineHeight = Math.min(lineHeight, elementRect.height); }

	// 4. Extract and parse the other relevant style values (default to 0 if parsing fails)
	const paddingLeft: number = parseFloat(computedStyle.paddingLeft) || 0;
	const paddingTop: number = parseFloat(computedStyle.paddingTop) || 0;
	const borderLeft: number = parseFloat(computedStyle.borderLeftWidth) || 0;
	const borderTop: number = parseFloat(computedStyle.borderTopWidth) || 0;

    // 5. Calculate adjusted coordinates, accounting for padding
    const x: number = elementRect.left + borderLeft + paddingLeft;
    const y: number = elementRect.top + borderTop + paddingTop;
    const height: number = lineHeight;
    return { x, y, height };
}

/**
 * Attempts to get the caret position using the selection range's bounding box.
 * This is intended for use *outside* of CodeMirror editors, when the
 * range is expected to provide a valid bounding client rectangle for the caret.
 *
 * @returns {{x: number, y: number, height: number} | null} An object with x, y, height
 *          representing the caret position and line height, or null if the selection
 *          is invalid, not collapsed, or getBoundingClientRect fails or returns
 *          an invalid rectangle (e.g., zero height).
 */
function getRangeBasedCaretPosition(): CaretCoords | null {
    const selection = document.getSelection();

    // 1. Validate selection state
	// Return if no selection, no ranges, or the selection is not a caret
    if (!selection || selection.rangeCount === 0 || selection.type != "Caret") { console.log("getRangeBasedCaretPosition: No valid selection"); return null; }

	// 2. Get the selection range and bounding box
    let range: Range;
    try { range = selection.getRangeAt(0); } catch (e) {
		console.error("getRangeBasedCaretPosition: Error getting selection range:", e);
        return null;
    }
	
	let rect: DOMRect;
    try { rect = range.getBoundingClientRect(); } catch (e) {
        console.error("getRangeBasedCaretPosition: Error getting range bounding client rect:", e);
        return null;
    }

    // 3. Validate the bounding box
    // A valid caret bounding box should theoretically have zero width (though browsers might vary slightly)
    // but MUST have a positive height representing the line height.
    // Check for positive height as the primary indicator of validity.
    // Also check against all-zero rect which sometimes indicates failure.
    if (rect.height <= 0 ||
        (rect.top === 0 && rect.left === 0 && rect.right === 0 && rect.bottom === 0 && rect.width === 0 && rect.height === 0)
    ) {
        return null;
    }

    // 5. Extract coordinates and height
    // For LTR text, 'left' is the relevant horizontal position.
    const x: number = rect.left;
    const y: number = rect.top;
    const height: number = rect.height;

    return { x, y, height };
}

/**
 * Checks if the given DOM element is an input field (<input> or <textarea>).
 *
 * @param {Element | null | undefined} element The element to check.
 * @returns {boolean} True if the element is an <input> or <textarea>, false otherwise.
 */
function isInputElement(element: Element | null | undefined): boolean {
    if (!element) { return false; }
    const tagName = element.tagName.toUpperCase(); // Ensure comparison is case-insensitive
    return tagName === 'INPUT' || tagName === 'TEXTAREA';
}
  
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
	tPrevSelectionChange: number = Date.now();
	tIgnoreSelectionChange = 5; // time in ms to ignore consecutive calls to listener
	private currentlyFocusedCmView: EditorView | null = null;


	/* FUNCTIONS WHICH ARE CALLED BY OBSIDIAN DIRECTLY */
	async onload() {
		// Load settings
		await this.loadSettings();

		this.keepFocusedCmViewUpdated();

        // Add the listener to the document
        document.addEventListener('selectionchange', this.processSelectionUpdate);
	}

	keepFocusedCmViewUpdated() {
		// 1. Create your CodeMirror Extension
        const cmUpdateListener = EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.view.hasFocus ) {
				if (this.currentlyFocusedCmView !== update.view) { this.currentlyFocusedCmView = update.view; }
			}
			else {
                if (this.currentlyFocusedCmView === update.view) { this.currentlyFocusedCmView = null; }
            }
        });

        // 2. Register the Extension with Obsidian
        // This line makes Obsidian apply 'cmUpdateListener' to all current / future CodeMirror instances.
        this.registerEditorExtension(cmUpdateListener);
	}

	// Listener which is executed on selection change
	processSelectionUpdate = () => {
		// Cancel the listener if too many calls happened too quickly
		if (Date.now() - this.tPrevSelectionChange < this.tIgnoreSelectionChange) return;
		this.tPrevSelectionChange = Date.now();
		
		const element = document.activeElement;
		// if (element?.closest('.cm-editor')) { console.log('Currently within CM instance!')}
		// else { console.log('Not currently within CM instance.'); }
		
		const isInputField = isInputElement(element);
		if (isInputField) { console.log('Currently within input field.');  return; }
		const elementVals = element ? getAdjustedElementBoundsForCaret(element) : null;
		const rangeVals = getRangeBasedCaretPosition();

		if (false) {
			if (rangeVals) { console.log('Range-based at', rangeVals); }
			else if (elementVals) { console.log('Element-based at', elementVals); }
		}
	};

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