=== Stillframe – Screenshot Capture & Markup ===
Contributors: idreesdawlat
Tags: screenshot, capture, annotate, media library, png
Requires at least: 6.4
Tested up to: 7.1
Stable tag: 0.1.8
Requires PHP: 7.4
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Capture a screen region, draw on it, and download a PNG or save it to your Media Library.

== Description ==

Stillframe lets you take screenshots of your WordPress admin area or front-end pages directly inside the browser. It adds a camera icon to the top admin bar and a page under Tools.

You can select a specific region of the screen, adjust the selection with handles, capture the full page, or capture the active window. You can also preview the page at standard screen widths (mobile, tablet, desktop) and hide admin menus or other plugins to get a clean shot.

After taking a screenshot, draw on it using the pen, circle, or arrow tools, choose colors and line weights, and export at 1x, 2x, or 3x scale. Images can be downloaded to your computer or saved straight into your WordPress Media Library.

Stillframe runs entirely in your browser. It does not send any data to external servers, adds no settings pages to your database, and only loads for logged-in administrators.

== Installation ==

1. Go to Plugins > Add New in your WordPress dashboard.
2. Search for Stillframe and click Install Now.
3. Activate the plugin.
4. Click the camera icon in the top admin bar, or go to Tools > Stillframe to start capturing.

== Screenshots ==

1. Launch Stillframe from the admin bar to select Area, Window, or Full screen capture.
2. Drag and resize your capture region with pixel dimensions.
3. Annotate your screenshot with pen, circle, arrow tools, and save to Media Library or download.

== Frequently Asked Questions ==

= Who can use Stillframe? =
Only logged-in users with the manage_options capability (administrators). Logged-out visitors do not load any scripts or CSS from this plugin.

= Does Stillframe store images on my server? =
Only if you click Save to Media, which adds one PNG to your Media Library. Downloading saves the image straight to your computer without saving anything to the site or database.

= Does it send data to any outside service? =
No. Rendering and markup happen completely in your browser.

= Does Stillframe leave data in the database? =
No. It does not write options, tables, or transients to your database.

== Development ==

Stillframe is open-source software. You can view the source code, contribute, or submit feedback on [GitHub](https://github.com/Idrees-Dawlat/stillframe).

== Third-party code ==

Stillframe bundles modern-screenshot 4.7.0 (MIT license) as assets/js/vendor/modern-screenshot.js. Source: https://github.com/qq15725/modern-screenshot. The license text is in assets/js/vendor/LICENSE-modern-screenshot.txt.

== Changelog ==

= 0.1.8 =
* Refined selection tool with clean native white UI, crisp line edge handles, and square corner anchors
* Selection dimensions are cleanly integrated into the floating actions bar
* Window mode now highlights and selects the element first, allowing precision resizing before capture
* Prevented accidental double-click captures: capture only triggers via the Capture button or Enter key
* Prevent background page scrolling while the capture tool or preview modal is open
* Clicking outside the preview modal on the backdrop overlay now cleanly closes it

= 0.1.7 =
* New: after dragging, move or resize the selection with handles, then press Enter or choose Capture
* Fixed garbled text in captures when a plugin uses an image as CSS content
* Fixed the area selection stuttering when the capture toolbar first opens: the background page render now waits until the pointer is idle and is skipped on very heavy pages
* Readme, translation and code-standards cleanup for the WordPress.org review

= 0.1.6 =
* Fixed the Area, Window and Full screen buttons not responding
* Snip overlay, hint and selection now use the brand teal and white look
* Saving to Media and downloading now show a clear floating notice with a View in Media button

= 0.1.5 =
* Toolbar no longer jumps from the right to the center when it opens
* Smoother area dragging: one dim layer instead of four, and the page render waits until the pointer is idle
* Restyled to light surfaces and brand teal, no purple

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
