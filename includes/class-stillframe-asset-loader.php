<?php
/**
 * Loads Stillframe assets for administrators.
 *
 * @package Stillframe
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Enqueues the admin bar script only. The capture library loads later, from the browser.
 */
class Stillframe_Asset_Loader {

	/**
	 * Query arguments that must not be replayed inside the capture frame.
	 *
	 * @var string[]
	 */
	public const STRIPPED_QUERY_ARGS = array(
		'action',
		'_wpnonce',
		'nonce',
		'_wp_http_referer',
		'wp_customize',
	);

	/**
	 * Enqueue the admin bar script and its small style, for administrators only.
	 *
	 * @return void
	 */
	public function enqueue() {
		if ( ! $this->should_load() ) {
			return;
		}

		$style_url = false;
		wp_register_style( 'stillframe-admin-bar', $style_url, array(), STILLFRAME_VERSION );
		wp_enqueue_style( 'stillframe-admin-bar' );
		wp_add_inline_style( 'stillframe-admin-bar', $this->admin_bar_css() );

		$base = trailingslashit( plugin_dir_url( STILLFRAME_FILE ) );

		wp_register_style(
			'stillframe-capture-panel',
			$base . 'assets/css/stillframe-capture-panel.css',
			array(),
			STILLFRAME_VERSION
		);

		wp_register_script(
			'stillframe-annotation-editor',
			$base . 'assets/js/stillframe-annotation-editor.js',
			array(),
			STILLFRAME_VERSION,
			true
		);

		wp_register_script(
			'stillframe-capture-panel',
			$base . 'assets/js/stillframe-capture-panel.js',
			array( 'stillframe-annotation-editor' ),
			STILLFRAME_VERSION,
			true
		);

		wp_enqueue_script(
			'stillframe-admin-bar',
			$base . 'assets/js/stillframe-admin-bar.js',
			array(),
			STILLFRAME_VERSION,
			true
		);

		$config = array(
			'pluginUrl'    => $base,
			'version'      => STILLFRAME_VERSION,
			'currentUrl'   => $this->current_screen_url(),
			'presets'      => $this->device_width_presets(),
			'scales'       => $this->scale_choices(),
			'defaultScale'  => 1,
			'defaultPreset' => 'screen',
			'ajaxUrl'       => admin_url( 'admin-ajax.php' ),
			'mediaNonce'    => wp_create_nonce( 'stillframe_save_media' ),
			'canUpload'     => current_user_can( 'upload_files' ),
			'minWidth'     => 320,
			'maxWidth'     => 2560,
			'stripArgs'    => self::STRIPPED_QUERY_ARGS,
			'i18n'         => $this->script_strings(),
		);

		wp_add_inline_script(
			'stillframe-admin-bar',
			'window.StillframeCapture = window.StillframeCapture || {}; window.StillframeCapture.config = ' . wp_json_encode( $config ) . ';',
			'before'
		);

		/**
		 * Fires when Stillframe has prepared the capture panel for an administrator.
		 *
		 * The panel markup is built in the browser after the admin bar item is opened.
		 * Version 0.1.0 does not print the panel from PHP.
		 */
		do_action( 'stillframe_capture_panel_rendered' );
	}

	/**
	 * Whether this request should receive Stillframe assets.
	 *
	 * @return bool
	 */
	private function should_load() {
		if ( ! stillframe_user_can_capture() ) {
			return false;
		}
		if ( is_admin_bar_showing() ) {
			return true;
		}
		return $this->is_tools_screen();
	}

	/**
	 * Whether this request is the Stillframe Tools screen.
	 *
	 * @return bool
	 */
	private function is_tools_screen() {
		if ( ! is_admin() ) {
			return false;
		}

		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
		return 'stillframe' === $page;
	}

	/**
	 * Device widths shown in the panel.
	 *
	 * @return array<int, array{id: string, label: string, width: int}>
	 */
	private function device_width_presets() {
		$defaults = array(
			array(
				'id'    => 'phone',
				'label' => __( 'Phone', 'stillframe' ),
				'width' => 390,
			),
			array(
				'id'    => 'ipad',
				'label' => __( 'iPad', 'stillframe' ),
				'width' => 834,
			),
			array(
				'id'    => 'desktop',
				'label' => __( 'Desktop', 'stillframe' ),
				'width' => 1440,
			),
		);

		/**
		 * Filters the device width presets shown in the capture panel.
		 *
		 * Each item needs an id, a label, and a width from 320 to 2560.
		 * Custom width is a separate control and is not part of this list.
		 *
		 * @param array<int, array{id: string, label: string, width: int}> $presets Width presets.
		 */
		$filtered = apply_filters( 'stillframe_device_width_presets', $defaults );
		if ( ! is_array( $filtered ) ) {
			$filtered = $defaults;
		}

		$clean = array();
		foreach ( $filtered as $preset ) {
			if ( ! is_array( $preset ) ) {
				continue;
			}

			$width = isset( $preset['width'] ) ? (int) $preset['width'] : 0;
			if ( $width < 320 || $width > 2560 ) {
				continue;
			}

			$id = isset( $preset['id'] ) ? sanitize_key( $preset['id'] ) : '';
			if ( '' === $id ) {
				continue;
			}

			$label = isset( $preset['label'] ) ? sanitize_text_field( (string) $preset['label'] ) : (string) $width;
			if ( '' === $label ) {
				$label = (string) $width;
			}

			$clean[] = array(
				'id'    => $id,
				'label' => $label,
				'width' => $width,
			);
		}

		if ( empty( $clean ) ) {
			$clean = array(
				array(
					'id'    => 'phone',
					'label' => __( 'Phone', 'stillframe' ),
					'width' => 390,
				),
				array(
					'id'    => 'ipad',
					'label' => __( 'iPad', 'stillframe' ),
					'width' => 834,
				),
				array(
					'id'    => 'desktop',
					'label' => __( 'Desktop', 'stillframe' ),
					'width' => 1440,
				),
			);
		}

		return $clean;
	}

