import { Plugin, MarkdownView, Editor } from 'obsidian';
import { SmoothTypingSettings, SmoothTypingSettingsTab, DEFAULT_SETTINGS} from './settings';

type Coordinates = { left: number; top: number};
type Position = { line: number; ch: number };
interface ExtendedEditor extends Editor { containerEl: HTMLElement; }
  
export default class SmoothTypingAnimation extends Plugin {
	settings: SmoothTypingSettings;
	cursorElement: HTMLSpanElement;
	isInWindow = true;

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
	timeSinceLastFrame: number;

	remainingMoveTime = 0;

	changeCursorColour(colour: string | null = null): void {
		if (colour === null) {
			const isLightTheme = document.body.classList.contains('theme-dark') ? false : true;
			colour = isLightTheme ? `#000000` : `#ffffff`
		}
		this.cursorElement.style.setProperty("--cursor-color", colour);
	}

	//  Handles blinking of cursor and resets if it moves
	private blinkCursor(): number {
		const resetCursor = () => {
			requestAnimationFrame(() => { this.blinkStartTime = Date.now(); });
			return 1;
		}

		// Check if cursor position has changed
		const cursorCoordsChanged = (this.prevCursorCoords.left !== this.currCursorCoords.left || this.prevCursorCoords.top !== this.currCursorCoords.top);
		if (cursorCoordsChanged) { return resetCursor(); }

		// Return an opacity of 1 for the first 'half' of the blink, then an opacity of 0 for the second half
		// Should be modular, and loop forever until cursor moves
		const timePassed = Date.now() - this.blinkStartTime - this.settings.blinkDelay*1000;
		const blinkMs = this.settings.blinkSpeed*1000;
		if (timePassed < 0) { return 1; }
		if (timePassed % blinkMs < blinkMs/2) { return 1; }
		else { return 0; }
	}

	private checkCursorExists(selection: Selection | null, editor: ExtendedEditor | null): boolean {
		// If there is not a currently active selection and editor which is focused, then the icon should not be displayed
		if (
			!selection || !selection.focusNode ||
			!editor || !editor.containerEl ||
			!editor.containerEl.className.includes('cm-focused')
		) {
			return false;
		}

		// Get reference to current cursor in terms of {line, ch}. If it does not exist, no need to render cursor, and do not update pos
		const currCursorPos = editor.getCursor();
		if (!currCursorPos) { return false; }

		this.currCursorPos = currCursorPos;
		return true;
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

	private updateCurrCursorCoords(selection: Selection): void {
		if (!selection || !selection.focusNode) { return;}
		
		// Take the focused 'node', turn it into a range from start to finish
		// Have to handle 0 as a special case so that the cursor shows up on empty lines, not sure why
		const cursorRange = document.createRange();
		cursorRange.setStart(selection.focusNode, selection.focusOffset);
		if (selection.focusOffset === 0) { cursorRange.setEnd(selection.focusNode, 1); }
		else { cursorRange.setEnd(selection.focusNode, selection.focusOffset); }
		const cursorInfo = cursorRange.getBoundingClientRect();

		// Assign values
		this.currCursorCoords = { left: cursorInfo.left, top: cursorInfo.top };
		this.currCursorHeight = cursorInfo.height;
	}

	private removeIcon() { this.cursorElement.style.display = 'none'; }
	private bringIconBack() { this.cursorElement.style.display = 'block'; }

	// Main function, called every frame
	updateCursor(firstFrame = false) {
		// Function that will be called on return
		const scheduleNextUpdate = () => {
			this.mouseUpThisFrame = false;
			requestAnimationFrame(this.updateCursor.bind(this));
		}

		// Handle things which need updating on each frame
		// Keep track of time on each frame, and how much has elapsed
		this.timeSinceLastFrame = this.getTimeSinceLastFrame();
		const { selection, editor } = this.returnReferences();

		// Get the state of the icon. Also assigns
		if (!selection || !editor || !this.checkCursorExists(selection, editor)) {
			this.removeIcon();
			return scheduleNextUpdate();
		}

		// If cursor icon should exist, we render it and update the coordinates for the frame
		this.bringIconBack();
		this.updateCurrCursorCoords(selection); // updates coords and height

		// Now we can handle blinking and check if icon should be smoothly moving (assigns to currIconCoords)
		const blinkOpacity = this.blinkCursor();
		if (firstFrame) { this.currIconCoords = this.currCursorCoords; }
		else { this.moveSmoothly(this.checkSmoothMovement(this.currCursorCoords), this.timeSinceLastFrame); }

		// Send cursor details to .css to render
		this.cursorElement.style.setProperty("--cursor-x1", `${this.currIconCoords.left}px`);
		this.cursorElement.style.setProperty("--cursor-y1", `${this.currIconCoords.top}px`);
		this.cursorElement.style.setProperty("--cursor-height", `${this.currCursorHeight}px`);
		this.cursorElement.style.setProperty("--cursor-width", `${this.settings.cursorWidth}px`);
		this.cursorElement.style.setProperty("--cursor-opacity", `${blinkOpacity}`);

		//  Update values on every frame and recall
		this.prevCursorCoords = this.currCursorCoords;
		this.prevIconCoords = this.currIconCoords;

		// Schedule next update
		return scheduleNextUpdate();
	}

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SmoothTypingSettingsTab(this.app, this));

		// Create the cursor element, and apply the custom class cursor to it
		// Set the default cursor colour based on the theme
		this.cursorElement = document.body.createSpan({ cls: "custom-cursor", });
		this.changeCursorColour();  // resets if no arguments given

		// Add custom listeners for clicking and keypresses
		document.addEventListener('mousedown', () => { this.mouseDown = true; });
		document.addEventListener('mouseup', () => { this.mouseDown = false; this.mouseUpThisFrame = true;});

		// Initialise variables and schedule our first function call, which will be recalled once per frame.
		requestAnimationFrame(() => { this.blinkStartTime = Date.now(); });
		this.updateCursor();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
	
	async saveSettings() {
		await this.saveData(this.settings);
	}
}