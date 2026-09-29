<?php
/**
 * Plugin Name: Stillframe
 * Description: Capture a plugin screen, a theme, or any page at phone, tablet, or a custom width, mark it up, and download a PNG.
 * Version: 0.1.0
 * Requires at least: 6.4
 * Requires PHP: 7.4
 * Author: Grafucci
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

define( 'STILLFRAME_VERSION', '0.1.0' );
define( 'STILLFRAME_FILE', __FILE__ );
define( 'STILLFRAME_DIR', plugin_dir_path( __FILE__ ) );

require_once STILLFRAME_DIR . 'includes/class-stillframe-capability-check.php';
require_once STILLFRAME_DIR . 'includes/class-stillframe-admin-bar-menu.php';
require_once STILLFRAME_DIR . 'includes/class-stillframe-asset-loader.php';
require_once STILLFRAME_DIR . 'includes/class-stillframe-plugin.php';

stillframe_bootstrap();
