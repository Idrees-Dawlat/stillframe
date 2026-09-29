<?php
/**
 * Uninstall Stillframe.
 *
 * Stillframe does not create options or tables.
 * PNGs saved to the Media Library are normal attachments and are left in place.
 * This file intentionally does not delete site data.
 *
 * @package Stillframe
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
