<?php
/**
 * Plugin Name: Stillframe – Screenshot Capture & Markup
 * Plugin URI: https://grafucci.com/stillframe/
 * Description: Capture multi-device screenshots (Desktop, Tablet, Mobile) or custom regions, mark them up with rich annotation tools, and export to PNG or Media Library.
 * Version: 0.2.1
 * Requires at least: 6.4
 * Requires PHP: 7.4
 * Author: Grafucci
 * Author URI: https://grafucci.com/
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: stillframe
 * Domain Path: /languages
 *
 * @package Stillframe
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'STILLFRAME_VERSION', '0.2.1' );
define( 'STILLFRAME_FILE', __FILE__ );
define( 'STILLFRAME_DIR', plugin_dir_path( __FILE__ ) );
// Asset query string follows the newest file, so updated scripts and styles are never served from a stale browser cache.
define( 'STILLFRAME_ASSET_VER', STILLFRAME_VERSION . '.' . max( (int) filemtime( STILLFRAME_DIR . 'assets/js/stillframe-capture-panel.js' ), (int) filemtime( STILLFRAME_DIR . 'assets/js/stillframe-annotation-editor-v2.js' ), (int) filemtime( STILLFRAME_DIR . 'assets/css/stillframe-capture-panel.css' ) ) );

require_once STILLFRAME_DIR . 'includes/class-stillframe-capability-check.php';
require_once STILLFRAME_DIR . 'includes/class-stillframe-admin-bar-menu.php';
require_once STILLFRAME_DIR . 'includes/class-stillframe-asset-loader.php';
require_once STILLFRAME_DIR . 'includes/class-stillframe-media.php';
require_once STILLFRAME_DIR . 'includes/class-stillframe-tools-page.php';
require_once STILLFRAME_DIR . 'includes/class-stillframe-plugin.php';

stillframe_bootstrap();
