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
 * Wires the admin bar item, Tools screen, and asset loader.
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
	 * Media Library save handler.
	 *
	 * @var Stillframe_Media
	 */
	private $media;

	/**
	 * Tools submenu.
	 *
	 * @var Stillframe_Tools_Page
	 */
	private $tools;

	/**
	 * Constructor.
	 */
	public function __construct() {
		$this->menu   = new Stillframe_Admin_Bar_Menu();
		$this->assets = new Stillframe_Asset_Loader();
		$this->media  = new Stillframe_Media();
		$this->tools  = new Stillframe_Tools_Page();
	}

	/**
	 * Register hooks. Capability is checked inside each callback.
	 *
	 * @return void
	 */
	public function init() {
		add_action( 'init', array( $this, 'load_textdomain' ) );
		$this->media->register();
		$this->tools->register();
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
