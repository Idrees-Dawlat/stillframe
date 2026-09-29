# Stillframe

Plugin and theme authors need a picture of the screen they are already looking at, at a phone, tablet, or desktop width. Stillframe adds an admin-bar item for administrators. It captures that screen at the chosen width and pixel density, lets you draw on the picture, and downloads a PNG.

The capture loads the current URL in a hidden frame at the width you pick, so the page reflows instead of stretching a desktop bitmap. You can mark the picture with a pen, a circle, or an arrow, undo the last mark, or clear every mark. The PNG is flattened only when you download it.

Phone is 390 pixels wide, iPad is 834, and desktop is 1440. A custom width can be any whole number from 320 to 2560. Export scale is 1x, 2x, or 3x. The default scale is 2x.

The downloaded file is named `stillframe-{slug}-{width}w-{scale}x.png`. The slug comes from the path. If the path has no letters or numbers, the name uses `screen`.

Stillframe does not save the picture on the site, does not add a settings screen, and does not load for logged-out visitors. If the page refuses to be framed, Stillframe says so and can capture the current window only. It does not retry with a workaround. If capture fails, the page is left as it was.

## Installation

1. Upload the `stillframe` folder to `/wp-content/plugins/`, or install the zip through the Plugins screen.
2. Activate Stillframe through the Plugins screen.
3. Open a front-end page or a wp-admin screen while logged in as an administrator, and choose Stillframe in the admin bar.

## Requirements

- WordPress 6.4 or newer
- PHP 7.4 or newer

## What this version does not do

- It does not write to the database or the media library.
- It does not add a settings screen, a dashboard widget, or a public button.
- It does not send data off the site.
- It does not load for anyone who cannot manage options.

## Author

Grafucci

## License

GPL-2.0-or-later. See `LICENSE`.

The capture library in `assets/js/vendor/modern-screenshot.js` is MIT licensed. See `assets/js/vendor/LICENSE-modern-screenshot.txt`.
