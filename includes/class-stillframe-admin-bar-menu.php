<?php
/**
 * Admin bar item for Stillframe.
 *
 * @package Stillframe
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Adds one admin bar node. The node has no external URL.
 */
class Stillframe_Admin_Bar_Menu {

	/**
	 * Register the admin bar node for administrators.
	 *
	 * @param WP_Admin_Bar $wp_admin_bar Admin bar instance.
	 * @return void
	 */
	public function register( $wp_admin_bar ) {
		if ( ! stillframe_user_can_capture() || ! is_admin_bar_showing() ) {
			return;
		}

		$wp_admin_bar->add_node(
			array(
				'id'     => 'stillframe-capture',
				'parent' => 'top-secondary',
				'title'  => esc_html__( 'Stillframe', 'stillframe' ),
				'href'   => '#stillframe-capture',
				'meta'   => array(
					'class' => 'stillframe-admin-bar-node',
					'title' => __( 'Capture this screen', 'stillframe' ),
				),
			)
		);
	}
}
