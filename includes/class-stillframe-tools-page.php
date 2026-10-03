<?php
/**
 * Tools screen for Stillframe.
 *
 * @package Stillframe
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Renders the Stillframe Multi-Device Studio under Tools.
 */
class Stillframe_Tools_Page {

	/**
	 * Register the Tools submenu.
	 *
	 * @return void
	 */
	public function register() {
		add_action( 'admin_menu', array( $this, 'menu' ) );
	}

	/**
	 * Add the submenu for administrators.
	 *
	 * @return void
	 */
	public function menu() {
		add_management_page(
			__( 'Stillframe', 'stillframe' ),
			__( 'Stillframe', 'stillframe' ),
			'manage_options',
			'stillframe',
			array( $this, 'render' )
		);
	}

	/**
	 * Render the Multi-Device Capture station.
	 *
	 * @return void
	 */
	public function render() {
		if ( ! stillframe_user_can_capture() ) {
			wp_die( esc_html__( 'You cannot capture this screen.', 'stillframe' ) );
		}

		?>
		<div class="wrap stillframe-tools-wrap">
			<h1 class="screen-reader-text"><?php esc_html_e( 'Stillframe', 'stillframe' ); ?></h1>
			<hr class="wp-header-end" />
			<div class="stillframe-box">
				<div class="stillframe-box__header">
					<p class="stillframe-box__title"><?php esc_html_e( 'Stillframe', 'stillframe' ); ?></p>
				</div>

				<form id="stillframe-multicapture-form" onsubmit="return false;" class="stillframe-box__body">
					<!-- Target Page -->
					<div class="stillframe-field-group">
						<div class="stillframe-field-group__header">
							<span class="stillframe-field-group__title"><?php esc_html_e( 'Target Page', 'stillframe' ); ?></span>
							<span class="stillframe-field-group__hint"><?php esc_html_e( 'Select a site page or enter a custom URL to capture.', 'stillframe' ); ?></span>
						</div>
						<div class="stillframe-page-picker">
							<div id="stillframe-target-page"></div>
						</div>
					</div>

					<!-- Devices (Clean Card Tiles with Custom Check Indicator) -->
					<div class="stillframe-field-group">
						<div class="stillframe-field-group__header">
							<span class="stillframe-field-group__title"><?php esc_html_e( 'Device Viewports', 'stillframe' ); ?></span>
							<span class="stillframe-field-group__hint"><?php esc_html_e( 'Select viewports to capture simultaneously.', 'stillframe' ); ?></span>
						</div>
						<div class="stillframe-device-selector">
							<!-- Desktop Tile -->
							<label class="stillframe-device-tile is-active" data-device="desktop">
								<input type="checkbox" name="stillframe_devices[]" value="desktop" data-width="1440" checked class="stillframe-device-tile__cb" />
								<div class="stillframe-device-tile__top">
									<svg class="stillframe-device-tile__icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
										<rect x="2" y="3" width="20" height="14" rx="2"></rect>
										<line x1="8" y1="21" x2="16" y2="21"></line>
										<line x1="12" y1="17" x2="12" y2="21"></line>
									</svg>
									<span class="stillframe-device-tile__check" aria-hidden="true">
										<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
											<polyline points="20 6 9 17 4 12"></polyline>
										</svg>
									</span>
								</div>
								<div class="stillframe-device-tile__info">
									<strong class="stillframe-device-tile__title"><?php esc_html_e( 'Desktop', 'stillframe' ); ?></strong>
									<span class="stillframe-device-tile__res">1440 &times; 900 px</span>
								</div>
							</label>

							<!-- iPad / Tablet Tile -->
							<label class="stillframe-device-tile is-active" data-device="ipad">
								<input type="checkbox" name="stillframe_devices[]" value="ipad" data-width="834" checked class="stillframe-device-tile__cb" />
								<div class="stillframe-device-tile__top">
									<svg class="stillframe-device-tile__icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
										<rect x="4" y="2" width="16" height="20" rx="2"></rect>
										<line x1="12" y1="18" x2="12.01" y2="18"></line>
									</svg>
									<span class="stillframe-device-tile__check" aria-hidden="true">
										<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
											<polyline points="20 6 9 17 4 12"></polyline>
										</svg>
									</span>
								</div>
								<div class="stillframe-device-tile__info">
									<strong class="stillframe-device-tile__title"><?php esc_html_e( 'iPad / Tablet', 'stillframe' ); ?></strong>
									<span class="stillframe-device-tile__res">834 &times; 1112 px</span>
								</div>
							</label>

							<!-- Mobile Tile -->
							<label class="stillframe-device-tile is-active" data-device="phone">
								<input type="checkbox" name="stillframe_devices[]" value="phone" data-width="390" checked class="stillframe-device-tile__cb" />
								<div class="stillframe-device-tile__top">
									<svg class="stillframe-device-tile__icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
										<rect x="5" y="2" width="14" height="20" rx="2"></rect>
										<line x1="12" y1="18" x2="12.01" y2="18"></line>
									</svg>
									<span class="stillframe-device-tile__check" aria-hidden="true">
										<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
											<polyline points="20 6 9 17 4 12"></polyline>
										</svg>
									</span>
								</div>
								<div class="stillframe-device-tile__info">
									<strong class="stillframe-device-tile__title"><?php esc_html_e( 'Mobile Phone', 'stillframe' ); ?></strong>
									<span class="stillframe-device-tile__res">390 &times; 844 px</span>
								</div>
							</label>
						</div>
					</div>

					<!-- Options -->
					<div class="stillframe-field-group">
						<div class="stillframe-field-group__header">
							<span class="stillframe-field-group__title"><?php esc_html_e( 'Capture Preferences', 'stillframe' ); ?></span>
							<span class="stillframe-field-group__hint"><?php esc_html_e( 'Configure resolution quality and display settings.', 'stillframe' ); ?></span>
						</div>
						<div class="stillframe-settings-grid">
							<!-- Resolution Quality -->
							<div class="stillframe-setting-col">
								<span class="stillframe-sublabel"><?php esc_html_e( 'Resolution Quality', 'stillframe' ); ?></span>
								<div class="stillframe-pill-selector">
									<label class="stillframe-pill">
										<input type="radio" name="stillframe_scale" value="1" />
										<span>1x Standard</span>
									</label>
									<label class="stillframe-pill is-active">
										<input type="radio" name="stillframe_scale" value="2" checked />
										<span>2x Retina (Best)</span>
									</label>
									<label class="stillframe-pill">
										<input type="radio" name="stillframe_scale" value="3" />
										<span>3x Ultra</span>
									</label>
								</div>
							</div>

							<!-- Height Scope -->
							<div class="stillframe-setting-col">
								<span class="stillframe-sublabel"><?php esc_html_e( 'Capture Height', 'stillframe' ); ?></span>
								<div class="stillframe-pill-selector">
									<label class="stillframe-pill is-active">
										<input type="radio" name="stillframe_height_mode" value="viewport" checked />
										<span>Viewport (Above fold)</span>
									</label>
									<label class="stillframe-pill">
										<input type="radio" name="stillframe_height_mode" value="fullpage" />
										<span>Full Page (Scroll)</span>
									</label>
								</div>
							</div>

							<!-- Capture engine -->
							<div class="stillframe-setting-col">
								<span class="stillframe-sublabel"><?php esc_html_e( 'Screen capture', 'stillframe' ); ?></span>
								<label class="stillframe-switch-wrap">
									<input type="checkbox" id="stillframe-exact-engine" checked class="stillframe-switch-input" />
									<span class="stillframe-switch-slider"></span>
									<span class="stillframe-switch-label"><?php esc_html_e( 'Pixel-perfect (browser asks to share the tab)', 'stillframe' ); ?></span>
								</label>
							</div>

							<!-- Clean Presentation (Toggle Switch) -->
							<div class="stillframe-setting-col">
								<span class="stillframe-sublabel"><?php esc_html_e( 'Clean Presentation', 'stillframe' ); ?></span>
								<label class="stillframe-switch-wrap">
									<input type="checkbox" id="stillframe-hide-admin-bar" checked class="stillframe-switch-input" />
									<span class="stillframe-switch-slider"></span>
									<span class="stillframe-switch-label"><?php esc_html_e( 'Hide WordPress Admin Bar', 'stillframe' ); ?></span>
								</label>
							</div>
						</div>
					</div>

					<!-- Primary Action Button -->
					<div class="stillframe-action-area">
						<button type="button" class="stillframe-btn stillframe-btn--primary" id="stillframe-start-multicapture">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
								<circle cx="12" cy="13" r="4"></circle>
							</svg>
							<span><?php esc_html_e( 'Capture Selected Devices', 'stillframe' ); ?></span>
						</button>
					</div>
				</form>
			</div>
		</div>
		<?php
	}
}
