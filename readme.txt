=== Stillframe – Screenshot Capture & Markup ===
Contributors: grafucci
Tags: screenshot, capture, annotate, media library, png
Requires at least: 6.4
Tested up to: 7.1
Stable tag: 0.1.7
Requires PHP: 7.4
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Drag a region of the screen you are looking at, mark it up, then download a PNG or save it to the Media Library.

== Description ==

Plugin and theme authors need a picture of the screen they are already looking at. Stillframe adds a camera icon in the top bar and a Stillframe page under Tools.

Drag a region, then move or resize it before you capture, or capture the full view. Phone, iPad, and Desktop are under Widths and reload the page at 390, 834, or 1440 pixels. You can include the top bar and the side menu, or hide other plugins so the shot looks like a fresh WordPress install. Draw on the picture, then download a PNG or save it to the Media Library.

Export scale is 1x, 2x, or 3x. The default scale is 1x.

The downloaded file is named `stillframe-{slug}-{width}w-{scale}x.png`. The slug comes from the path. If the path has no letters or numbers, the name uses `screen`.

Stillframe does not save the picture on the site, does not add a settings screen, and does not load for logged-out visitors. If the page refuses to be framed, Stillframe says so and can capture the current window only. It does not retry with a workaround. If capture fails, the page is left as it was.


== Installation ==

1. Upload the `stillframe` folder to `/wp-content/plugins/`, or install the zip through the Plugins screen.
2. Activate Stillframe through the Plugins screen.
3. Open a front-end page or a wp-admin screen while logged in as an administrator, and choose the camera icon in the top bar, or open Tools and then Stillframe.

== Frequently Asked Questions ==

= Who can use Stillframe? =

Only a logged-in user with the `manage_options` capability. Logged-out visitors receive no HTML, CSS, or JavaScript from this plugin.

= Does it store the PNG on the site? =

Only if you choose Save to Media. That stores one PNG in the Media Library. Download saves the file on your computer and does not write to the site. Stillframe does not write options, posts, tables, or transients.

= What happens if the frame is blocked? =

The panel says the frame was blocked and that the page was not changed. You can capture the current window only. Stillframe does not try to bypass framing rules.

= Will every image be in the PNG? =

A cross-origin image may be omitted. Stillframe does not proxy images through PHP.

= Is there a settings screen? =

Tools, then Stillframe, starts a capture. Width, scale, the top bar, the side menu, and which plugins stay visible are chosen each time. Those choices are remembered in the browser. Stillframe does not write plugin settings to the database.

== Third-party code ==

Stillframe bundles modern-screenshot 4.7.0 (MIT license) as `assets/js/vendor/modern-screenshot.js`. Source: https://github.com/qq15725/modern-screenshot. The license text is in `assets/js/vendor/LICENSE-modern-screenshot.txt`. It runs in the browser and sends nothing to any outside service.

== Changelog ==

= 0.1.7 =
* New: after dragging, move or resize the selection with handles, then press Enter or choose Capture
* Fixed garbled text in captures when a plugin uses an image as CSS content
* Fixed the area selection stuttering when the capture toolbar first opens: the background page render now waits until the pointer is idle and is skipped on very heavy pages
* Readme, translation and code-standards cleanup for the WordPress.org review

= 0.1.6 =
* Fixed the Area, Window and Full screen buttons not responding
* Snip overlay, hint and selection now use the Grafucci teal and white look
* Saving to Media and downloading now show a clear floating notice with a View in Media button

= 0.1.5 =
* Toolbar no longer jumps from the right to the center when it opens
* Smoother area dragging: one dim layer instead of four, and the page render waits until the pointer is idle
* Restyled to the Grafucci look: light surfaces and brand teal, no purple

= 0.1.4 =
* Redesigned capture toolbar with Area, Window and Full screen; the freeform snip is gone
* The result window opens the moment you finish selecting, with Download and Save to Media ready. The page is rendered in the background while you choose, and a click before it is ready finishes automatically
* Downloading or saving an unmarked capture no longer re-renders it
* Fixed scrolled and full screen captures: plugin icon fonts and images now render, fixed elements such as the top bar and side menu stay in place, and the layout no longer shifts
* New markup tools: color palette, three line thicknesses, smoother pen, a cleaner arrow, Shift to draw circles and 45 degree arrows, keyboard shortcuts (P, C, A, Ctrl+Z)

= 0.1.3 =
* Match the capture overlay to the Windows snipping toolbar
* Keep drag selection smooth by capturing only after you release

= 0.1.2 =
* remove the orange outline on the top bar capture control
* speed up screen capture and saving a PNG to the Media Library
* add a camera icon in the top bar and a Stillframe screen under Tools
* add a drag-to-select capture area
* add choices for the top bar, the side menu, and a clean WordPress view without other plugins

= 0.1.1 =
* The capture controls are a small toolbar, so the page stays visible.
* This screen captures the current view without reloading the page.
* Save the PNG to the Media Library, or download it.

= 0.1.0 =
* First release. Administrators can capture the current screen at phone, iPad, desktop, or a custom width, draw with pen, circle, and arrow, and download a PNG.
