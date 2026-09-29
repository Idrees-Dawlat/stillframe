<?php
/**
 * Capability gate for Stillframe.
 *
 * @package Stillframe
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Decides whether the current request may receive Stillframe.
 */
class Stillframe_Capability_Check {

	/**
	 * Administrators only. Logged-out visitors fail this check.
	 *
	 * @return bool
	 */
	public static function user_can_capture() {
		return is_user_logged_in() && current_user_can( 'manage_options' );
	}
}

/**
 * Whether the current user may open Stillframe.
 *
 * @return bool
 */
function stillframe_user_can_capture() {
	return Stillframe_Capability_Check::user_can_capture();
}
