# Stillframe

Plugin and theme authors need a picture of the screen they are already looking at. Stillframe adds a camera icon in the admin bar, and a Stillframe item under Tools. Drag a region, like the Windows snipping tool, or capture the full view. You can include the top bar and the side menu, or hide other plugins so the shot looks like a clean WordPress install. Draw on the picture, then download a PNG or save it to the Media Library.

Phone, iPad, and Desktop reload the page at 390, 834, or 1440 pixels so the layout reflows. This screen does not reload the page. Export scale is 1x, 2x, or 3x. The default scale is 1x.

The file is named `stillframe-{slug}-{width}w-{scale}x.png`. The slug comes from the path. If the path has no letters or numbers, the name uses `screen`.

Tools, then Stillframe, starts a capture. The choices stay in the browser and are not saved as plugin settings. Stillframe does not load for logged-out visitors. If a reflowed page refuses to be framed, Stillframe says so. If capture fails, the page is left as it was.

## Installation

1. Upload the `stillframe` folder to `/wp-content/plugins/`, or install the zip through the Plugins screen.
2. Activate Stillframe through the Plugins screen.
3. Open a front-end page or a wp-admin screen while logged in as an administrator, and choose the camera icon in the top bar, or open Tools and then Stillframe.

## Requirements

- WordPress 6.4 or newer
- PHP 7.4 or newer

## What this version does not do

- It does not add plugin settings to the database. A PNG saved with Save to Media is a normal Media Library attachment.
- It does not add a settings form, a dashboard widget, or a public button. Tools, then Stillframe, only starts a capture.
- It does not send data off the site.
- It does not load for anyone who cannot manage options.

## Author

Grafucci

## License

GPL-2.0-or-later. See `LICENSE`.

The capture library in `assets/js/vendor/modern-screenshot.js` is MIT licensed. See `assets/js/vendor/LICENSE-modern-screenshot.txt`.
