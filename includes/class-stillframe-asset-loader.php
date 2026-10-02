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
	 * Transient holding the page picker list.
	 *
	 * @var string
	 */
	public const PAGES_TRANSIENT = 'stillframe_site_pages';

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
			'homeUrl'      => home_url( '/' ),
			'sitePages'    => $this->site_pages(),
			'toolsUrl'     => admin_url( 'tools.php?page=stillframe' ),
			'stripArgs'    => self::STRIPPED_QUERY_ARGS,
			'i18n'         => $this->script_strings(),
		);

		wp_add_inline_script(
			'stillframe-admin-bar',
			'window.StillframeCapture = window.StillframeCapture || {}; window.StillframeCapture.config = ' . wp_json_encode( $config ) . ';',
			'before'
		);

		if ( $this->is_tools_screen() ) {
			wp_enqueue_style( 'stillframe-capture-panel' );
			wp_register_style(
				'stillframe-tools',
				$base . 'assets/css/stillframe-tools.css',
				array(),
				STILLFRAME_VERSION
			);
			wp_enqueue_style( 'stillframe-tools' );

			wp_register_script(
				'stillframe-modern-screenshot',
				$base . 'assets/js/vendor/modern-screenshot.js',
				array(),
				STILLFRAME_VERSION,
				true
			);
			wp_enqueue_script( 'stillframe-modern-screenshot' );
			wp_enqueue_script( 'stillframe-annotation-editor' );
			wp_enqueue_script( 'stillframe-capture-panel' );

			wp_register_script(
				'stillframe-tools',
				$base . 'assets/js/stillframe-tools.js',
				array( 'stillframe-capture-panel', 'stillframe-modern-screenshot' ),
				STILLFRAME_VERSION,
				true
			);
			wp_enqueue_script( 'stillframe-tools' );

			$tools_data = array(
				'homeUrl'    => home_url( '/' ),
				'siteName'   => sanitize_file_name( get_bloginfo( 'name' ) ? get_bloginfo( 'name' ) : 'site' ),
				'ajaxUrl'    => admin_url( 'admin-ajax.php' ),
				'mediaNonce' => wp_create_nonce( 'stillframe_save_media' ),
				'canUpload'  => current_user_can( 'upload_files' ),
				'pages'      => $this->site_pages(),
			);
			wp_add_inline_script(
				'stillframe-tools',
				'window.StillframeToolsData = ' . wp_json_encode( $tools_data ) . ';',
				'before'
			);
		}

		/**
		 * Fires when Stillframe has prepared the capture panel for an administrator.
		 *
		 * The panel markup is built in the browser after the admin bar item is opened.
		 * Stillframe does not print the panel from PHP.
		 */
		do_action( 'stillframe_capture_panel_rendered' );
	}

	/**
	 * Retrieve a list of published pages and posts for quick selection.
	 *
	 * @return array<int, array{id: int, title: string, type: string, url: string}>
	 */
	private function site_pages() {
		$cached = get_transient( self::PAGES_TRANSIENT );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		$items = array();
		$pages = get_posts(
			array(
				'post_type'      => array( 'page', 'post' ),
				'post_status'    => 'publish',
				'posts_per_page' => 25,
				'orderby'        => 'title',
				'order'          => 'ASC',
			)
		);
		foreach ( $pages as $p ) {
			$permalink = get_permalink( $p );
			if ( $permalink ) {
				$items[] = array(
					'id'    => (int) $p->ID,
					'title' => $p->post_title ? $p->post_title : __( '(No title)', 'stillframe' ),
					'type'  => $p->post_type,
					'url'   => $permalink,
				);
			}
		}
		set_transient( self::PAGES_TRANSIENT, $items, 12 * HOUR_IN_SECONDS );
		return $items;
	}

	/**
	 * Drop the cached page list when content changes.
	 *
	 * @return void
	 */
	public static function flush_pages_cache() {
		delete_transient( self::PAGES_TRANSIENT );
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

		// Read-only screen check; nothing is changed by this request.
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
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
	 * Strings for the capture panel. They are inserted with textContent in the browser, so they are not HTML-escaped here.
	 *
	 * @return array<string, string>
	 */
	private function script_strings() {
		return array(
			'heading'         => __( 'Capture this screen', 'stillframe' ),
			'close'           => __( 'Close', 'stillframe' ),
			'screen'          => __( 'This screen', 'stillframe' ),
			'width'           => __( 'Width', 'stillframe' ),
			'custom'          => __( 'Custom', 'stillframe' ),
			'customWidth'     => __( 'Custom width', 'stillframe' ),
			'scale'           => __( 'Export scale', 'stillframe' ),
			'capture'         => __( 'Capture', 'stillframe' ),
			'captureWindow'   => __( 'Capture current window', 'stillframe' ),
			'capturingWidth'  => __( 'Reloading this page at the chosen width.', 'stillframe' ),
			'download'        => __( 'Download', 'stillframe' ),
			'saveMedia'       => __( 'Save to Media', 'stillframe' ),
			'savingMedia'     => __( 'Saving to the Media Library.', 'stillframe' ),
			'savedMedia'      => __( 'Saved to Media', 'stillframe' ),
			'viewMedia'       => __( 'View in Media', 'stillframe' ),
			'mediaFailed'     => __( 'The media save failed. The page was not changed.', 'stillframe' ),
			'pen'             => __( 'Pen', 'stillframe' ),
			'circle'          => __( 'Circle', 'stillframe' ),
			'arrow'           => __( 'Arrow', 'stillframe' ),
			'undo'            => __( 'Undo', 'stillframe' ),
			'clear'           => __( 'Clear', 'stillframe' ),
			'tools'           => __( 'Annotation tools', 'stillframe' ),
			'capturedAlt'     => __( 'Captured screen', 'stillframe' ),
			'frameTitle'      => __( 'Stillframe capture frame', 'stillframe' ),
			'capturing'       => __( 'Capturing this screen.', 'stillframe' ),
			/* translators: 1: width in CSS pixels, 2: export scale. */
			'captured'        => __( 'Captured at %1$d pixels wide and %2$dx. Draw on the picture, then download the PNG.', 'stillframe' ),
			'preparing'       => __( 'Preparing the PNG.', 'stillframe' ),
			'assetsFailed'    => __( 'Stillframe could not load the capture tools. The page was not changed.', 'stillframe' ),
			'captureFailed'   => __( 'The capture failed. The page was not changed.', 'stillframe' ),
			'captureTimeout'  => __( 'The capture timed out. The page was not changed.', 'stillframe' ),
			'frameBlocked'    => __( 'The frame was blocked, so only the current window can be captured. The page was not changed.', 'stillframe' ),
			'invalidWidth'    => __( 'Enter a whole number from 320 to 2560. The page was not changed.', 'stillframe' ),
			'downloadFailed'  => __( 'The download failed. The page was not changed.', 'stillframe' ),
			'libraryMissing'  => __( 'The capture tool did not load. The page was not changed.', 'stillframe' ),
			'snipHint'        => __( 'Drag to select an area', 'stillframe' ),
			'snipHintWindow'  => __( 'Click a section of the page to capture it', 'stillframe' ),
			'snipRect'        => __( 'Area', 'stillframe' ),
			'snipWindow'      => __( 'Window', 'stillframe' ),
			'snipFull'        => __( 'Full screen', 'stillframe' ),
			'capturingShort'  => __( 'Capturing…', 'stillframe' ),
			'queued'          => __( 'Almost there. This will finish as soon as the capture is ready.', 'stillframe' ),
			'downloaded'      => __( 'Downloaded.', 'stillframe' ),
			'colors'          => __( 'Color', 'stillframe' ),
			'thickness'       => __( 'Line thickness', 'stillframe' ),
			'topBar'          => __( 'Top bar', 'stillframe' ),
			'sideMenu'        => __( 'Side menu', 'stillframe' ),
			'pluginsClean'    => __( 'Hide other plugins', 'stillframe' ),
			'notices'         => __( 'Admin notices', 'stillframe' ),
			'cancel'          => __( 'Cancel', 'stillframe' ),
			'more'            => __( 'More', 'stillframe' ),
			'topBarHelp'      => __( 'Include the top bar', 'stillframe' ),
			'sideMenuHelp'    => __( 'Include the side menu', 'stillframe' ),
			'directPage'      => __( 'Direct Page', 'stillframe' ),
			'recent'          => __( 'Recent', 'stillframe' ),
			'devices'         => __( 'Devices', 'stillframe' ),
		);
	}

	/**
	 * Focus style for the admin bar item.
	 *
	 * @return string
	 */
	private function admin_bar_css() {
		return '#wpadminbar #wp-admin-bar-stillframe-capture>.ab-item,#wpadminbar #wp-admin-bar-stillframe-capture>.ab-item:hover,#wpadminbar #wp-admin-bar-stillframe-capture>.ab-item:focus{outline:none;box-shadow:none;border:0;}#wpadminbar #wp-admin-bar-stillframe-capture .ab-icon{margin-right:0;}#wpadminbar #wp-admin-bar-stillframe-capture .ab-icon:before{content:"\\f306";top:2px;}#wpadminbar #wp-admin-bar-stillframe-capture .screen-reader-text{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}.stillframe-snip{position:fixed;inset:0;z-index:1000000;margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;line-height:1.4}.stillframe-snip *{box-sizing:border-box}.stillframe-snip__shade{position:absolute;inset:0;cursor:crosshair;background:rgba(0,40,54,.5)}.stillframe-snip__bar{position:fixed;top:16px;left:0;right:0;z-index:6;display:flex;align-items:center;gap:2px;width:max-content;max-width:calc(100vw - 16px);margin:0 auto;padding:5px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 24px rgba(15,23,42,.22),0 1px 2px rgba(15,23,42,.1)}.stillframe-snip.has-admin-bar .stillframe-snip__bar{top:48px}.stillframe-snip--boot .stillframe-snip__bar button{pointer-events:none}.stillframe-snip__bar button{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:36px;min-width:36px;margin:0;padding:0 13px;color:#374151;font:inherit;font-size:13px;font-weight:600;line-height:1;white-space:nowrap;background:transparent;border:1px solid transparent;border-radius:8px}.stillframe-snip__bar button[aria-pressed="true"]{color:#005976;background:#e6f4f8;border-color:#b8dde8}.stillframe-snip__bar svg{display:block;flex:0 0 auto}.stillframe-snip__bar .stillframe-snip__close{width:36px;padding:0;color:#6b7280}.stillframe-snip__sep{width:1px;height:20px;margin:0 5px;background:#e5e7eb}.stillframe-snip__hint{position:fixed;top:72px;left:0;right:0;z-index:6;width:max-content;max-width:calc(100vw - 16px);margin:0 auto;padding:6px 12px;color:#374151;font-size:12.5px;font-weight:600;white-space:nowrap;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 14px rgba(15,23,42,.18)}.stillframe-snip.has-admin-bar .stillframe-snip__hint{top:104px}@media(max-width:560px){.stillframe-btn__label{display:none}.stillframe-snip__bar button{padding:0 10px}}';
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
