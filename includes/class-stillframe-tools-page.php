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
 * Adds Stillframe under Tools. Capture itself stays on the current screen.
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
	 * Explain the capture tool and offer a button on this screen.
	 *
	 * @return void
	 */
	public function render() {
		if ( ! stillframe_user_can_capture() ) {
			wp_die( esc_html__( 'You cannot capture this screen.', 'stillframe' ) );
		}

		echo '<div class="wrap">';
		echo '<h1>' . esc_html__( 'Stillframe', 'stillframe' ) . '</h1>';
		echo '<p>' . esc_html__( 'Click Capture, then drag. Esc cancels.', 'stillframe' ) . '</p>';
		echo '<p><span class="dashicons dashicons-camera" aria-hidden="true"></span> ' . esc_html__( 'You can also start a capture from any screen with the camera icon at the top right of the admin bar.', 'stillframe' ) . '</p>';
		echo '<p class="description">' . esc_html__( 'After you drag, move or resize the selection, then press Enter or choose Capture.', 'stillframe' ) . '</p>';
		echo '<p><button type="button" class="button button-primary" id="stillframe-tools-capture">';
		echo esc_html__( 'Capture this screen', 'stillframe' );
		echo '</button></p>';
		echo '</div>';
	}
}
