<?php
/**
 * Save a capture into the Media Library.
 *
 * @package Stillframe
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Accepts one PNG from an administrator and stores it as an attachment.
 */
class Stillframe_Media {

	/**
	 * Register the logged-in AJAX handler.
	 *
	 * @return void
	 */
	public function register() {
		add_action( 'wp_ajax_stillframe_save_media', array( $this, 'save' ) );
	}

	/**
	 * Store the uploaded PNG and return its attachment URL.
	 *
	 * @return void
	 */
	public function save() {
		if ( ! stillframe_user_can_capture() || ! current_user_can( 'upload_files' ) ) {
			wp_send_json_error(
				array(
					'message' => __( 'You cannot save this capture.', 'stillframe' ),
				),
				403
			);
		}

		check_ajax_referer( 'stillframe_save_media', 'nonce' );

		// Nonce and capability are verified above; the upload is validated below.
		// phpcs:disable WordPress.Security.NonceVerification.Missing, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized, WordPress.Security.ValidatedSanitizedInput.MissingUnslash
		if ( empty( $_FILES['image'] ) || ! is_array( $_FILES['image'] ) ) {
			$this->fail();
		}

		$file = $_FILES['image'];
		if ( ! isset( $file['error'], $file['tmp_name'], $file['size'], $file['name'] ) ) {
			$this->fail();
		}

		if ( UPLOAD_ERR_OK !== (int) $file['error'] ) {
			$this->fail();
		}

		$size = (int) $file['size'];
		if ( $size < 1 || $size > 32 * MB_IN_BYTES ) {
			$this->fail();
		}

		$tmp_name = $file['tmp_name'];
		if ( ! is_string( $tmp_name ) || '' === $tmp_name || ! is_uploaded_file( $tmp_name ) ) {
			$this->fail();
		}

		$name = $this->png_filename( wp_unslash( $file['name'] ) );

		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';

		$checked = wp_check_filetype_and_ext(
			$tmp_name,
			$name,
			array(
				'png' => 'image/png',
			)
		);

		if ( empty( $checked['ext'] ) || 'png' !== $checked['ext'] || 'image/png' !== $checked['type'] ) {
			$this->fail();
		}

		$_FILES['image']['name'] = $name;

		$moved = wp_handle_upload(
			$_FILES['image'],
			array(
				'test_form' => false,
				'mimes'     => array(
					'png' => 'image/png',
				),
			)
		);

		// phpcs:enable

		if ( ! is_array( $moved ) || empty( $moved['file'] ) || ! empty( $moved['error'] ) ) {
			$this->fail();
		}

		$attachment_id = wp_insert_attachment(
			array(
				'post_mime_type' => 'image/png',
				'post_title'     => sanitize_text_field( pathinfo( $name, PATHINFO_FILENAME ) ),
				'post_content'   => '',
				'post_status'    => 'inherit',
			),
			$moved['file']
		);

		if ( is_wp_error( $attachment_id ) || ! $attachment_id ) {
			$this->fail();
		}

		add_filter( 'intermediate_image_sizes_advanced', '__return_empty_array', 99 );
		add_filter( 'big_image_size_threshold', '__return_false', 99 );
		try {
			$metadata = wp_generate_attachment_metadata( $attachment_id, $moved['file'] );
		} finally {
			remove_filter( 'intermediate_image_sizes_advanced', '__return_empty_array', 99 );
			remove_filter( 'big_image_size_threshold', '__return_false', 99 );
		}
		if ( is_array( $metadata ) ) {
			wp_update_attachment_metadata( $attachment_id, $metadata );
		}

		$edit_url = get_edit_post_link( $attachment_id, 'raw' );
		$url      = wp_get_attachment_url( $attachment_id );

		wp_send_json_success(
			array(
				'id'      => (int) $attachment_id,
				'url'     => is_string( $url ) ? $url : '',
				'editUrl' => is_string( $edit_url ) ? $edit_url : '',
			)
		);
	}

	/**
	 * Keep a safe PNG filename, or fall back to a generated one.
	 *
	 * @param mixed $raw Original upload name.
	 * @return string
	 */
	private function png_filename( $raw ) {
		$name = is_string( $raw ) ? sanitize_file_name( $raw ) : '';
		$name = strtolower( $name );

		if ( ! preg_match( '/^[a-z0-9][a-z0-9._-]*\.png$/', $name ) ) {
			$name = 'stillframe-' . gmdate( 'Ymd-His' ) . '.png';
		}

		return $name;
	}

	/**
	 * Reply with a generic failure and stop.
	 *
	 * @return void
	 */
	private function fail() {
		wp_send_json_error(
			array(
				'message' => __( 'The media save failed. The page was not changed.', 'stillframe' ),
			),
			400
		);
	}
}