	/**
	 * Export scales. The default used by the panel is 2.
	 *
	 * @return array<int, array{value: int, label: string}>
	 */
	private function scale_choices() {
		return array(
			array(
				'value' => 1,
				'label' => __( '1x', 'stillframe' ),
			),
			array(
				'value' => 2,
				'label' => __( '2x', 'stillframe' ),
			),
			array(
				'value' => 3,
				'label' => __( '3x', 'stillframe' ),
			),
		);
	}

	/**
	 * Strings for the capture panel. They are inserted with textContent in the browser.
	 *
	 * @return array<string, string>
	 */
	private function script_strings() {
		return array(
			'heading'         => esc_html__( 'Capture this screen', 'stillframe' ),
			'close'           => esc_html__( 'Close', 'stillframe' ),
			'screen'          => esc_html__( 'This screen', 'stillframe' ),
			'width'           => esc_html__( 'Width', 'stillframe' ),
			'custom'          => esc_html__( 'Custom', 'stillframe' ),
			'customWidth'     => esc_html__( 'Custom width', 'stillframe' ),
			'scale'           => esc_html__( 'Export scale', 'stillframe' ),
			'capture'         => esc_html__( 'Capture', 'stillframe' ),
			'captureWindow'   => esc_html__( 'Capture current window', 'stillframe' ),
			'capturingWidth'  => esc_html__( 'Reloading this page at the chosen width.', 'stillframe' ),
			'download'        => esc_html__( 'Download', 'stillframe' ),
			'saveMedia'       => esc_html__( 'Save to Media', 'stillframe' ),
			'savingMedia'     => esc_html__( 'Saving to the Media Library.', 'stillframe' ),
			'savedMedia'      => esc_html__( 'Saved to the Media Library.', 'stillframe' ),
			'viewMedia'       => esc_html__( 'View', 'stillframe' ),
			'mediaFailed'     => esc_html__( 'The media save failed. The page was not changed.', 'stillframe' ),
			'pen'             => esc_html__( 'Pen', 'stillframe' ),
			'circle'          => esc_html__( 'Circle', 'stillframe' ),
			'arrow'           => esc_html__( 'Arrow', 'stillframe' ),
			'undo'            => esc_html__( 'Undo', 'stillframe' ),
			'clear'           => esc_html__( 'Clear', 'stillframe' ),
			'tools'           => esc_html__( 'Annotation tools', 'stillframe' ),
			'capturedAlt'     => esc_html__( 'Captured screen', 'stillframe' ),
			'frameTitle'      => esc_html__( 'Stillframe capture frame', 'stillframe' ),
			'capturing'       => esc_html__( 'Capturing this screen.', 'stillframe' ),
			/* translators: 1: width in CSS pixels, 2: export scale. */
			'captured'        => esc_html__( 'Captured at %1$d pixels wide and %2$dx. Draw on the picture, then download the PNG.', 'stillframe' ),
			'preparing'       => esc_html__( 'Preparing the PNG.', 'stillframe' ),
			'assetsFailed'    => esc_html__( 'Stillframe could not load the capture tools. The page was not changed.', 'stillframe' ),
			'captureFailed'   => esc_html__( 'The capture failed. The page was not changed.', 'stillframe' ),
			'captureTimeout'  => esc_html__( 'The capture timed out. The page was not changed.', 'stillframe' ),
			'frameBlocked'    => esc_html__( 'The frame was blocked, so only the current window can be captured. The page was not changed.', 'stillframe' ),
			'invalidWidth'    => esc_html__( 'Enter a whole number from 320 to 2560. The page was not changed.', 'stillframe' ),
			'downloadFailed'  => esc_html__( 'The download failed. The page was not changed.', 'stillframe' ),
			'libraryMissing'  => esc_html__( 'The capture tool did not load. The page was not changed.', 'stillframe' ),
			'snipHint'        => esc_html__( 'Drag to select', 'stillframe' ),
			'snipRect'        => esc_html__( 'Rectangular snip', 'stillframe' ),
			'snipFree'        => esc_html__( 'Freeform snip', 'stillframe' ),
			'snipWindow'      => esc_html__( 'Window snip', 'stillframe' ),
			'snipFull'        => esc_html__( 'Fullscreen', 'stillframe' ),
			'topBar'          => esc_html__( 'Top bar', 'stillframe' ),
			'sideMenu'        => esc_html__( 'Side menu', 'stillframe' ),
			'pluginsClean'    => esc_html__( 'Hide other plugins', 'stillframe' ),
			'notices'         => esc_html__( 'Admin notices', 'stillframe' ),
			'cancel'          => esc_html__( 'Cancel', 'stillframe' ),
			'more'            => esc_html__( 'More', 'stillframe' ),
			'topBarHelp'      => esc_html__( 'Include the top bar', 'stillframe' ),
			'sideMenuHelp'    => esc_html__( 'Include the side menu', 'stillframe' ),
		);
	}

