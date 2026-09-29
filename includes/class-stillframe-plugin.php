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
		$this->media->register();
		$this->tools->register();
		add_action( 'admin_bar_menu', array( $this->menu, 'register' ), 100 );
		add_action( 'wp_enqueue_scripts', array( $this->assets, 'enqueue' ) );
		add_action( 'admin_enqueue_scripts', array( $this->assets, 'enqueue' ) );
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
