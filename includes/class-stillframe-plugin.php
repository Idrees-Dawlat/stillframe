<?php
/**
 * Plugin bootstrap.
 *
 * @package Stillframe
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Wires the admin bar item and asset loader.
 */
class Stillframe_Plugin {

	/**
	 * Admin bar registration.
	 *
	 * @var Stillframe_Admin_Bar_Menu
	 */
	private $menu;

	/**
	 * Script and style loader.
	 *
	 * @var Stillframe_Asset_Loader
	 */
	private $assets;

	/**
	 * Constructor.
	 */
	public function __construct() {
		$this->menu   = new Stillframe_Admin_Bar_Menu();
		$this->assets = new Stillframe_Asset_Loader();
	}

	/**
	 * Register hooks. Capability is checked inside each callback.
	 *
	 * @return void
	 */
	public function init() {
		add_action( 'init', array( $this, 'load_textdomain' ) );
		add_action( 'admin_bar_menu', array( $this->menu, 'register' ), 100 );
		add_action( 'wp_enqueue_scripts', array( $this->assets, 'enqueue' ) );
		add_action( 'admin_enqueue_scripts', array( $this->assets, 'enqueue' ) );
	}

	/**
	 * Load translations from the plugin languages directory.
	 *
	 * @return void
	 */
	public function load_textdomain() {
		load_plugin_textdomain(
			'stillframe',
			false,
			dirname( plugin_basename( STILLFRAME_FILE ) ) . '/languages'
		);
	}
}

/**
 * Start Stillframe.
 *
 * @return void
 */
function stillframe_bootstrap() {
	$plugin = new Stillframe_Plugin();
	$plugin->init();
}