	/**
	 * Focus style for the admin bar item.
	 *
	 * @return string
	 */
	private function admin_bar_css() {
		return '#wpadminbar #wp-admin-bar-stillframe-capture>.ab-item,#wpadminbar #wp-admin-bar-stillframe-capture>.ab-item:hover,#wpadminbar #wp-admin-bar-stillframe-capture>.ab-item:focus{outline:none;box-shadow:none;border:0;}#wpadminbar #wp-admin-bar-stillframe-capture .ab-icon{margin-right:0;}#wpadminbar #wp-admin-bar-stillframe-capture .ab-icon:before{content:"\\f306";top:2px;}#wpadminbar #wp-admin-bar-stillframe-capture .screen-reader-text{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}.stillframe-snip{position:fixed;inset:0;z-index:1000000;margin:0}.stillframe-snip__shade{position:absolute;inset:0;cursor:crosshair;background:rgba(0,0,0,.55)}.stillframe-snip__bar{position:fixed;top:12px;left:50%;z-index:6;display:flex;align-items:center;padding:4px;background:#2b2b2b;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.4);transform:translateX(-50%)}.stillframe-snip.has-admin-bar .stillframe-snip__bar{top:44px}.stillframe-snip__bar button{width:40px;height:40px;margin:0;padding:0;color:#f3f3f3;background:transparent;border:0;border-radius:6px}.stillframe-snip__bar button[aria-pressed="true"]{background:#3f3f3f;box-shadow:inset 0 0 0 1px #9cd1e8}.stillframe-snip__sep{width:1px;height:22px;margin:0 6px;background:#555}';
	}

	/**
	 * URL of the screen being viewed, safe to load with a same-origin GET.
	 *
	 * The host comes from home_url(). Query arguments that can replay a
	 * state-changing request are removed before the value ever reaches JavaScript.
	 *
	 * @return string
	 */
	private function current_screen_url() {
		$target = $this->request_path_and_query();
		$origin = $this->home_origin();
		$url    = remove_query_arg( self::STRIPPED_QUERY_ARGS, $origin . $target );
		$clean  = esc_url_raw( $url );

		if ( ! is_string( $clean ) || '' === $clean ) {
			return esc_url_raw( home_url( '/' ) );
		}

		return $clean;
	}

	/**
	 * Scheme, host, and port from home_url().
	 *
	 * @return string
	 */
	private function home_origin() {
		$parts  = wp_parse_url( home_url( '/' ) );
		$scheme = 'https';
		$host   = '';

		if ( is_array( $parts ) && isset( $parts['scheme'] ) && is_string( $parts['scheme'] ) ) {
			$scheme = $parts['scheme'];
		}

		if ( is_array( $parts ) && isset( $parts['host'] ) && is_string( $parts['host'] ) ) {
			$host = $parts['host'];
		}

		$origin = $scheme . '://' . $host;

		if ( is_array( $parts ) && isset( $parts['port'] ) ) {
			$origin .= ':' . (int) $parts['port'];
		}

		return $origin;
	}

	/**
	 * Path and query string from the current request, or "/".
	 *
	 * @return string
	 */
	private function request_path_and_query() {
		$raw = '/';

		if ( isset( $_SERVER['REQUEST_URI'] ) ) {
			$raw = esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) );
		}

		if ( ! is_string( $raw ) || '' === $raw ) {
			return '/';
		}

		$parsed = wp_parse_url( $raw );
		if ( ! is_array( $parsed ) ) {
			return '/';
		}

		$path = '/';
		if ( isset( $parsed['path'] ) && is_string( $parsed['path'] ) && '' !== $parsed['path'] ) {
			$path = $parsed['path'];
		}

		if ( '/' !== substr( $path, 0, 1 ) || preg_match( '/[[:cntrl:]\\\\]/', $path ) ) {
			return '/';
		}

		if ( strlen( $path ) > 1 && ( '/' === substr( $path, 1, 1 ) || '\\' === substr( $path, 1, 1 ) ) ) {
			return '/';
		}

		$target = $path;
		if ( isset( $parsed['query'] ) && is_string( $parsed['query'] ) && '' !== $parsed['query'] ) {
			$target .= '?' . $parsed['query'];
		}

		return $target;
	}
}
