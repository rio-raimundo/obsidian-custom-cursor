import { App, PluginSettingTab, Setting, ButtonComponent, ColorComponent, SliderComponent } from 'obsidian';
import SmoothTypingAnimation from './main';

// HANDLE SETTINGS
export interface SmoothTypingSettings {
	blinkSpeed: number;
	blinkDelay: number;
	characterMovementTime: number;
	cursorWidth: number;
	cursorColor: string | null;
}
export const DEFAULT_SETTINGS: SmoothTypingSettings = {
	blinkSpeed: 1.2,
	blinkDelay: 0,
	characterMovementTime: 80,
	cursorWidth: 1,
	cursorColor: '#ffffff',
};

export class SmoothTypingSettingsTab extends PluginSettingTab {
	plugin: SmoothTypingAnimation;
	
	constructor(app: App, plugin: SmoothTypingAnimation) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// CURSOR COLOUR SETTING
		const cursorColorSetting = new Setting(this.containerEl)
			.setName('Cursor colour')
			.setDesc('The colour of the cursor icon. Defaults to (dark-mode dependent) black or white.');
		new ResetButtonComponent(cursorColorSetting.controlEl).onClick(async () => {
			colorPicker.setValue('#ffffff');
			this.plugin.settings.cursorColor = null; // Custom saving to not save the color black in the data.
			this.plugin.changeCursorColour();
			await this.plugin.saveSettings();
		});
		const colorPicker = new ColorComponent(cursorColorSetting.controlEl)
			.setValue(this.plugin.settings.cursorColor ?? '#ffffff')
			.onChange(async (value) => {
				this.plugin.settings.cursorColor = value;
				this.plugin.changeCursorColour(value);
				await this.plugin.saveSettings();
		});

		// BLINK SPEED SLIDER
		const blinkSpeedSetting = new Setting(this.containerEl)
			.setName('Blink speed (in seconds)')
			.setDesc('The number of seconds to complete one full cursor blink cycle.')
		new ResetButtonComponent(blinkSpeedSetting.controlEl)
			.onClick(async () => {
				blinkSpeedSlider.setValue(DEFAULT_SETTINGS.blinkSpeed);
				await this.plugin.saveSettings();
			});
		const blinkSpeedSlider = new SliderComponent(blinkSpeedSetting.controlEl)
			.setLimits(0.2, 5, 0.1)
			.setDynamicTooltip()
			.setValue(this.plugin.settings.blinkSpeed ?? DEFAULT_SETTINGS.blinkSpeed)
			.onChange(async (val) => {
				this.plugin.settings.blinkSpeed = val; // convert to ms
				await this.plugin.saveSettings();
			});

		// BLINK DELAY SLIDER
		const blinkDelaySetting = new Setting(this.containerEl)
			.setName('Blink delay (in seconds)')
			.setDesc('The number of seconds after cursor movement before blinking begins.')
		new ResetButtonComponent(blinkDelaySetting.controlEl)
			.onClick(async () => {
				blinkDelaySlider.setValue(DEFAULT_SETTINGS.blinkDelay);
				await this.plugin.saveSettings();
			});
		const blinkDelaySlider = new SliderComponent(blinkDelaySetting.controlEl)	
			.setLimits(0, 5, 0.1)
			.setDynamicTooltip()
			.setValue( this.plugin.settings.blinkDelay ?? DEFAULT_SETTINGS.blinkDelay)
			.onChange(async (val) => {
				this.plugin.settings.blinkDelay = val;
				await this.plugin.saveSettings();
			});

		// SMOOTH TYPING SPEED SLIDER
		const smoothTypingSetting = new Setting(this.containerEl)
			.setName('Smooth typing speed (in milliseconds)')
			.setDesc('The number of milliseconds for the cursor icon to reach the true cursor location after typing or moving the cursor. 0 for instant speed.')
		new ResetButtonComponent(smoothTypingSetting.controlEl)
			.onClick(async () => {
				smoothTypingSpeedSlider.setValue(DEFAULT_SETTINGS.characterMovementTime);
				await this.plugin.saveSettings();
			});
		const smoothTypingSpeedSlider = new SliderComponent(smoothTypingSetting.controlEl)
			.setLimits(0, 200, 1)
			.setDynamicTooltip()
			.setValue(this.plugin.settings.characterMovementTime ?? DEFAULT_SETTINGS.blinkDelay)
			.onChange(async (val) => {
				this.plugin.settings.characterMovementTime = val;
				await this.plugin.saveSettings();
			});
		
		// CURSOR WIDTH SLIDER
		const cursorWidthSetting = new Setting(this.containerEl)
			.setName('Cursor width (in pixels)')
			.setDesc('The width of the cursor icon in pixels.')
		new ResetButtonComponent(cursorWidthSetting.controlEl)
			.onClick(async () => {
				cursorWidthSlider.setValue(DEFAULT_SETTINGS.cursorWidth);
				await this.plugin.saveSettings();	
			});
		const cursorWidthSlider = new SliderComponent(cursorWidthSetting.controlEl)
			.setLimits(1, 5, 1)
			.setDynamicTooltip()
			.setValue(this.plugin.settings.cursorWidth ?? DEFAULT_SETTINGS.cursorWidth)
			.onChange(async (val) => {
				this.plugin.settings.cursorWidth = val;
				await this.plugin.saveSettings();
			});
	}
}

// SUPPORTING CLASSES
class ResetButtonComponent extends ButtonComponent {
	constructor(protected contentEl: HTMLElement) {
		super(contentEl);
		this.setTooltip('Restore default');
		this.setIcon('rotate-ccw');
		this.render();
	}

	private render(): void {
		this.buttonEl.classList.add('clickable-icon');
		this.buttonEl.classList.add('extra-setting-button');
	}
}